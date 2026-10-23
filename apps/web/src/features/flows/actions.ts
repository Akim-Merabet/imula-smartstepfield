"use server";

import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { saveCustomFieldValues } from "@/lib/custom-fields/server";
import { createClient } from "@/lib/supabase/server";
import { creatableFlowTypes, REORGANIZE_FIELDS, type FlowType, type ReorganizeField } from "./meta";
import { flowSchema, type FlowInput } from "./schema";
import { applyTransition, authorizeFlow, contentDbError, revalidateFlow, type BulkBlockAction } from "./server-utils";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** N° chrono : nomenclature de référence (nature flow, champ ref_int) + compteur de l'entité. */
async function generateRefInt(supabase: Supabase, accountId: string, projectId: string): Promise<string | null> {
  const { data: rule } = await supabase.from("reference_rules").select("id, nomenclature, counter_type, counter_format, start_value")
    .eq("account_id", accountId).eq("nature", "flow").eq("field", "ref_int").eq("active", true).limit(1).maybeSingle();
  if (!rule) return null;
  const scope = rule.counter_type === "local" ? projectId : null;
  let q = supabase.from("reference_counters").select("id, current_value").eq("reference_rule_id", rule.id);
  q = scope ? q.eq("project_id", scope) : q.is("project_id", null);
  const { data: counter } = await q.maybeSingle();
  const value = counter ? counter.current_value + 1 : rule.start_value;
  const res = counter
    ? await supabase.from("reference_counters").update({ current_value: value }).eq("id", counter.id)
    : await supabase.from("reference_counters").insert({ reference_rule_id: rule.id, project_id: scope, current_value: value });
  if (res.error) return null;
  const chrono = String(value).padStart(rule.counter_format, "0");
  return rule.nomenclature.includes("{chrono}") ? rule.nomenclature.replace("{chrono}", chrono) : `${rule.nomenclature}${chrono}`;
}

async function saveAssignment(supabase: Supabase, flowId: string, actorId: string, input: { assignee_ids: string[];
  collaborators: { collaborator_id: string; hierarchy_ids: string[] }[]; tag_ids: string[] }, isCreate: boolean) {
  // Responsables (multiples)
  await supabase.from("flow_assignees").delete().eq("flow_id", flowId);
  if (input.assignee_ids.length) {
    await supabase.from("flow_assignees").insert([...new Set(input.assignee_ids)].map((collaborator_id) => ({ flow_id: flowId, collaborator_id })));
  }
  // Étiquettes
  await supabase.from("flow_tags").delete().eq("flow_id", flowId);
  if (input.tag_ids.length) await supabase.from("flow_tags").insert([...new Set(input.tag_ids)].map((tag_id) => ({ flow_id: flowId, tag_id })));

  // Collaborateurs restreints + hiérarchies (événements ADD/DELETE_USER_HIERARCHY_IN_FLOW)
  const { data: before } = isCreate ? { data: [] } : await supabase.from("flow_collaborator_hierarchies")
    .select("collaborator_id, hierarchy_id").eq("flow_id", flowId);
  const key = (c: string, h: string) => `${c}|${h}`;
  const prev = new Set((before ?? []).map((r) => key(r.collaborator_id, r.hierarchy_id)));
  const next = new Set(input.collaborators.flatMap((c) => c.hierarchy_ids.map((h) => key(c.collaborator_id, h))));
  await supabase.from("flow_collaborators").delete().eq("flow_id", flowId);
  if (input.collaborators.length) {
    await supabase.from("flow_collaborators").insert(input.collaborators.map((c) => ({ flow_id: flowId, collaborator_id: c.collaborator_id })));
    await supabase.from("flow_collaborator_hierarchies").insert(input.collaborators.flatMap((c) =>
      [...new Set(c.hierarchy_ids)].map((hierarchy_id) => ({ flow_id: flowId, collaborator_id: c.collaborator_id, hierarchy_id }))));
  }
  const events = [
    ...[...next].filter((k) => !prev.has(k)).map((k) => ({ k, type: "add_user_hierarchy_in_flow" as const })),
    ...[...prev].filter((k) => !next.has(k)).map((k) => ({ k, type: "delete_user_hierarchy_from_flow" as const })),
  ];
  if (events.length) {
    await supabase.from("flow_events").insert(events.map(({ k, type }) => {
      const [collaborator_id, hierarchy_id] = k.split("|");
      return { flow_id: flowId, event_type: type, actor_id: actorId, payload: { collaborator_id, hierarchy_id } };
    }));
  }
}

