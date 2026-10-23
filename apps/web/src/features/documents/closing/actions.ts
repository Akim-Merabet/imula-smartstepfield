"use server";

import { revalidatePath } from "next/cache";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { sectionSchema, type SectionInput } from "../schema";
import { scheduleDocumentGeneration } from "../pdf/trigger";

async function folderContext(folderId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("id, project_id, nature, deleted_at").eq("id", folderId).maybeSingle();
  return data && data.nature === "rfi" && !data.deleted_at ? data : null;
}
const revalidate = (projectId: string | null) => { if (projectId) revalidatePath(`/explore/projects/${projectId}/dashboard/closing-folder`); };

/** Création / édition d'une section (§5.9.2) avec ses éléments (documents + indice, moyens). */
export async function saveSection(folderId: string, sectionId: string | null, input: SectionInput): Promise<ActionResult<{ id: string }>> {
  const folder = await folderContext(folderId);
  if (!folder) return fail("not_found");
  const auth = await authorize("DashboardClosingFolder", sectionId ? "edit" : "add", folder.project_id);
  if ("error" in auth) return fail(auth.error);
  const parsed = sectionSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const { items, position, ...v } = parsed.data;
  if (["report", "certificate", "reference"].includes(v.type) && !v.flow_id) return fail("flow_required");
  const supabase = await createClient();

  // Contrôle « document volumineux » : interdit dans une section Document (§5.7).
  const docIds = items.map((i) => i.document_id).filter(Boolean) as string[];
  if (v.type === "document" && docIds.length) {
    const { count } = await supabase.from("documents").select("id", { count: "exact", head: true }).in("id", docIds).eq("is_large_file", true);
    if (count) return fail("large_file_in_section");
  }

  const { data: siblings } = await supabase.from("closing_sections").select("id, position").eq("folder_document_id", folderId).order("position");
  const others = (siblings ?? []).filter((s) => s.id !== sectionId);
  const target = position == null ? others.length : Math.max(0, Math.min(position, others.length));
  const me = auth.session.collaborator.id;
  let id = sectionId;
  const row = { ...v, flow_id: ["report", "certificate", "reference"].includes(v.type) ? v.flow_id : null, updated_by: me };
  if (id) {
    const { error } = await supabase.from("closing_sections").update(row).eq("id", id).eq("folder_document_id", folderId);
    if (error) return fail(dbError(error));
  } else {
    const { data, error } = await supabase.from("closing_sections").insert({ ...row, folder_document_id: folderId, position: target, created_by: me }).select("id").single();
    if (error || !data) return fail(dbError(error));
    id = data.id;
  }
  // Positions : la section prend la place demandée, les autres se décalent.
  const order = [...others.map((s) => s.id)];
  order.splice(target, 0, id!);
  await Promise.all(order.map((sid, i) => supabase.from("closing_sections").update({ position: i }).eq("id", sid)));

  const { data: existing } = await supabase.from("closing_section_items").select("id, document_id, emm_element_id, added_at").eq("section_id", id!);
  const keep = new Map((existing ?? []).map((e) => [`${e.document_id ?? ""}|${e.emm_element_id ?? ""}`, e.added_at]));
  await supabase.from("closing_section_items").delete().eq("section_id", id!);
  if (items.length) {
    const { error } = await supabase.from("closing_section_items").insert(items.map((i, n) => ({
      section_id: id!, document_id: i.document_id, version_id: i.version_id, emm_element_id: i.emm_element_id ?? null, position: n,
      added_at: keep.get(`${i.document_id ?? ""}|${i.emm_element_id ?? ""}`) ?? new Date().toISOString(),
    })));
    if (error) return fail(dbError(error));
  }
  revalidate(folder.project_id);
  return ok({ id: id! });
}

export async function deleteSection(sectionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: s } = await supabase.from("closing_sections").select("folder_document_id").eq("id", sectionId).maybeSingle();
  if (!s) return fail("not_found");
  const folder = await folderContext(s.folder_document_id);
  if (!folder) return fail("not_found");
  const auth = await authorize("DashboardClosingFolder", "delete", folder.project_id);
  if ("error" in auth) return fail(auth.error);
  const { error } = await supabase.from("closing_sections").delete().eq("id", sectionId);
  if (error) return fail(dbError(error));
  revalidate(folder.project_id);
  return ok(undefined);
}

/** Glisser / monter-descendre une section dans le dossier (« Arrangement enregistré »). */
export async function reorderSections(folderId: string, ids: string[]): Promise<ActionResult> {
  const folder = await folderContext(folderId);
  if (!folder) return fail("not_found");
  const auth = await authorize("DashboardClosingFolder", "edit", folder.project_id);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const results = await Promise.all(ids.map((id, i) => supabase.from("closing_sections").update({ position: i }).eq("id", id).eq("folder_document_id", folderId)));
  const err = results.find((r) => r.error)?.error ?? null;
  if (err) return fail(dbError(err));
  revalidate(folder.project_id);
  return ok(undefined);
}

/** « Générer le dossier » / aperçu d'une section : tâche de fond pour le module de génération. */
export async function generateClosing(folderId: string, sectionId: string | null): Promise<ActionResult<{ taskId: string }>> {
  const folder = await folderContext(folderId);
  if (!folder) return fail("not_found");
  const auth = await authorize("DashboardClosingFolder", "generateDocument", folder.project_id);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: version } = await supabase.from("document_versions").select("id").eq("document_id", folderId).eq("is_last", true).single();
  if (!version) return fail("not_found");
  const { data, error } = await supabase.rpc("document_enqueue_generation", {
    p_version_id: version.id, p_action: sectionId ? "closing_section" : "closing_folder", p_extra: sectionId ? { section_id: sectionId } : {},
  });
  if (error || !data) return fail(error?.message ?? "unknown");
  scheduleDocumentGeneration([data]);
  if (sectionId) await supabase.from("closing_sections").update({ last_generated_at: new Date().toISOString() }).eq("id", sectionId);
  revalidate(folder.project_id);
  return ok({ taskId: data });
}
