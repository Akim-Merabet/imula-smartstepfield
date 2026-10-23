"use server";

import { revalidatePath } from "next/cache";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { saveCustomFieldValues } from "@/lib/custom-fields/server";
import { createClient } from "@/lib/supabase/server";
import type { Json, TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
import { isExtern, LARGE_FILE_THRESHOLD, LIBRARY_IMPORT_MAX, type VersionAction } from "./meta";
import { scheduleDocumentGeneration } from "./pdf/trigger";
import { documentSchema, type DocumentInput } from "./schema";

/** Codes métier levés par les fonctions SQL (P0001) ; repli sur dbError. */
const DOMAIN_ERRORS = new Set([
  "invalid_index", "start_index_locked", "immutable", "not_versioned", "library_action", "referential_locked", "not_last",
  "invalid_state", "invalid_action", "file_required", "internal_validation_incomplete", "contributors_required",
  "response_date_required", "user_required", "date_required", "sub_index_state", "keep_one_index", "in_use", "too_many",
  "already_imported", "no_file", "inconsistent_versions", "not_found",
]);
function docError(error: { code?: string; message?: string } | null) {
  if (error?.message && DOMAIN_ERRORS.has(error.message)) return error.message;
  if (error?.code === "23505") return "unique_content";
  return dbError(error);
}

const routeOf = (scope: "project" | "library", nature?: string) =>
  scope === "library" ? "LibraryDocuments" : nature === "rfi" ? "DashboardClosingFolder" : "DashboardDocuments";

async function documentScope(documentId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("id, scope, project_id, account_id, nature, source, origin, family_id, name")
    .eq("id", documentId).maybeSingle();
  return data;
}

function revalidate(projectId: string | null) {
  if (projectId) {
    revalidatePath(`/explore/projects/${projectId}/dashboard/documents`);
    revalidatePath(`/explore/projects/${projectId}/dashboard/closing-folder`);
  } else revalidatePath("/explore/library/documents");
}

/** Colonnes de contenu propres à la nature (le reste est forcé à null). */
function contentColumns(v: ReturnType<typeof documentSchema.parse>) {
  return {
    linked_flow_id: v.linked_flow_id, linked_form_id: v.linked_form_id, linked_response_id: v.linked_response_id,
    linked_diagram_id: v.linked_diagram_id, linked_list_id: v.linked_list_id,
    responses_strategy: v.responses_strategy ?? null, form_content_location: v.form_content_location ?? "none",
    preamble: v.preamble, subject: v.subject, glossary: v.glossary, options: (v.options ?? {}) as Json,
    client_cover_page: v.client_cover_page ?? false, highlight_changes: v.highlight_changes ?? false,
  };
}

async function saveSelections(documentId: string, selections: Record<string, string[]> | undefined) {
  if (!selections) return null;
  const supabase = await createClient();
  for (const [kind, ids] of Object.entries(selections)) {
    const { error } = await supabase.from("document_selections").delete().eq("document_id", documentId).eq("kind", kind as never);
    if (error) return error;
    if (ids.length) {
      const { error: e2 } = await supabase.from("document_selections")
        .insert(ids.map((ref_id, position) => ({ document_id: documentId, kind: kind as never, ref_id, position })));
      if (e2) return e2;
    }
  }
  return null;
}

// ===== Création / édition ========================================================
export async function createDocument(scope: "project" | "library", projectId: string | null, input: DocumentInput):
  Promise<ActionResult<{ id: string; versionId: string | null }>> {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const v = parsed.data;
  const auth = await authorize(routeOf(scope, v.nature), "add", projectId);
  if ("error" in auth) return fail(auth.error);
  if (scope === "library" && !isExtern(v.nature)) return fail("invalid");
  const { collaborator, account } = auth.session;
  const supabase = await createClient();

  let accountId = scope === "library" ? v.account_id ?? collaborator.account_id : collaborator.account_id;
  let languages = { language_1: account.doc_language_1, language_2: account.doc_language_2 };
  if (projectId) {
    const { data: project } = await supabase.from("projects").select("account_id, export_language_1, export_language_2").eq("id", projectId).single();
    if (!project) return fail("not_found");
    accountId = project.account_id;
    if (project.export_language_1 !== "none") languages = { language_1: project.export_language_1, language_2: project.export_language_2 };
  }
  if (languages.language_1 === "none") languages.language_1 = "fr";
  if (languages.language_2 === languages.language_1) languages.language_2 = "none";

  const row: TablesInsert<"documents"> = {
    organization_id: collaborator.organization_id, account_id: accountId, scope, project_id: projectId,
    nature: v.nature, source: v.source, name: v.name, ref_int: v.ref_int, ref_ext: v.ref_ext,
    start_index: isExtern(v.nature) && v.nature === "pdf_unversioned" ? null : v.start_index,
    family_id: v.family_id, category_id: v.category_id, closing_category_id: v.closing_category_id,
    folder_template_id: v.nature === "rfi" ? v.folder_template_id : null,
    index_format: account.doc_index_format, ...languages, ...contentColumns(v),
    created_by: collaborator.id, updated_by: collaborator.id,
  };
  const { data, error } = await supabase.from("documents").insert(row).select("id").single();
  if (error || !data) return fail(docError(error));

  await saveSelections(data.id, v.selections);
  if (v.custom_fields) await saveCustomFieldValues({ accountId, businessClass: "document", objectId: data.id, values: v.custom_fields, updatedBy: collaborator.id });

  const { data: version } = await supabase.from("document_versions").select("id").eq("document_id", data.id).eq("is_last", true).maybeSingle();
  // Dossier de clôture : sections du modèle choisi.
  if (v.nature === "rfi" && v.folder_template_id) {
    const { data: templates } = await supabase.from("closing_section_templates").select("*").eq("folder_template_id", v.folder_template_id).order("position");
    if (templates?.length) {
      await supabase.from("closing_sections").insert(templates.map((s, i) => ({
        folder_document_id: data.id, type: s.type, name: s.name, description: s.description, category_id: s.category_id,
        include_previous_versions: s.include_previous_versions, all_emm_elements: s.all_emm_elements, position: i,
        created_by: collaborator.id, updated_by: collaborator.id,
      })));
    }
  }
  // Document généré : aperçu mis en file pour l'agent de génération (état « En attente »).
  if (version && !isExtern(v.nature) && v.nature !== "rfi") {
    const { data: taskId } = await supabase.rpc("document_enqueue_generation", { p_version_id: version.id, p_action: "preview" });
    scheduleDocumentGeneration([taskId]);
  }
  revalidate(projectId);
  return ok({ id: data.id, versionId: version?.id ?? null });
}

export async function updateDocument(documentId: string, input: DocumentInput): Promise<ActionResult> {
  const doc = await documentScope(documentId);
  if (!doc) return fail("not_found");
  const auth = await authorize(routeOf(doc.scope, doc.nature), "edit", doc.project_id);
  if ("error" in auth) return fail(auth.error);
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const v = parsed.data;
  const supabase = await createClient();
  const { data: current } = await supabase.from("documents").select("start_index, content_disabled, nature").eq("id", documentId).single();
  if (current?.content_disabled) return fail("library_action");

  const update: TablesUpdate<"documents"> = {
    name: v.name, ref_int: v.ref_int, ref_ext: v.ref_ext, family_id: v.family_id,
    category_id: v.category_id, closing_category_id: v.closing_category_id,
    ...(doc.scope === "library" && v.account_id ? { account_id: v.account_id } : {}),
    ...contentColumns(v),
    // Bascule « depuis une liste » ↔ « depuis plusieurs flows » seulement.
    nature: v.nature,
    updated_by: auth.session.collaborator.id,
  };
  if (v.language_1) {
    update.language_1 = v.language_1 === "none" ? "fr" : v.language_1;
    update.language_2 = v.language_2 && v.language_2 !== update.language_1 ? v.language_2 : "none";
  }
  const { error } = await supabase.from("documents").update(update).eq("id", documentId);
  if (error) return fail(docError(error));

  if (v.start_index && v.start_index !== current?.start_index) {
    const { data: last } = await supabase.from("document_versions").select("id").eq("document_id", documentId).eq("is_last", true).single();
    if (last) {
      const { error: e2 } = await supabase.rpc("document_version_action", { p_version_id: last.id, p_action: "set_start_index", p_payload: { index: v.start_index } });
      if (e2) return fail(docError(e2));
    }
  }
  const selError = await saveSelections(documentId, v.selections);
  if (selError) return fail(docError(selError));
  if (v.custom_fields) await saveCustomFieldValues({ accountId: doc.account_id, businessClass: "document", objectId: documentId, values: v.custom_fields, updatedBy: auth.session.collaborator.id });
  revalidate(doc.project_id);
  return ok(undefined);
}

// ===== Suppression (avec conflits listés, §5.1) ====================================
export type DeleteConflicts = { flows: string[]; documents: string[]; sections: string[]; projects: string[] };

export async function deleteDocument(documentId: string): Promise<ActionResult<undefined>> {
  const doc = await documentScope(documentId);
  if (!doc) return fail("not_found");
  const auth = await authorize(routeOf(doc.scope, doc.nature), "delete", doc.project_id);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const conflicts: DeleteConflicts = { flows: [], documents: [], sections: [], projects: [] };

  if (doc.scope === "library") {
    const { data } = await supabase.from("documents").select("project:projects(designation)").eq("library_source_id", documentId).is("deleted_at", null);
    conflicts.projects = (data ?? []).map((r) => (r.project as { designation: string } | null)?.designation ?? "—");
    if (conflicts.projects.length) return fail("imported", conflicts);
  } else {
    const { data: links } = await supabase.from("block_documents")
      .select("flow:flows(name, deleted_at), block:blocks(step:steps(position, phase:phases(position)))").eq("document_id", documentId);
    conflicts.flows = (links ?? []).filter((l) => !(l.flow as { deleted_at: string | null } | null)?.deleted_at).map((l) => {
      const step = (l.block as { step: { position: number; phase: { position: number } | null } | null } | null)?.step;
      return JSON.stringify({ flowName: (l.flow as { name: string } | null)?.name ?? "—", phaseOrder: (step?.phase?.position ?? 0) + 1, stepOrder: (step?.position ?? 0) + 1 });
    });
    const { data: lda } = await supabase.from("document_selections").select("document:documents(name, deleted_at)").eq("kind", "document").eq("ref_id", documentId);
    conflicts.documents = (lda ?? []).map((r) => r.document as { name: string; deleted_at: string | null } | null)
      .filter((d) => d && !d.deleted_at).map((d) => d!.name);
    const { data: items } = await supabase.from("closing_section_items").select("section:closing_sections(name)").eq("document_id", documentId);
    conflicts.sections = (items ?? []).map((r) => (r.section as { name: string } | null)?.name ?? "—");
    if (conflicts.flows.length || conflicts.documents.length || conflicts.sections.length) return fail("in_use", conflicts);
  }
  const { error } = await supabase.from("documents")
    .update({ deleted_at: new Date().toISOString(), deleted_by: auth.session.collaborator.id }).eq("id", documentId);
  if (error) return fail(docError(error));
  revalidate(doc.project_id);
  return ok(undefined);
}

// ===== Suivi : transitions (machine à états SQL) ===================================
export async function versionAction(versionId: string, action: VersionAction, payload: Record<string, unknown> = {}):
  Promise<ActionResult<{ versionId: string; taskId: string | null }>> {
  const supabase = await createClient();
  const { data: version } = await supabase.from("document_versions").select("document_id").eq("id", versionId).maybeSingle();
  if (!version) return fail("not_found");
  const doc = await documentScope(version.document_id);
  if (!doc) return fail("not_found");
  const auth = await authorize(routeOf(doc.scope, doc.nature), "edit", doc.project_id);
  if ("error" in auth) return fail(auth.error);
  const { data, error } = await supabase.rpc("document_version_action", { p_version_id: versionId, p_action: action, p_payload: payload as Json });
  if (error) return fail(docError(error));
  const res = (data ?? {}) as { version_id?: string; task_id?: string | null };
  if (res.task_id) scheduleDocumentGeneration([res.task_id]);
  revalidate(doc.project_id);
  return ok({ versionId: res.version_id ?? versionId, taskId: res.task_id ?? null });
}

// ===== Bibliothèque ==============================================================
export async function importFromLibrary(projectId: string, ids: string[]): Promise<ActionResult<{ count: number }>> {
  const auth = await authorize("DashboardDocuments", "import", projectId);
  if ("error" in auth) return fail(auth.error);
  if (ids.length > LIBRARY_IMPORT_MAX) return fail("too_many");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("document_import_from_library", { p_project_id: projectId, p_ids: ids });
  if (error) return fail(docError(error));
  revalidate(projectId);
  return ok({ count: data ?? 0 });
}

export async function refreshFromLibrary(documentId: string): Promise<ActionResult> {
  const doc = await documentScope(documentId);
  if (!doc) return fail("not_found");
  const auth = await authorize("DashboardDocuments", "edit", doc.project_id);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("document_refresh_from_library", { p_document_id: documentId });
  if (error) return fail(docError(error), { name: doc.name });
  revalidate(doc.project_id);
  return ok(undefined);
}

/** « Mettre à jour tous les documents déjà importés » : ignore les incohérences et renvoie leurs noms. */
export async function refreshAllFromLibrary(projectId: string): Promise<ActionResult<{ updated: number; failed: string[] }>> {
  const auth = await authorize("DashboardDocuments", "edit", projectId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("id, name").eq("project_id", projectId)
    .eq("library_update_available", true).is("deleted_at", null);
  let updated = 0; const failed: string[] = [];
  for (const d of data ?? []) {
    const { error } = await supabase.rpc("document_refresh_from_library", { p_document_id: d.id });
    if (error) failed.push(d.name); else updated++;
  }
  revalidate(projectId);
  return ok({ updated, failed });
}

// ===== Réorganisation (catégories en masse) =======================================
export async function reorganizeDocuments(scope: "project" | "library", projectId: string | null, ids: string[],
  field: "category_id" | "closing_category_id", categoryId: string | null): Promise<ActionResult> {
  const auth = await authorize(scope === "library" ? "LibraryDocuments" : "DashboardDocuments", "edit", projectId);
  if ("error" in auth) return fail(auth.error);
  if (!ids.length) return fail("invalid");
  const supabase = await createClient();
  const patch: TablesUpdate<"documents"> = field === "category_id" ? { category_id: categoryId } : { closing_category_id: categoryId };
  const { error } = await supabase.from("documents").update({ ...patch, updated_by: auth.session.collaborator.id }).in("id", ids);
  if (error) return fail(docError(error));
  revalidate(projectId);
  return ok(undefined);
}

// ===== Fichiers des PDF sans version (onglet Contenu, §3.4.4) =====================
export async function addDocumentFiles(documentId: string, files: { path: string; name: string; size: number }[]): Promise<ActionResult> {
  const doc = await documentScope(documentId);
  if (!doc) return fail("not_found");
  const auth = await authorize(routeOf(doc.scope, doc.nature), "edit", doc.project_id);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { count } = await supabase.from("document_files").select("id", { count: "exact", head: true }).eq("document_id", documentId);
  const { error } = await supabase.from("document_files").insert(files.map((f, i) => ({
    document_id: documentId, storage_path: f.path, name: f.name, size: f.size, position: (count ?? 0) + i, created_by: auth.session.collaborator.id,
  })));
  if (error) return fail(docError(error));
  await syncLargeFlag(documentId);
  revalidate(doc.project_id);
  return ok(undefined);
}

export async function removeDocumentFile(fileId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: file } = await supabase.from("document_files").select("id, document_id, storage_path").eq("id", fileId).maybeSingle();
  if (!file) return fail("not_found");
  const doc = await documentScope(file.document_id);
  if (!doc) return fail("not_found");
  const auth = await authorize(routeOf(doc.scope, doc.nature), "edit", doc.project_id);
  if ("error" in auth) return fail(auth.error);
  const { count } = await supabase.from("document_files").select("id", { count: "exact", head: true }).eq("document_id", file.document_id);
  if ((count ?? 0) <= 1) return fail("keep_one_file");
  const { error } = await supabase.from("document_files").delete().eq("id", fileId);
  if (error) return fail(docError(error));
  await syncLargeFlag(file.document_id);
  revalidate(doc.project_id);
  return ok(undefined);
}

async function syncLargeFlag(documentId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("document_files").select("size").eq("document_id", documentId);
  const large = (data ?? []).some((f) => f.size > LARGE_FILE_THRESHOLD);
  await supabase.from("documents").update({ is_large_file: large }).eq("id", documentId);
}

/** URL signée (1 h) d'un fichier du bucket « documents » — la politique Storage applique les droits. */
export async function getSignedUrl(path: string, download?: string): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 3600, download ? { download } : undefined);
  if (error || !data) return fail("not_found");
  return ok({ url: data.signedUrl });
}

/** PDF de la dernière version (externe : fichier de l'indice ; sans version : premier fichier ; généré : PDF figé). */
export async function getLastPdfUrl(documentId: string): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient();
  const { data: versions } = await supabase.from("document_versions").select("pdf_path").eq("document_id", documentId)
    .not("pdf_path", "is", null).order("seq", { ascending: false }).limit(1);
  let path = versions?.[0]?.pdf_path ?? null;
  if (!path) {
    const { data: files } = await supabase.from("document_files").select("storage_path").eq("document_id", documentId).order("position").limit(1);
    path = files?.[0]?.storage_path ?? null;
  }
  if (!path) return fail("no_pdf");
  return getSignedUrl(path);
}