function flowValues(data: ReturnType<typeof flowSchema.parse>) {
  const {
    custom_fields, status_comment, tag_ids, assignee_ids, collaborators, custom_status_id, flow_type, ...values
  } = data;
  void custom_fields; void status_comment; void tag_ids; void assignee_ids; void collaborators; void custom_status_id; void flow_type;
  return values;
}

export async function createFlow(projectId: string, input: FlowInput): Promise<ActionResult<{ id: string; ref: string | null }>> {
  const auth = await authorize("FlowManagement", "add", projectId);
  if ("error" in auth) return fail(auth.error);
  const parsed = flowSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const data = parsed.data;
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("id, type, organization_id, account_id").eq("id", projectId).single();
  if (!project) return fail("not_found");
  if (!creatableFlowTypes(project.type).includes(data.flow_type as FlowType)) return fail("invalid_type");
  const me = auth.session.collaborator.id;

  const refInt = data.ref_int ?? (await generateRefInt(supabase, project.account_id, projectId));
  const { data: flow, error } = await supabase.from("flows").insert({
    ...flowValues(data),
    ref_int: refInt,
    flow_type: data.flow_type as FlowType,
    custom_status_id: data.custom_status_id,
    project_id: projectId,
    organization_id: project.organization_id,
    account_id: project.account_id,
    created_by: me,
    updated_by: me,
  }).select("id").single();
  if (error || !flow) return fail(dbError(error));

  await saveAssignment(supabase, flow.id, me, data, true);
  await saveCustomFieldValues({ accountId: project.account_id, businessClass: "flow", objectId: flow.id, values: data.custom_fields, updatedBy: me });
  revalidateFlow(projectId);
  return ok({ id: flow.id, ref: refInt });
}

export async function updateFlow(flowId: string, input: FlowInput): Promise<ActionResult> {
  const auth = await authorizeFlow("FlowManagement", "edit", flowId);
  if ("error" in auth) return fail(auth.error);
  const parsed = flowSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const data = parsed.data;
  const supabase = await createClient();
  const { data: before } = await supabase.from("flows").select("custom_status_id, simplified_signature_mode").eq("id", flowId).single();
  if (!before) return fail("not_found");

  // Mode simplifié : impossible avec une signature ou un bloc Contrôle hors rédaction (§2.10 Options).
  if (data.simplified_signature_mode !== before.simplified_signature_mode) {
    const { count: sigs } = await supabase.from("signatures").select("id", { count: "exact", head: true }).eq("flow_id", flowId).eq("disabled", false);
    if (data.simplified_signature_mode && sigs) return fail("has_signatures");
    const { count: notRedaction } = await supabase.from("blocks").select("id", { count: "exact", head: true })
      .eq("flow_id", flowId).eq("type", "dsi").neq("state", "redaction");
    if (notRedaction) return fail("dsi_not_redaction");
  }

  const me = auth.session.collaborator.id;
  const { error } = await supabase.from("flows").update({ ...flowValues(data), updated_by: me }).eq("id", flowId);
  if (error) return fail(dbError(error));
  if (data.custom_status_id && data.custom_status_id !== before.custom_status_id) {
    const { error: statusError } = await supabase.rpc("set_flow_status", {
      p_flow_id: flowId, p_status_id: data.custom_status_id, p_comment: data.status_comment ?? undefined,
    });
    if (statusError) return fail(dbError(statusError));
  }
  await saveAssignment(supabase, flowId, me, data, false);
  await saveCustomFieldValues({ accountId: auth.flow.account_id, businessClass: "flow", objectId: flowId, values: data.custom_fields, updatedBy: me });
  revalidateFlow(auth.flow.project_id, flowId);
  return ok(undefined);
}

/** Changement rapide de statut (popover, R-STAT-4). */
export async function setFlowStatus(flowId: string, statusId: string, comment: string | null): Promise<ActionResult> {
  const auth = await authorizeFlow("FlowManagement", "editStatus", flowId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_flow_status", { p_flow_id: flowId, p_status_id: statusId, p_comment: comment?.trim() || undefined });
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, flowId);
  return ok(undefined);
}

