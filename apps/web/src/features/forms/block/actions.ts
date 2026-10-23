"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

async function blockContext(blockId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("blocks").select("id, type, state, step_id, flow_id, flow:flows(project_id)").eq("id", blockId).maybeSingle();
  return { supabase, block: data, projectId: (data?.flow as { project_id: string } | null)?.project_id ?? null };
}

/** Lier un ou plusieurs formulaires de l'entité au bloc Formulaires d'une étape. */
export async function linkFormsToBlock(blockId: string, formIds: string[]): Promise<ActionResult<{ linked: number }>> {
  const { supabase, block, projectId } = await blockContext(blockId);
  if (!block || block.type !== "form" || !projectId) return fail("not_found");
  const auth = await authorize("BlockForm", "link", projectId);
  if ("error" in auth) return fail(auth.error);
  const ids = z.array(z.uuid()).min(1).max(10).safeParse(formIds);
  if (!ids.success) return fail("invalid");
  const [{ data: forms }, { data: existing }] = await Promise.all([
    supabase.from("forms").select("id").in("id", ids.data).eq("project_id", projectId).is("deleted_at", null),
    supabase.from("form_block_links").select("form_id, position").eq("block_id", blockId),
  ]);
  const already = new Set((existing ?? []).map((l) => l.form_id));
  let position = Math.max(0, ...(existing ?? []).map((l) => l.position));
  const rows = (forms ?? []).filter((f) => !already.has(f.id)).map((f) => ({
    block_id: blockId, step_id: block.step_id, flow_id: block.flow_id, form_id: f.id, position: ++position,
  }));
  if (rows.length) {
    const { error } = await supabase.from("form_block_links").insert(rows);
    if (error) return fail(dbError(error));
  }
  revalidatePath(`/explore/projects/${projectId}`, "layout");
  return ok({ linked: rows.length });
}

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  mandatory: z.boolean().optional(),
  unique_response: z.boolean().optional(),
  unique_mode: z.enum(["new_or_resume", "new_response", "resume_response"]).optional(),
  initial_rubric_lineage_id: z.uuid().nullable().optional(),
  fillable_rubric_lineage_ids: z.array(z.uuid()).nullable().optional(),
  additional_comment: z.string().max(5000).nullable().optional(),
});

/** Paramètres de liaison (spec 03 §6.3). Le mode « réponse unique » n'est modifiable qu'au statut Rédaction. */
export async function updateBlockLink(linkId: string, patch: z.input<typeof patchSchema>): Promise<ActionResult> {
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return fail("invalid");
  const supabase = await createClient();
  const { data: link } = await supabase.from("form_block_links").select("id, block_id, unique_mode, block:blocks(state), flow:flows(project_id)")
    .eq("id", linkId).maybeSingle();
  if (!link) return fail("not_found");
  const projectId = (link.flow as { project_id: string } | null)?.project_id ?? null;
  const auth = await authorize("BlockForm", "edit", projectId);
  if ("error" in auth) return fail(auth.error);
  const state = (link.block as { state: string } | null)?.state;
  if (parsed.data.unique_mode && parsed.data.unique_mode !== link.unique_mode && state !== "redaction") return fail("block_not_redaction");
  const { error, count } = await supabase.from("form_block_links").update(parsed.data, { count: "exact" }).eq("id", linkId);
  if (error) return fail(dbError(error));
  if (!count) return fail("forbidden");
  if (projectId) revalidatePath(`/explore/projects/${projectId}`, "layout");
  return ok(undefined);
}

/** Retirer une liaison : refusé si des réponses existent (on désactive alors la liaison). */
export async function deleteBlockLink(linkId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: link } = await supabase.from("form_block_links").select("id, flow:flows(project_id)").eq("id", linkId).maybeSingle();
  if (!link) return fail("not_found");
  const projectId = (link.flow as { project_id: string } | null)?.project_id ?? null;
  const auth = await authorize("BlockForm", "unlink", projectId);
  if ("error" in auth) return fail(auth.error);
  const { count } = await supabase.from("form_responses").select("id", { count: "exact", head: true }).eq("block_link_id", linkId);
  if (count) return fail("link_has_responses");
  const { error } = await supabase.from("form_block_links").delete().eq("id", linkId);
  if (error) return fail(dbError(error));
  if (projectId) revalidatePath(`/explore/projects/${projectId}`, "layout");
  return ok(undefined);
}
