import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type { FormDefinition } from "@/features/forms/types";
import { attributeToQuestionValue, questionToAttributeValue } from "./mapping";

type DB = Awaited<ReturnType<typeof createClient>>;
type FieldType = Parameters<typeof attributeToQuestionValue>[0];

/** Questions liées à un attribut d'objet : 1re cellule (lineage) + choix de l'option. */
function attributeCells(definition: FormDefinition, rubricLineageId?: string) {
  const out: { attributeId: string; lineageId: string; choices: string[] }[] = [];
  for (const r of definition.rubrics) {
    if (rubricLineageId && r.lineageId !== rubricLineageId) continue;
    for (const q of r.questions) {
      const cell = q.options[0];
      if (q.objectAttributeId && cell) out.push({ attributeId: q.objectAttributeId, lineageId: cell.lineageId, choices: cell.choices ?? [] });
    }
  }
  return out;
}

/** Objet technique lié à la réponse (form_block_links.technical_object_id) et fuseau de son compte. */
async function linkedObject(supabase: DB, blockLinkId: string | null) {
  if (!blockLinkId) return null;
  const { data: link } = await supabase.from("form_block_links").select("technical_object_id").eq("id", blockLinkId).maybeSingle();
  if (!link?.technical_object_id) return null;
  const { data: obj } = await supabase.from("technical_objects").select("id, account:accounts(time_zone)").eq("id", link.technical_object_id).maybeSingle();
  if (!obj) return null;
  return { id: obj.id, timeZone: (obj.account as { time_zone: string } | null)?.time_zone ?? "Europe/Paris" };
}

/** Pré-remplissage : valeur actuelle de l'attribut de l'objet pour chaque question liée (cellule lineage → valeur). */
export async function objectAttributePrefill(supabase: DB, response: { block_link_id: string | null }, definition: FormDefinition): Promise<Record<string, unknown>> {
  const cells = attributeCells(definition);
  if (!cells.length) return {};
  const obj = await linkedObject(supabase, response.block_link_id);
  if (!obj) return {};
  const [{ data: fields }, { data: values }] = await Promise.all([
    supabase.from("custom_fields").select("id, type").in("id", cells.map((c) => c.attributeId)),
    supabase.from("custom_field_values").select("custom_field_id, value_text, value_json").eq("object_id", obj.id).in("custom_field_id", cells.map((c) => c.attributeId)),
  ]);
  const out: Record<string, unknown> = {};
  for (const c of cells) {
    const type = fields?.find((f) => f.id === c.attributeId)?.type as FieldType | undefined;
    const v = values?.find((x) => x.custom_field_id === c.attributeId);
    if (!type || !v) continue;
    const raw = Array.isArray(v.value_json) ? (v.value_json as string[]) : v.value_text;
    const value = attributeToQuestionValue(type, raw, c.choices, obj.timeZone);
    if (value !== null && !(Array.isArray(value) && !value.length)) out[c.lineageId] = value;
  }
  return out;
}

/**
 * Après sauvegarde d'une rubrique : écrit les valeurs des questions liées dans les attributs de l'objet
 * (custom_field_values, historisées par trigger avec la réponse comme origine).
 */
export async function writeObjectAttributes(supabase: DB, response: { id: string; block_link_id: string | null }, definition: FormDefinition,
  rubricLineageId: string, saved: Record<string, unknown>): Promise<string | null> {
  const cells = attributeCells(definition, rubricLineageId).filter((c) => c.lineageId in saved);
  if (!cells.length) return null;
  const obj = await linkedObject(supabase, response.block_link_id);
  if (!obj) return null;
  const { data: fields } = await supabase.from("custom_fields").select("id, type").in("id", cells.map((c) => c.attributeId));
  const payload = cells.flatMap((c) => {
    const type = fields?.find((f) => f.id === c.attributeId)?.type as FieldType | undefined;
    if (!type) return [];
    return [{ field_id: c.attributeId, ...questionToAttributeValue(type, saved[c.lineageId], c.choices, obj.timeZone) }];
  });
  if (!payload.length) return null;
  const { error } = await supabase.rpc("technical_object_write_attributes", {
    p_object_id: obj.id, p_response_id: response.id, p_values: payload as unknown as Json,
  });
  return error ? error.message : null;
}
