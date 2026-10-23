"use server";

import { revalidatePath } from "next/cache";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { getSession } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/database.types";
import type { NumberLocale } from "@/lib/formula/engine";
import type { ActiveRedirect, CheckResult } from "../types";
import { buildModel } from "./engine/model";
import {
  cellError, checkResponse, checkValidation, evaluateCell, isFilled, sameJson, typedColumns, type DynamicCtx, type ValuesMap,
} from "./engine/values";
import { loadResponseCore } from "./queries";
import { writeObjectAttributes } from "@/features/library/form-attributes/response-sync";
import { valueTypeOf } from "./engine/model";

export type SaveCell = {
  lineageId: string;
  value: unknown;
  lock?: boolean;
  filesAdded?: unknown[] | null;
  filesRemoved?: unknown[] | null;
};
export type ChangeSignature = { user_id: string; name: string; image_path: string | null; signed_at: string; comment?: string | null };

export async function saveRubric(input: {
  responseId: string;
  rubricLineageId: string;
  cells: SaveCell[];
  observations: Record<string, string | null>;
  activeRedirect: ActiveRedirect | null;
  changeSignature?: ChangeSignature | null;
  lastRubricLineageId?: string | null;
}): Promise<ActionResult<{ changed: number; values: Record<string, unknown> }>> {
  const core = await loadResponseCore(input.responseId);
  if (!core) return fail("not_found");
  const { supabase, response, definition, items, stored } = core;
  const auth = await authorize("FormResponse", "edit", response.project_id);
  if ("error" in auth) return fail(auth.error);
  if (response.state === "done") return fail("response_done");
  const session = await getSession();
  const locale = (session?.organization.number_format ?? "fr") as NumberLocale;

  const model = buildModel(definition, items);
  const rubric = model.rubrics.find((r) => r.def.lineageId === input.rubricLineageId);
  if (!rubric) return fail("not_found");

  // Valeurs fusionnées (base + soumises) pour les contrôles et le recalcul serveur des formules.
  const merged: ValuesMap = {};
  for (const [k, v] of Object.entries(stored)) merged[k] = { value: v.value, locked: v.locked, isValid: v.isValid };
  for (const c of input.cells) merged[c.lineageId] = { value: c.value, locked: merged[c.lineageId]?.locked ?? false };

  let lockedModified = false;
  const payload: Record<string, unknown>[] = [];
  const finalValues: Record<string, unknown> = {};
  for (const c of input.cells) {
    const owner = model.cellByLineage.get(c.lineageId);
    if (!owner || owner.rubric !== rubric) continue;
    const { question, cell } = owner;
    let value = c.value ?? null;
    if (question.type === "formula" && value !== null) {
      const res = evaluateCell(model, rubric, question, cell, merged, (response.dynamic_context ?? {}) as DynamicCtx, locale);
      if (res.ok) value = { result: res.value, unit: cell.opt?.unit };
      merged[c.lineageId] = { value, locked: false };
    }
    if (cellError(question, cell, value, response.created_at)) {
      return fail(question.def.allowBackdating || (question.type !== "date" && question.type !== "datetime") ? "invalid_value" : "backdating",
        { question: question.name });
    }
    const prev = stored[c.lineageId];
    if (prev?.locked && !sameJson(prev.value, value)) lockedModified = true;
    const filled = isFilled(question.type, value, cell);
    const isValid = filled && cell.opt?.validation ? checkValidation(question.type, value, cell.opt.validation) : null;
    const firstCell = question.cells[0]?.lineageId === c.lineageId;
    finalValues[c.lineageId] = value;
    payload.push({
      rubric_lineage_id: rubric.def.lineageId, question_lineage_id: question.lineageId, option_lineage_id: c.lineageId,
      option_code: cell.opt?.code ?? null, coord: cell.coord, question_type: question.type, value_type: valueTypeOf(question.type),
      value_json: value, ...typedColumns(question.type, value),
      observation: firstCell ? input.observations[question.lineageId] ?? null : null,
      is_valid: isValid, lock: !!c.lock, files_added: c.filesAdded?.length ? c.filesAdded : null,
      files_removed: c.filesRemoved?.length ? c.filesRemoved : null,
    });
  }
  // Observations de questions dont la 1re cellule n'a pas été soumise.
  for (const [qLineage, obs] of Object.entries(input.observations)) {
    const q = model.questionByLineage.get(qLineage);
    const first = q?.question.cells[0];
    if (!q || q.rubric !== rubric || !first || payload.some((p) => p.option_lineage_id === first.lineageId)) continue;
    const value = stored[first.lineageId]?.value ?? null;
    payload.push({
      rubric_lineage_id: rubric.def.lineageId, question_lineage_id: qLineage, option_lineage_id: first.lineageId,
      option_code: first.opt?.code ?? null, coord: first.coord, question_type: q.question.type, value_type: valueTypeOf(q.question.type),
      value_json: value, ...typedColumns(q.question.type, value), observation: obs, is_valid: stored[first.lineageId]?.isValid ?? null,
    });
  }

  if (lockedModified) {
    if (!input.changeSignature) return fail("signature_required");
    const unlock = await authorize("FormResponse", "unlock", response.project_id);
    if ("error" in unlock) return fail("forbidden");
  }

  const { data, error } = await supabase.rpc("save_rubric_values", {
    p_response_id: response.id,
    p_rubric_lineage_id: rubric.def.lineageId,
    p_values: payload as unknown as Json,
    p_options: {
      provenance: "webapp", change_signature: input.changeSignature ?? null, auto_lock: definition.lockResponses,
      set_redirect: true, active_redirect: input.activeRedirect, last_rubric_lineage_id: input.lastRubricLineageId ?? rubric.def.lineageId,
    } as unknown as Json,
  });
  if (error) {
    if (error.message?.includes("response_done")) return fail("response_done");
    if (error.message?.includes("locked_value")) return fail("signature_required");
    return fail(dbError(error));
  }
  // Questions liées à un attribut d'objet : écriture dans l'objet technique lié (spec 03 §3.7, historisée).
  await writeObjectAttributes(supabase, response, definition, rubric.def.lineageId, finalValues);
  return ok({ changed: data ?? 0, values: finalValues });
}

