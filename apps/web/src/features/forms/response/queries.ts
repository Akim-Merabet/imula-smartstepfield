import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DynamicItem, FormDefinition } from "../types";
import { objectAttributePrefill } from "@/features/library/form-attributes/response-sync";

export type StoredValue = { value: unknown; locked: boolean; isValid: boolean | null; observation: string | null; questionLineageId: string };

export async function loadResponseCore(responseId: string) {
  const supabase = await createClient();
  const { data: response } = await supabase.from("form_responses")
    .select("id, project_id, form_id, form_version_id, reference, state, created_at, custom_status_id, context, block_link_id, flow_id, step_id, last_rubric_lineage_id, active_redirect, dynamic_context, done_at, form_index_label, form_reference")
    .eq("id", responseId).is("deleted_at", null).maybeSingle();
  if (!response) return null;
  const [{ data: version }, { data: items }, { data: values }] = await Promise.all([
    supabase.from("form_versions").select("structure").eq("id", response.form_version_id).maybeSingle(),
    supabase.from("form_response_dynamic_items").select("*").eq("response_id", responseId).order("position"),
    supabase.from("form_response_values").select("option_lineage_id, question_lineage_id, value_json, locked, is_valid, observation").eq("response_id", responseId),
  ]);
  if (!version) return null;
  const dynamicItems: DynamicItem[] = (items ?? []).map((i) => ({
    id: i.id, rubricLineageId: i.rubric_lineage_id, kind: i.kind as "question" | "option", parentLineageId: i.parent_lineage_id,
    templateLineageId: i.template_lineage_id, lineageId: i.lineage_id, position: i.position, name: i.name,
  }));
  const stored: Record<string, StoredValue> = {};
  for (const v of values ?? []) {
    stored[v.option_lineage_id] = { value: v.value_json, locked: v.locked, isValid: v.is_valid, observation: v.observation, questionLineageId: v.question_lineage_id };
  }
  return { supabase, response, definition: version.structure as unknown as FormDefinition, items: dynamicItems, stored };
}

export async function loadResponsePage(responseId: string) {
  const core = await loadResponseCore(responseId);
  if (!core) return null;
  const { supabase, response } = core;
  const [{ data: form }, { data: link }, { data: flow }, { data: statuses }, { data: members }, { data: history }] = await Promise.all([
    supabase.from("forms").select("name, family:label_families!forms_family_id_fkey(short_name, long_name, color)").eq("id", response.form_id).maybeSingle(),
    response.block_link_id
      ? supabase.from("form_block_links").select("initial_rubric_lineage_id, fillable_rubric_lineage_ids, enabled").eq("id", response.block_link_id).maybeSingle()
      : Promise.resolve({ data: null }),
    response.flow_id ? supabase.from("flows").select("id, name, ref_int").eq("id", response.flow_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("custom_statuses").select("id, name, color").eq("nature", "form_response").eq("active", true).order("sort_order"),
    supabase.from("project_members").select("collaborator:collaborators(id, first_name, last_name, email, company:companies(name))").eq("project_id", response.project_id),
    supabase.from("form_response_value_history").select("option_lineage_id").eq("response_id", responseId),
  ]);
  const historyCounts: Record<string, number> = {};
  for (const h of history ?? []) historyCounts[h.option_lineage_id] = (historyCounts[h.option_lineage_id] ?? 0) + 1;
  type M = { id: string; first_name: string; last_name: string; email: string | null; company: { name: string } | null };
  return {
    ...core,
    formName: form?.name ?? core.definition.name,
    family: (form?.family ?? null) as { short_name: string; long_name: string | null; color: string } | null,
    link: link as { initial_rubric_lineage_id: string | null; fillable_rubric_lineage_ids: string[] | null; enabled: boolean } | null,
    flow: flow as { id: string; name: string; ref_int: string | null } | null,
    statuses: statuses ?? [],
    members: (members ?? []).map((m) => m.collaborator as unknown as M | null).filter((m): m is M => !!m),
    historyCounts,
    objectPrefill: await objectAttributePrefill(supabase, response, core.definition),
  };
}
export type ResponsePageData = NonNullable<Awaited<ReturnType<typeof loadResponsePage>>>;
