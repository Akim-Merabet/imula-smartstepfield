"use server";

import { revalidatePath } from "next/cache";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

/** Liens bloc ↔ document (spec 02 §5.11, spec 04 §4.9) — droit d'édition du contenu du flow. */
async function blockContext(blockId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("blocks").select("id, flow_id, type, state, flow:flows(project_id)").eq("id", blockId).maybeSingle();
  if (!data || !["pr", "txt", "dsi", "multi_pr"].includes(data.type)) return null;
  return { ...data, projectId: (data.flow as { project_id: string } | null)?.project_id ?? null };
}

function revalidateFlow(projectId: string | null, flowId: string) {
  if (projectId) revalidatePath(`/explore/projects/${projectId}/flow/${flowId}`, "layout");
}

export async function linkBlockDocument(blockId: string, documentId: string, versionId: string | null): Promise<ActionResult> {
  const ctx = await blockContext(blockId);
  if (!ctx) return fail("not_found");
  const auth = await authorize("FlowContent", "edit", ctx.projectId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("id, project_id").eq("id", documentId).is("deleted_at", null).maybeSingle();
  if (!doc || doc.project_id !== ctx.projectId) return fail("not_found");
  if (versionId) {
    const { data: v } = await supabase.from("document_versions").select("document_id").eq("id", versionId).maybeSingle();
    if (v?.document_id !== documentId) return fail("invalid");
  }
  const { count } = await supabase.from("block_documents").select("id", { count: "exact", head: true }).eq("block_id", blockId);
  const { error } = await supabase.from("block_documents").insert({
    block_id: blockId, flow_id: ctx.flow_id, document_id: documentId, pinned_version_id: versionId, position: count ?? 0,
  });
  if (error) return fail(error.code === "23505" ? "duplicate_index" : dbError(error));
  revalidateFlow(ctx.projectId, ctx.flow_id);
  return ok(undefined);
}

export async function setBlockDocumentVersion(linkId: string, versionId: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: link } = await supabase.from("block_documents").select("id, block_id, document_id").eq("id", linkId).maybeSingle();
  if (!link?.document_id) return fail("not_found");
  const ctx = await blockContext(link.block_id);
  if (!ctx) return fail("not_found");
  const auth = await authorize("FlowContent", "edit", ctx.projectId);
  if ("error" in auth) return fail(auth.error);
  if (versionId) {
    const { data: v } = await supabase.from("document_versions").select("document_id, pdf_path").eq("id", versionId).maybeSingle();
    if (v?.document_id !== link.document_id) return fail("invalid");
  }
  const { error } = await supabase.from("block_documents").update({ pinned_version_id: versionId }).eq("id", linkId);
  if (error) return fail(error.code === "23505" ? "duplicate_index" : dbError(error));
  revalidateFlow(ctx.projectId, ctx.flow_id);
  return ok(undefined);
}

export async function unlinkBlockDocument(linkId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: link } = await supabase.from("block_documents").select("id, block_id").eq("id", linkId).maybeSingle();
  if (!link) return fail("not_found");
  const ctx = await blockContext(link.block_id);
  if (!ctx) return fail("not_found");
  const auth = await authorize("FlowContent", "edit", ctx.projectId);
  if ("error" in auth) return fail(auth.error);
  const { error } = await supabase.from("block_documents").delete().eq("id", linkId);
  if (error) return fail(dbError(error));
  revalidateFlow(ctx.projectId, ctx.flow_id);
  return ok(undefined);
}

/** Pièce jointe hors base documentaire (fichier déjà téléversé dans projects/<projet>/attachments/<bloc>/…). */
export async function addBlockAttachment(blockId: string, path: string, name: string): Promise<ActionResult> {
  const ctx = await blockContext(blockId);
  if (!ctx) return fail("not_found");
  const auth = await authorize("FlowContent", "edit", ctx.projectId);
  if ("error" in auth) return fail(auth.error);
  if (!path.startsWith(`projects/${ctx.projectId}/attachments/${blockId}/`)) return fail("invalid");
  const supabase = await createClient();
  const { count } = await supabase.from("block_documents").select("id", { count: "exact", head: true }).eq("block_id", blockId);
  const { error } = await supabase.from("block_documents").insert({
    block_id: blockId, flow_id: ctx.flow_id, is_attachment: true, attachment_path: path, attachment_name: name, position: count ?? 0,
  });
  if (error) return fail(dbError(error));
  revalidateFlow(ctx.projectId, ctx.flow_id);
  return ok(undefined);
}
