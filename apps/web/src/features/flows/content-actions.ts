"use server";

import { dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { saveCustomFieldValues } from "@/lib/custom-fields/server";
import { createClient } from "@/lib/supabase/server";
import type { BlockType } from "./meta";
import { phaseSchema, stepSchema, type PhaseInput, type StepInput } from "./schema";
import { authorizeFlow, contentDbError, flowIdOf, revalidateFlow } from "./server-utils";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function authorizeContent(table: "phases" | "steps", id: string, action: "edit" | "delete" | "deactivate" = "edit") {
  const flowId = await flowIdOf(table, id);
  if (!flowId) return { error: "not_found" };
  return authorizeFlow("FlowContent", action, flowId);
}

async function signatureCount(supabase: Supabase, flowId: string, scope: { phaseId?: string; stepId?: string }) {
  // Signatures DSI
  let q = supabase.from("signatures").select("id, step:steps!inner(phase_id)", { count: "exact", head: true }).eq("flow_id", flowId).eq("disabled", false);
  if (scope.stepId) q = q.eq("step_id", scope.stepId);
  if (scope.phaseId) q = q.eq("step.phase_id", scope.phaseId);
  const { count: dsi } = await q;
  // Signatures instructions multiples
  let m = supabase.from("block_multi_pr_signatures")
    .select("id, item:block_multi_pr_items!inner(block:blocks!inner(step_id, step:steps!inner(phase_id)))", { count: "exact", head: true })
    .eq("flow_id", flowId);
  if (scope.stepId) m = m.eq("item.block.step_id", scope.stepId);
  if (scope.phaseId) m = m.eq("item.block.step.phase_id", scope.phaseId);
  const { count: mpr } = await m;
  return (dsi ?? 0) + (mpr ?? 0);
}

// ===== Phases ======================================================================

export async function createPhase(flowId: string, input: PhaseInput, beforePhaseId?: string | null): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeFlow("FlowContent", "edit", flowId);
  if ("error" in auth) return fail(auth.error);
  const parsed = phaseSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const { custom_fields, ...values } = parsed.data;
  const supabase = await createClient();
  const { data: last } = await supabase.from("phases").select("position").eq("flow_id", flowId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from("phases").insert({ ...values, flow_id: flowId, position: (last?.position ?? 0) + 1 }).select("id").single();
  if (error || !data) return fail(dbError(error));
  if (beforePhaseId) {
    const { data: all } = await supabase.from("phases").select("id").eq("flow_id", flowId).order("position");
    const ids = (all ?? []).map((p) => p.id).filter((id) => id !== data.id);
    const at = ids.indexOf(beforePhaseId);
    ids.splice(at < 0 ? ids.length : at, 0, data.id);
    await supabase.rpc("reorder_phases", { p_flow_id: flowId, p_ids: ids });
  }
  await saveCustomFieldValues({ accountId: auth.flow.account_id, businessClass: "phase", objectId: data.id, values: custom_fields, updatedBy: auth.session.collaborator.id });
  revalidateFlow(auth.flow.project_id, flowId);
  return ok({ id: data.id });
}

export async function updatePhase(phaseId: string, input: PhaseInput): Promise<ActionResult> {
  const auth = await authorizeContent("phases", phaseId);
  if ("error" in auth) return fail(auth.error);
  const parsed = phaseSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const { custom_fields, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("phases").update(values).eq("id", phaseId);
  if (error) return fail(dbError(error));
  await saveCustomFieldValues({ accountId: auth.flow.account_id, businessClass: "phase", objectId: phaseId, values: custom_fields, updatedBy: auth.session.collaborator.id });
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

/** Activer / désactiver une phase (commentaire obligatoire) ; l'activation réactive ses étapes. */
export async function setPhaseDisabled(phaseId: string, disabled: boolean, comment: string): Promise<ActionResult> {
  const auth = await authorizeContent("phases", phaseId, "deactivate");
  if ("error" in auth) return fail(auth.error);
  if (!comment.trim()) return fail("comment_required");
  const supabase = await createClient();
  const { error } = await supabase.from("phases").update({ disabled, disabled_comment: comment.trim() }).eq("id", phaseId);
  if (error) return fail(dbError(error));
  if (!disabled) await supabase.from("steps").update({ disabled: false }).eq("phase_id", phaseId);
  await supabase.from("flow_events").insert({
    flow_id: auth.flow.id, event_type: disabled ? "deactivate_phase" : "activate_phase",
    actor_id: auth.session.collaborator.id, phase_id: phaseId, comment: comment.trim(),
  });
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

/** Suppression sans corbeille ; refusée si signatures ou redirections (R-PH-2, R-ST-3). */
export async function deletePhase(phaseId: string): Promise<ActionResult> {
  const auth = await authorizeContent("phases", phaseId, "delete");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  if (await signatureCount(supabase, auth.flow.id, { phaseId })) return fail("has_signatures");
  const { data: steps } = await supabase.from("steps").select("id").eq("phase_id", phaseId);
  const stepIds = (steps ?? []).map((s) => s.id);
  const blocked = await hasBlockingDependencies(supabase, stepIds, phaseId);
  if (blocked) return fail(blocked);
  if (stepIds.length) await supabase.from("form_block_links").delete().in("step_id", stepIds);
  const { error } = await supabase.from("phases").delete().eq("id", phaseId);
  if (error) return fail(contentDbError(error));
  await renumberPhases(supabase, auth.flow.id);
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

async function hasBlockingDependencies(supabase: Supabase, stepIds: string[], phaseId?: string): Promise<string | null> {
  if (stepIds.length) {
    const { count: responses } = await supabase.from("form_responses").select("id", { count: "exact", head: true })
      .in("step_id", stepIds).is("deleted_at", null);
    if (responses) return "has_responses";
    const { data: navs } = await supabase.from("step_navigations").select("step_id").in("target_step_id", stepIds);
    if ((navs ?? []).some((n) => !stepIds.includes(n.step_id))) return "has_redirections";
  }
  if (phaseId) {
    const { data: navs } = await supabase.from("step_navigations").select("step_id").eq("target_phase_id", phaseId);
    if ((navs ?? []).some((n) => !stepIds.includes(n.step_id))) return "has_redirections";
  }
  return null;
}

async function renumberPhases(supabase: Supabase, flowId: string) {
  const { data } = await supabase.from("phases").select("id").eq("flow_id", flowId).order("position");
  await supabase.rpc("reorder_phases", { p_flow_id: flowId, p_ids: (data ?? []).map((p) => p.id) });
}

export async function duplicatePhase(phaseId: string, beforePhaseId: string | null): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeContent("phases", phaseId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_phase", { p_phase_id: phaseId, p_before_phase_id: beforePhaseId ?? undefined });
  if (error || !data) return fail(contentDbError(error, "in_use"));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok({ id: data });
}

/** Réordonne toutes les phases du flow (glisser-déposer ou « Déplacer la phase juste après… »). */
export async function reorderPhases(flowId: string, orderedIds: string[]): Promise<ActionResult> {
  const auth = await authorizeFlow("FlowContent", "edit", flowId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_phases", { p_flow_id: flowId, p_ids: orderedIds });
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, flowId);
  return ok(undefined);
}

// ===== Étapes ======================================================================

async function syncBlocks(supabase: Supabase, flowId: string, stepId: string, enabled: BlockType[], me: string) {
  const { data: existing } = await supabase.from("blocks").select("id, type, enabled").eq("step_id", stepId);
  const byType = new Map((existing ?? []).map((b) => [b.type, b]));
  for (const type of enabled) {
    const b = byType.get(type);
    if (!b) {
      const { data: created } = await supabase.from("blocks").insert({
        step_id: stepId, flow_id: flowId, type, created_by: me, updated_by: me,
        txt_visibility: type === "txt" ? "mobile_app" : null,
      }).select("id").single();
      if (created) {
        await supabase.from("block_state_events").insert({ block_id: created.id, flow_id: flowId, action: "create", to_state: "redaction", actor_id: me });
        if (type === "dsi") await supabase.from("block_dsi_configs").insert({ block_id: created.id, flow_id: flowId });
        if (type === "multi_pr") await supabase.from("block_multi_pr_items").insert({ block_id: created.id, flow_id: flowId, position: 1, title: null, updated_by: me });
      }
    } else if (!b.enabled) {
      // R-ST-2 : la réactivation retrouve les données antérieures.
      await supabase.from("blocks").update({ enabled: true, updated_by: me }).eq("id", b.id);
    }
  }
  const toDisable = (existing ?? []).filter((b) => b.enabled && !enabled.includes(b.type)).map((b) => b.id);
  if (toDisable.length) await supabase.from("blocks").update({ enabled: false, updated_by: me }).in("id", toDisable);
}

async function saveNavigations(supabase: Supabase, flowId: string, stepId: string, navigations: ReturnType<typeof stepSchema.parse>["navigations"]) {
  await supabase.from("step_navigations").delete().eq("step_id", stepId);
  if (navigations.length) {
    await supabase.from("step_navigations").insert(navigations.map((n, i) => ({
      step_id: stepId, flow_id: flowId, target_phase_id: n.target_phase_id, target_step_id: n.target_step_id,
      style: n.style, message: n.message, position: i + 1,
    })));
  }
}

export async function createStep(phaseId: string, input: StepInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeContent("phases", phaseId);
  if ("error" in auth) return fail(auth.error);
  const parsed = stepSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const { custom_fields, enabled_blocks, navigations, ...values } = parsed.data;
  if (auth.flow.flow_type === "group" && !enabled_blocks.includes("dsi")) return fail("dsi_required_group");
  const supabase = await createClient();
  const me = auth.session.collaborator.id;
  const { data: last } = await supabase.from("steps").select("position").eq("phase_id", phaseId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from("steps").insert({
    ...values, phase_id: phaseId, flow_id: auth.flow.id, position: (last?.position ?? 0) + 1,
  }).select("id").single();
  if (error || !data) return fail(dbError(error));
  await syncBlocks(supabase, auth.flow.id, data.id, enabled_blocks as BlockType[], me);
  await saveNavigations(supabase, auth.flow.id, data.id, navigations);
  await saveCustomFieldValues({ accountId: auth.flow.account_id, businessClass: "step", objectId: data.id, values: custom_fields, updatedBy: me });
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok({ id: data.id });
}

export async function updateStep(stepId: string, input: StepInput): Promise<ActionResult> {
  const auth = await authorizeContent("steps", stepId);
  if ("error" in auth) return fail(auth.error);
  const parsed = stepSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const { custom_fields, enabled_blocks, navigations, ...values } = parsed.data;
  // R-TYPE-3 : bloc Contrôle imposé sur un chapeau.
  if (auth.flow.flow_type === "group" && !enabled_blocks.includes("dsi")) return fail("dsi_required_group");
  const supabase = await createClient();
  const me = auth.session.collaborator.id;
  const { error } = await supabase.from("steps").update(values).eq("id", stepId);
  if (error) return fail(dbError(error));
  await syncBlocks(supabase, auth.flow.id, stepId, enabled_blocks as BlockType[], me);
  await saveNavigations(supabase, auth.flow.id, stepId, navigations);
  await saveCustomFieldValues({ accountId: auth.flow.account_id, businessClass: "step", objectId: stepId, values: custom_fields, updatedBy: me });
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

/** Réactiver un bloc décoché depuis la zone étape (R-ST-2). */
export async function enableBlock(stepId: string, type: BlockType): Promise<ActionResult> {
  const auth = await authorizeContent("steps", stepId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: existing } = await supabase.from("blocks").select("type").eq("step_id", stepId).eq("enabled", true);
  await syncBlocks(supabase, auth.flow.id, stepId, [...new Set([...(existing ?? []).map((b) => b.type), type])], auth.session.collaborator.id);
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export async function setStepDisabled(stepId: string, disabled: boolean, comment: string): Promise<ActionResult> {
  const auth = await authorizeContent("steps", stepId, "deactivate");
  if ("error" in auth) return fail(auth.error);
  if (!comment.trim()) return fail("comment_required");
  const supabase = await createClient();
  const { data: step } = await supabase.from("steps").select("phase_id").eq("id", stepId).single();
  const { error } = await supabase.from("steps").update({ disabled, disabled_comment: comment.trim() }).eq("id", stepId);
  if (error) return fail(dbError(error));
  await supabase.from("flow_events").insert({
    flow_id: auth.flow.id, event_type: disabled ? "deactivate_step" : "activate_step",
    actor_id: auth.session.collaborator.id, phase_id: step?.phase_id, step_id: stepId, comment: comment.trim(),
  });
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export async function deleteStep(stepId: string): Promise<ActionResult> {
  const auth = await authorizeContent("steps", stepId, "delete");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  if (await signatureCount(supabase, auth.flow.id, { stepId })) return fail("has_signatures");
  const blocked = await hasBlockingDependencies(supabase, [stepId]);
  if (blocked) return fail(blocked);
  const { data: step } = await supabase.from("steps").select("phase_id").eq("id", stepId).single();
  await supabase.from("form_block_links").delete().eq("step_id", stepId);
  const { error } = await supabase.from("steps").delete().eq("id", stepId);
  if (error) return fail(contentDbError(error));
  if (step) {
    const { data: rest } = await supabase.from("steps").select("id").eq("phase_id", step.phase_id).order("position");
    if (rest?.length) await supabase.rpc("move_step", { p_step_id: rest[0].id, p_target_phase_id: step.phase_id, p_index: 1 });
  }
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export async function duplicateStep(stepId: string, targetPhaseId: string, beforeStepId: string | null): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeContent("steps", stepId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_step", {
    p_step_id: stepId, p_target_phase_id: targetPhaseId, p_before_step_id: beforeStepId ?? undefined,
  });
  if (error || !data) return fail(contentDbError(error, "in_use"));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok({ id: data });
}

/** Déplacer une étape (index 1-based dans la phase cible). */
export async function moveStep(stepId: string, targetPhaseId: string, index: number): Promise<ActionResult> {
  const auth = await authorizeContent("steps", stepId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_step", { p_step_id: stepId, p_target_phase_id: targetPhaseId, p_index: index });
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

/** Valider / dévalider l'étape (§4.6) ; renvoie les éléments obligatoires manquants. */
export async function setStepValidation(stepId: string, validate: boolean): Promise<ActionResult<{ missing: string[] }>> {
  const flowId = await flowIdOf("steps", stepId);
  if (!flowId) return fail("not_found");
  const auth = await authorizeFlow("FlowContent", validate ? "validateStep" : "devalidateStep", flowId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_step_validation", { p_step_id: stepId, p_validate: validate });
  if (error) return fail(contentDbError(error));
  if (data && data.length) return fail("missing_mandatory", data);
  revalidateFlow(auth.flow.project_id, flowId);
  return ok({ missing: [] });
}

export async function markStepOpened(stepId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("mark_step_opened", { p_step_id: stepId });
}
