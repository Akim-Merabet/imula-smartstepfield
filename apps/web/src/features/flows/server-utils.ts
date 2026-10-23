import "server-only";
import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/actions";
import type { Session } from "@/lib/auth/session";
import type { Action } from "@/lib/permissions/types";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";
import { nextBlockState, type BlockState } from "./meta";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type BulkBlockAction = "next" | "retry" | "reject";

export type FlowRef = { id: string; project_id: string; flow_type: string; account_id: string; simplified_signature_mode: boolean };

/** Charge le flow (RLS) puis vérifie la permission UI dans le contexte de son entité. */
export async function authorizeFlow(routeId: string, action: Action, flowId: string):
  Promise<{ session: Session; flow: FlowRef } | { error: string }> {
  const supabase = await createClient();
  const { data: flow } = await supabase.from("flows")
    .select("id, project_id, flow_type, account_id, simplified_signature_mode").eq("id", flowId).maybeSingle();
  if (!flow) return { error: "not_found" };
  const auth = await authorize(routeId, action, flow.project_id);
  if ("error" in auth) return auth;
  return { session: auth.session, flow };
}

export async function flowIdOf(table: "phases" | "steps" | "blocks", id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from(table).select("flow_id").eq("id", id).maybeSingle();
  return data?.flow_id ?? null;
}

/** Bloc + flow + autorisation ; refuse l'édition hors état Rédaction quand `editable` (R-BL-3). */
export type BlockRef = { id: string; flow_id: string; step_id: string; type: Enums<"block_type">; state: BlockState; enabled: boolean };

export async function authorizeBlock(blockId: string, routeId: string, action: Action, opts: { editable?: boolean } = {}):
  Promise<{ session: Session; flow: FlowRef; block: BlockRef } | { error: string }> {
  const supabase = await createClient();
  const { data: block } = await supabase.from("blocks").select("id, flow_id, step_id, type, state, enabled").eq("id", blockId).maybeSingle();
  if (!block) return { error: "not_found" };
  const auth = await authorizeFlow(routeId, action, block.flow_id);
  if ("error" in auth) return auth;
  if (opts.editable && block.state !== "redaction") return { error: "not_redaction" };
  return { ...auth, block };
}

export function revalidateFlow(projectId: string, flowId?: string) {
  revalidatePath(`/explore/projects/${projectId}/dashboard/flow-management`, "layout");
  revalidatePath(`/explore/projects/${projectId}/dashboard/signatures`, "layout");
  if (flowId) revalidatePath(`/explore/projects/${projectId}/flow/${flowId}`, "layout");
}

/** Erreur Postgres → code applicatif ; 23503 (FK RESTRICT) = signatures présentes ou dépendances. */
export function contentDbError(error: { code?: string; message?: string } | null, fkCode = "has_signatures"): string {
  if (!error) return "unknown";
  if (error.code === "23503") return fkCode;
  if (error.code === "23505") return "duplicate";
  if (error.code === "42501") return "forbidden";
  if (error.code === "23514") return "invalid";
  if (error.code === "P0001" && error.message) return error.message;
  return "unknown";
}

type BlockRow = { id: string; state: BlockState; redactor_id: string | null; verifier_id: string | null; approver_id: string | null };

/** Transition d'état d'un bloc avec séparation des rôles (R-BL-4/5/6/7). */
export async function applyTransition(supabase: Supabase, flowId: string, b: BlockRow, action: BulkBlockAction, me: string, comment: string | null):
  Promise<"ok" | "invalid" | "conflict" | "error"> {
  const now = new Date().toISOString();
  let to: BlockState; let ev: Enums<"block_validation_action">;
  const patch: Record<string, string | null> = {};
  if (action === "reject") {
    if (b.state === "redaction") return "invalid";
    to = "redaction"; ev = "reject";
    Object.assign(patch, { redactor_id: null, redacted_at: null, verifier_id: null, verified_at: null, approver_id: null, approved_at: null, validator_id: null, validated_at: null });
  } else if (action === "retry") {
    if (b.state === "validated") return "invalid";
    to = b.state; ev = "retry";
  } else {
    const next = nextBlockState(b.state);
    if (!next) return "invalid";
    to = next;
    ev = next === "verification" ? "to_verification" : next === "approbation" ? "to_approbation" : "to_validated";
  }
  // R-BL-5 : l'acteur de l'état courant ne peut pas être celui de l'état précédent.
  if (action !== "reject") {
    if (b.state === "verification" && b.redactor_id === me) return "conflict";
    if (b.state === "approbation" && b.verifier_id === me) return "conflict";
  }
  if (action !== "reject") {
    if (b.state === "redaction") Object.assign(patch, { redactor_id: me, redacted_at: now });
    if (b.state === "verification") Object.assign(patch, { verifier_id: me, verified_at: now });
    if (b.state === "approbation") {
      if (action === "next" && b.approver_id === me) return "conflict";
      Object.assign(patch, action === "next" ? { validator_id: me, validated_at: now } : { approver_id: me, approved_at: now });
      if (action === "next" && !b.approver_id) Object.assign(patch, { approver_id: me, approved_at: now });
    }
  }
  const { error } = await supabase.from("blocks").update({ ...patch, state: to, updated_by: me }).eq("id", b.id);
  if (error) return "error";
  await supabase.from("block_state_events").insert({ block_id: b.id, flow_id: flowId, action: ev, from_state: b.state, to_state: to, actor_id: me, comment });
  return "ok";
}
