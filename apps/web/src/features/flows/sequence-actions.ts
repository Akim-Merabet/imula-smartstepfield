"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { authorizeFlow, contentDbError, flowIdOf, revalidateFlow } from "./server-utils";

const typeSchema = z.enum(["linear", "parallel"]);

async function sequenceFlowId(sequenceId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("sequences").select("flow_id").eq("id", sequenceId).maybeSingle();
  return data?.flow_id ?? null;
}

/** « Créer une nouvelle séquence à partir d'ici » (§4.5). */
export async function splitSequence(phaseId: string): Promise<ActionResult> {
  const flowId = await flowIdOf("phases", phaseId);
  if (!flowId) return fail("not_found");
  const auth = await authorizeFlow("FlowSequence", "edit", flowId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("split_sequence", { p_phase_id: phaseId });
  if (error) return fail(contentDbError(error));
  revalidateFlow(auth.flow.project_id, flowId);
  return ok(undefined);
}

/** Fusionne une séquence avec la précédente. */
export async function mergeSequence(sequenceId: string): Promise<ActionResult> {
  const flowId = await sequenceFlowId(sequenceId);
  if (!flowId) return fail("not_found");
  const auth = await authorizeFlow("FlowSequence", "edit", flowId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_sequence", { p_sequence_id: sequenceId });
  if (error) return fail(contentDbError(error));
  revalidateFlow(auth.flow.project_id, flowId);
  return ok(undefined);
}

/** Type de séquence (linéaire / parallèle) ; `sequenceId` nul = séquence unique implicite du flow. */
export async function setSequenceType(flowId: string, sequenceId: string | null, type: "linear" | "parallel"): Promise<ActionResult> {
  if (!typeSchema.safeParse(type).success) return fail("invalid");
  const auth = await authorizeFlow("FlowSequence", "edit", flowId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  let id = sequenceId;
  if (!id) {
    const { error } = await supabase.rpc("ensure_sequences", { p_flow_id: flowId });
    if (error) return fail(contentDbError(error));
    const { data } = await supabase.from("sequences").select("id").eq("flow_id", flowId).order("position").limit(1).maybeSingle();
    id = data?.id ?? null;
  }
  if (!id) return fail("not_found");
  const { error } = await supabase.from("sequences").update({ type }).eq("id", id).eq("flow_id", flowId);
  if (error) return fail(contentDbError(error));
  revalidateFlow(auth.flow.project_id, flowId);
  return ok(undefined);
}

/** Type de phase (linéaire / parallèle) et caractère obligatoire. */
export async function setPhaseSequencing(phaseId: string, patch: { sequence_type?: "linear" | "parallel"; mandatory?: boolean }): Promise<ActionResult> {
  const parsed = z.object({ sequence_type: typeSchema.optional(), mandatory: z.boolean().optional() }).safeParse(patch);
  if (!parsed.success) return fail("invalid");
  const flowId = await flowIdOf("phases", phaseId);
  if (!flowId) return fail("not_found");
  const auth = await authorizeFlow("FlowSequence", "edit", flowId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from("phases").update(parsed.data).eq("id", phaseId);
  if (error) return fail(contentDbError(error));
  revalidateFlow(auth.flow.project_id, flowId);
  return ok(undefined);
}

/** Déverrouiller une étape bloquée par le séquencement (R-SEQ-3), tracé. */
export async function unlockStepFill(stepId: string, reason: string | null): Promise<ActionResult> {
  const flowId = await flowIdOf("steps", stepId);
  if (!flowId) return fail("not_found");
  const auth = await authorizeFlow("FlowSequence", "unlock", flowId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("unlock_step_fill", { p_step_id: stepId, p_reason: reason?.trim() || undefined });
  if (error) return fail(contentDbError(error));
  revalidateFlow(auth.flow.project_id, flowId);
  return ok(undefined);
}