/** Mémorise la rubrique courante (navigation sans modification). */
export async function setLastRubric(responseId: string, rubricLineageId: string): Promise<ActionResult> {
  const core = await loadResponseCore(responseId);
  if (!core) return fail("not_found");
  const auth = await authorize("FormResponse", "edit", core.response.project_id);
  if ("error" in auth) return fail(auth.error);
  if (core.response.state === "done") return ok(undefined);
  await core.supabase.from("form_responses").update({ last_rubric_lineage_id: rubricLineageId }).eq("id", responseId);
  return ok(undefined);
}

/** « Terminer la réponse » : contrôle de toute la réponse puis passage à l'état Terminé. */
export async function finishResponse(responseId: string, readOnlyRubrics: string[] = []): Promise<ActionResult<{ failed: CheckResult[] }>> {
  const core = await loadResponseCore(responseId);
  if (!core) return fail("not_found");
  const { supabase, response, definition, items, stored } = core;
  const auth = await authorize("FormResponse", "edit", response.project_id);
  if ("error" in auth) return fail(auth.error);
  if (response.state === "done") return ok({ failed: [] });
  const model = buildModel(definition, items);
  const values: ValuesMap = Object.fromEntries(Object.entries(stored).map(([k, v]) => [k, { value: v.value, locked: v.locked }]));
  let skip = new Set(readOnlyRubrics);
  if (response.block_link_id) {
    const { data: link } = await supabase.from("form_block_links").select("fillable_rubric_lineage_ids").eq("id", response.block_link_id).maybeSingle();
    if (link?.fillable_rubric_lineage_ids) {
      const allowed = new Set(link.fillable_rubric_lineage_ids);
      skip = new Set(model.rubrics.filter((r) => !allowed.has(r.def.lineageId)).map((r) => r.def.lineageId));
    }
  }
  const failed = checkResponse(model, values, response.created_at, skip);
  if (failed.length) return ok({ failed });
  const me = auth.session.collaborator.id;
  const { error } = await supabase.from("form_responses")
    .update({ state: "done", done_at: new Date().toISOString(), done_by: me, updated_by: me, active_redirect: null }).eq("id", responseId);
  if (error) return fail(dbError(error));
  await supabase.from("form_response_events").insert({
    response_id: responseId, action: "state_changed", actor_id: me, provenance: "webapp", payload: { state: "done" },
  });
  revalidatePath(`/explore/projects/${response.project_id}`, "layout");
  return ok({ failed: [] });
}

/** Ajout de lignes / colonnes sur le terrain (items dynamiques propres à la réponse). */
export async function addTableItem(responseId: string, rubricLineageId: string, axis: "row" | "column"): Promise<ActionResult> {
  const core = await loadResponseCore(responseId);
  if (!core) return fail("not_found");
  const { supabase, response, definition, items } = core;
  const auth = await authorize("FormResponse", "edit", response.project_id);
  if ("error" in auth) return fail(auth.error);
  if (response.state === "done") return fail("response_done");
  const model = buildModel(definition, items);
  const rubric = model.rubrics.find((r) => r.def.lineageId === rubricLineageId);
  if (!rubric || rubric.def.type === "question") return fail("invalid");
  if ((axis === "row" && !rubric.def.allowAddRow) || (axis === "column" && !rubric.def.allowAddColumn)) return fail("forbidden");
  // Tableau par colonnes : question = colonne ; tableau par lignes : question = ligne.
  const addQuestion = (rubric.def.type === "table_column") === (axis === "column");
  let pos = items.filter((i) => i.rubricLineageId === rubricLineageId).reduce((m, i) => Math.max(m, i.position), 0);
  const rows: { response_id: string; rubric_lineage_id: string; kind: string; parent_lineage_id: string | null; template_lineage_id: string; lineage_id: string; position: number; name: string | null }[] = [];
  if (addQuestion) {
    const tpl = rubric.questions[rubric.questions.length - 1];
    if (!tpl) return fail("invalid");
    const qLineage = crypto.randomUUID();
    rows.push({ response_id: responseId, rubric_lineage_id: rubricLineageId, kind: "question", parent_lineage_id: null,
      template_lineage_id: tpl.lineageId, lineage_id: qLineage, position: ++pos, name: `${tpl.def.name} ${rubric.questions.length + 1}` });
    for (const c of tpl.cells) {
      rows.push({ response_id: responseId, rubric_lineage_id: rubricLineageId, kind: "option", parent_lineage_id: qLineage,
        template_lineage_id: c.lineageId, lineage_id: crypto.randomUUID(), position: ++pos, name: null });
    }
  } else {
    for (const q of rubric.questions) {
      const last = q.cells[q.cells.length - 1];
      if (!last) continue;
      rows.push({ response_id: responseId, rubric_lineage_id: rubricLineageId, kind: "option", parent_lineage_id: q.lineageId,
        template_lineage_id: last.lineageId, lineage_id: crypto.randomUUID(), position: ++pos, name: null });
    }
  }
  const { error } = await supabase.from("form_response_dynamic_items").insert(rows);
  if (error) return fail(dbError(error));
  revalidatePath(`/explore/projects/${response.project_id}/responses/${responseId}`);
  return ok(undefined);
}