/** Suppression (corbeille 30 j) ; bloquée si le flow a des dépendances (§2.7 action 3). */
export async function deleteFlow(flowId: string): Promise<ActionResult> {
  const auth = await authorizeFlow("FlowManagement", "delete", flowId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const [linked, diagrams, imported] = await Promise.all([
    supabase.from("steps").select("id", { count: "exact", head: true }).eq("linked_flow_id", flowId).neq("flow_id", flowId),
    supabase.from("diagram_flows").select("diagram_id", { count: "exact", head: true }).eq("flow_id", flowId),
    supabase.from("flows").select("id", { count: "exact", head: true }).eq("sourced_from_flow_id", flowId).is("deleted_at", null),
  ]);
  if (linked.count) return fail("linked_to_steps");
  if (diagrams.count) return fail("in_diagram");
  if (imported.count) return fail("imported");
  const me = auth.session.collaborator.id;
  const { error } = await supabase.from("flows").update({ deleted_at: new Date().toISOString(), deleted_by: me }).eq("id", flowId);
  if (error) return fail(dbError(error));
  await supabase.from("flow_events").insert({ flow_id: flowId, event_type: "delete", actor_id: me });
  revalidateFlow(auth.flow.project_id);
  return ok(undefined);
}

export async function duplicateFlow(flowId: string, input: { name: string; ref_int?: string | null }): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeFlow("FlowManagement", "duplicate", flowId);
  if ("error" in auth) return fail(auth.error);
  const name = input.name ?? "";
  if (name.length < 3 || name.length > 255 || name !== name.trim()) return fail("invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_flow", {
    p_flow_id: flowId, p_name: name, p_ref_int: input.ref_int?.trim() || undefined,
  });
  if (error || !data) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id);
  return ok({ id: data });
}

/** Réorganisation en masse (§2.7) : un champ, une valeur, n flows. */
export async function reorganizeFlows(projectId: string, flowIds: string[], field: ReorganizeField, value: string | null): Promise<ActionResult<{ count: number }>> {
  const auth = await authorize("FlowManagement", "edit", projectId);
  if ("error" in auth) return fail(auth.error);
  if (!REORGANIZE_FIELDS.includes(field) || flowIds.length === 0) return fail("invalid");
  const supabase = await createClient();
  const me = auth.session.collaborator.id;
  const columns: Partial<Record<ReorganizeField, string>> = {
    category: "category_id", reporter: "reporter_id", tablet1: "tablet_1_id", tablet2: "tablet_2_id", tablet3: "tablet_3_id",
    plannedStart: "start_date", plannedEnd: "finish_date", estimatedStart: "estimated_start_date", estimatedEnd: "estimated_end_date",
    achievedStart: "achieved_start_date", achievedEnd: "achieved_end_date",
  };
  if (field === "status") {
    if (!value) return fail("invalid");
    for (const id of flowIds) {
      const { error } = await supabase.rpc("set_flow_status", { p_flow_id: id, p_status_id: value });
      if (error) return fail(dbError(error));
    }
  } else if (field === "assignee") {
    await supabase.from("flow_assignees").delete().in("flow_id", flowIds);
    if (value) {
      const { error } = await supabase.from("flow_assignees").insert(flowIds.map((flow_id) => ({ flow_id, collaborator_id: value })));
      if (error) return fail(dbError(error));
    }
  } else {
    const column = columns[field]!;
    const v = value && column.endsWith("_date") ? new Date(value).toISOString() : value;
    const { error } = await supabase.from("flows").update({ [column]: v, updated_by: me } as never).in("id", flowIds).eq("project_id", projectId);
    if (error) return fail(dbError(error));
  }
  revalidateFlow(projectId);
  return ok({ count: flowIds.length });
}

/** Réinitialiser le flow (REINITIALISER) : supprime tout le contenu ; bloqué si signatures (R2.18). */
export async function resetFlow(flowId: string): Promise<ActionResult> {
  const auth = await authorizeFlow("FlowContent", "reset", flowId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_flow", { p_flow_id: flowId });
  if (error) return fail(contentDbError(error));
  revalidateFlow(auth.flow.project_id, flowId);
  return ok(undefined);
}

/** Validation interne globale (§4.9) : applique l'action aux blocs sélectionnés qui sont dans un état valable. */
export async function bulkBlockTransition(flowId: string, blockIds: string[], action: BulkBlockAction, comment?: string | null):
  Promise<ActionResult<{ count: number; conflicts: number }>> {
  const auth = await authorizeFlow("FlowBlockValidation", "edit", flowId);
  if ("error" in auth) return fail(auth.error);
  if (blockIds.length === 0) return fail("no_selection");
  const supabase = await createClient();
  const { data: blocks } = await supabase.from("blocks")
    .select("id, state, redactor_id, verifier_id, approver_id").eq("flow_id", flowId).in("id", blockIds);
  const me = auth.session.collaborator.id;
  let count = 0; let conflicts = 0;
  for (const b of blocks ?? []) {
    const res = await applyTransition(supabase, flowId, b, action, me, comment ?? null);
    if (res === "ok") count += 1; else if (res === "conflict") conflicts += 1;
  }
  if (count === 0) return fail(conflicts ? "role_conflict" : "no_valid_block");
  revalidateFlow(auth.flow.project_id, flowId);
  return ok({ count, conflicts });
}
