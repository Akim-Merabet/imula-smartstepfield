"use server";

import { revalidatePath } from "next/cache";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { IMPORT_LIMIT } from "./meta";
import { canWriteLibraryNature, creatableNatures } from "./permissions";
import { duplicateSchema, formInfoSchema, type FormInfoInput } from "./schema";
import { clearStructure, copyStructure, ensureVersion, loadFormStructure } from "./server/structure";

const LIB_PATH = "/explore/library/forms";
const projectPath = (projectId: string) => `/explore/projects/${projectId}/dashboard/forms`;

async function setCompanies(formId: string, companyIds: string[]) {
  const supabase = await createClient();
  await supabase.from("form_companies").delete().eq("form_id", formId);
  if (companyIds.length) await supabase.from("form_companies").insert(companyIds.map((company_id) => ({ form_id: formId, company_id })));
}

function infoColumns(v: ReturnType<typeof formInfoSchema.parse>) {
  return {
    name: v.name, description: v.description, reference: v.reference, index_label: v.index_label, family_id: v.family_id,
    custom_status_id: v.custom_status_id ?? null, additional_comment: v.additional_comment, additional_observation: v.additional_observation,
    lock_responses: v.lock_responses, object_attributes_link: v.object_attributes_link,
    object_family_id: v.object_attributes_link === "other_family" ? v.object_family_id ?? null : null,
    pdf_template: v.pdf_template as Json, hide_in_exports: v.hide_in_exports as Json,
  };
}

// ============================================================================================
// Bibliothèque
// ============================================================================================
export async function createLibraryForm(input: FormInfoInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("LibraryForms", "add");
  if ("error" in auth) return fail(auth.error);
  const parsed = formInfoSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const v = parsed.data;
  const { collaborator } = auth.session;
  if (v.nature !== "model" && v.nature !== "generic") return fail("invalid");
  if (!creatableNatures(collaborator).includes(v.nature)) return fail("forbidden");
  const supabase = await createClient();
  const id = crypto.randomUUID();
  const { error } = await supabase.from("forms").insert({
    id, lineage_id: id, location: "library", nature: v.nature, ...infoColumns(v),
    organization_id: collaborator.organization_id, account_id: v.account_id ?? collaborator.account_id,
    created_by: collaborator.id, updated_by: collaborator.id,
  });
  if (error) return fail(dbError(error));
  await setCompanies(id, v.company_ids);
  revalidatePath(LIB_PATH);
  return ok({ id });
}

/** Éditer les informations (bibliothèque ou entité). La nature n'est pas modifiable ici. */
export async function updateFormInfo(formId: string, input: FormInfoInput): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: form } = await supabase.from("forms").select("id, location, project_id, nature").eq("id", formId).maybeSingle();
  if (!form) return fail("not_found");
  const auth = form.location === "library"
    ? await authorize("LibraryForms", "edit")
    : await authorize("DashboardForms", "edit", form.project_id);
  if ("error" in auth) return fail(auth.error);
  if (form.location === "library" && !canWriteLibraryNature(auth.session.collaborator, form.nature)) return fail("forbidden");
  const parsed = formInfoSchema.safeParse({ ...input, nature: form.nature });
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const { error, count } = await supabase.from("forms")
    .update({ ...infoColumns(parsed.data), updated_by: auth.session.collaborator.id }, { count: "exact" }).eq("id", formId);
  if (error) return fail(dbError(error));
  if (!count) return fail("forbidden");
  await setCompanies(formId, parsed.data.company_ids);
  revalidatePath(form.location === "library" ? LIB_PATH : projectPath(form.project_id!));
  return ok(undefined);
}

/** Dupliquer avec changement de type (spec 03 §2.5) ; les attributs d'objet ne sont pas dupliqués. */
export async function duplicateLibraryForm(formId: string, input: { nature: "model" | "generic"; name: string }): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("LibraryForms", "duplicate");
  if ("error" in auth) return fail(auth.error);
  const parsed = duplicateSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { collaborator } = auth.session;
  if (!creatableNatures(collaborator).includes(parsed.data.nature)) return fail("forbidden");
  const supabase = await createClient();
  const source = await loadFormStructure(supabase, formId);
  if (!source || source.form.location !== "library") return fail("not_found");
  const s = source.form;
  const id = crypto.randomUUID();
  const { error } = await supabase.from("forms").insert({
    id, lineage_id: id, location: "library", nature: parsed.data.nature, name: parsed.data.name,
    description: s.description, reference: s.reference, index_label: s.index_label, family_id: s.family_id,
    custom_status_id: s.custom_status_id, additional_comment: s.additional_comment, additional_observation: s.additional_observation,
    lock_responses: s.lock_responses, object_attributes_link: parsed.data.nature === "model" ? s.object_attributes_link : "disabled",
    object_family_id: parsed.data.nature === "model" ? s.object_family_id : null, pdf_template: s.pdf_template, hide_in_exports: s.hide_in_exports,
    organization_id: s.organization_id, account_id: s.account_id, created_by: collaborator.id, updated_by: collaborator.id,
  });
  if (error) return fail(dbError(error));
  const { data: companies } = await supabase.from("form_companies").select("company_id").eq("form_id", formId);
  await setCompanies(id, (companies ?? []).map((c) => c.company_id));
  const copyError = await copyStructure(supabase, source, id, false, { skipObjectAttributes: true });
  if (copyError) {
    await supabase.from("forms").delete().eq("id", id);
    return fail(copyError === "42501" ? "forbidden" : "unknown");
  }
  revalidatePath(LIB_PATH);
  return ok({ id });
}

export async function setLibraryFormArchived(formId: string, archived: boolean): Promise<ActionResult> {
  const auth = await authorize("LibraryForms", "archive");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error, count } = await supabase.from("forms")
    .update({ archived, updated_by: auth.session.collaborator.id }, { count: "exact" }).eq("id", formId).eq("location", "library");
  if (error) return fail(dbError(error));
  if (!count) return fail("forbidden");
  revalidatePath(LIB_PATH);
  return ok(undefined);
}

/** Supprimer (corbeille) — refusé si le formulaire est importé dans une entité (trigger SQL). */
export async function deleteLibraryForm(formId: string): Promise<ActionResult<undefined>> {
  const auth = await authorize("LibraryForms", "delete");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: imports } = await supabase.from("forms").select("project:projects(designation)")
    .eq("sourced_from_form_id", formId).eq("location", "project").is("deleted_at", null);
  if (imports?.length) {
    return fail("form_imported", (imports ?? []).map((i) => (i.project as { designation: string } | null)?.designation ?? "—"));
  }
  const { error, count } = await supabase.from("forms")
    .update({ deleted_at: new Date().toISOString(), updated_by: auth.session.collaborator.id }, { count: "exact" })
    .eq("id", formId).eq("location", "library");
  if (error) return fail(error.message?.includes("form_imported") ? "form_imported" : dbError(error), []);
  if (!count) return fail("forbidden");
  revalidatePath(LIB_PATH);
  return ok(undefined);
}

// ============================================================================================
// Formulaires d'une entité
// ============================================================================================
type ImportResult = { imported: number; conflicts: string[]; notImportable: string[] };

/** Importer depuis la bibliothèque (max 10, statut importable, copie relationnelle avec mêmes lineage_id). */
export async function importLibraryForms(projectId: string, formIds: string[]): Promise<ActionResult<ImportResult>> {
  const auth = await authorize("DashboardForms", "import", projectId);
  if ("error" in auth) return fail(auth.error);
  if (formIds.length === 0) return fail("invalid");
  if (formIds.length > IMPORT_LIMIT) return fail("size_limit");
  const { collaborator } = auth.session;
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("id, organization_id, account_id").eq("id", projectId).maybeSingle();
  if (!project) return fail("not_found");
  const { data: existing } = await supabase.from("forms").select("sourced_from_form_id").eq("project_id", projectId)
    .eq("origin", "imported").is("deleted_at", null);
  const already = new Set((existing ?? []).map((f) => f.sourced_from_form_id));
  const result: ImportResult = { imported: 0, conflicts: [], notImportable: [] };

  for (const formId of formIds) {
    const source = await loadFormStructure(supabase, formId);
    if (!source || source.form.location !== "library" || source.form.deleted_at) continue;
    const s = source.form;
    if (already.has(s.id)) { result.conflicts.push(s.name); continue; }
    const { data: status } = s.custom_status_id
      ? await supabase.from("custom_statuses").select("importable").eq("id", s.custom_status_id).maybeSingle()
      : { data: null };
    if (s.archived || (s.custom_status_id && !status?.importable)) { result.notImportable.push(s.name); continue; }
    const version = await ensureVersion(supabase, s.id, collaborator.id);
    const id = crypto.randomUUID();
    const { error } = await supabase.from("forms").insert({
      id, lineage_id: s.lineage_id, location: "project", origin: "imported", project_id: projectId,
      sourced_from_form_id: s.id, sourced_from_version_id: version?.id ?? null, nature: s.nature, name: s.name,
      description: s.description, reference: s.reference, index_label: s.index_label, family_id: s.family_id,
      custom_status_id: s.custom_status_id, additional_comment: s.additional_comment, additional_observation: s.additional_observation,
      lock_responses: s.lock_responses, object_attributes_link: s.object_attributes_link, object_family_id: s.object_family_id,
      pdf_template: s.pdf_template, hide_in_exports: s.hide_in_exports,
      organization_id: project.organization_id, account_id: project.account_id, created_by: collaborator.id, updated_by: collaborator.id,
    });
    if (error) { if (error.code === "23505") result.conflicts.push(s.name); else return fail(dbError(error)); continue; }
    const { data: companies } = await supabase.from("form_companies").select("company_id").eq("form_id", s.id);
    await setCompanies(id, (companies ?? []).map((c) => c.company_id));
    const copyError = await copyStructure(supabase, source, id, true);
    if (copyError) { await supabase.from("forms").delete().eq("id", id); return fail(copyError === "42501" ? "forbidden" : "unknown"); }
    await ensureVersion(supabase, id, collaborator.id);
    result.imported++;
  }
  revalidatePath(projectPath(projectId));
  return ok(result);
}

/** « Mettre à jour » : réimporte la dernière version bibliothèque ; les réponses existantes gardent leur version. */
export async function refreshProjectForm(formId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: form } = await supabase.from("forms").select("id, project_id, origin, enabled, sourced_from_form_id").eq("id", formId).maybeSingle();
  if (!form || form.origin !== "imported" || !form.sourced_from_form_id) return fail("not_found");
  const auth = await authorize("DashboardForms", "import", form.project_id);
  if ("error" in auth) return fail(auth.error);
  if (!form.enabled) return fail("disabled");
  const source = await loadFormStructure(supabase, form.sourced_from_form_id);
  if (!source || source.form.deleted_at) return fail("source_missing");
  const s = source.form;
  const version = await ensureVersion(supabase, s.id, auth.session.collaborator.id);
  const clearError = await clearStructure(supabase, formId);
  if (clearError) return fail(dbError(clearError));
  const copyError = await copyStructure(supabase, source, formId, true);
  if (copyError) return fail(copyError === "42501" ? "forbidden" : "unknown");
  const { error } = await supabase.from("forms").update({
    name: s.name, description: s.description, reference: s.reference, index_label: s.index_label, family_id: s.family_id,
    additional_comment: s.additional_comment, additional_observation: s.additional_observation, lock_responses: s.lock_responses,
    object_attributes_link: s.object_attributes_link, object_family_id: s.object_family_id, pdf_template: s.pdf_template,
    hide_in_exports: s.hide_in_exports, sourced_from_version_id: version?.id ?? null, updated_by: auth.session.collaborator.id,
  }).eq("id", formId);
  if (error) return fail(dbError(error));
  await ensureVersion(supabase, formId, auth.session.collaborator.id);
  revalidatePath(projectPath(form.project_id!));
  return ok(undefined);
}

/** Mettre à jour tous les formulaires importés ayant une mise à jour disponible. */
export async function refreshAllProjectForms(projectId: string, formIds: string[]): Promise<ActionResult<{ updated: number }>> {
  const auth = await authorize("DashboardForms", "import", projectId);
  if ("error" in auth) return fail(auth.error);
  let updated = 0;
  for (const id of formIds) {
    const r = await refreshProjectForm(id);
    if (r.ok) updated++;
  }
  revalidatePath(projectPath(projectId));
  return ok({ updated });
}

/** Créer une copie locale (nature « Local », nouveaux lineage_id, indépendante). */
export async function createLocalCopy(formId: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const source = await loadFormStructure(supabase, formId);
  if (!source || source.form.location !== "project") return fail("not_found");
  const s = source.form;
  const auth = await authorize("DashboardForms", "duplicate", s.project_id);
  if ("error" in auth) return fail(auth.error);
  const id = crypto.randomUUID();
  const { error } = await supabase.from("forms").insert({
    id, lineage_id: id, location: "project", origin: "local", project_id: s.project_id, nature: "local", name: s.name,
    description: s.description, reference: s.reference, index_label: s.index_label, family_id: s.family_id,
    custom_status_id: s.custom_status_id, additional_comment: s.additional_comment, additional_observation: s.additional_observation,
    lock_responses: s.lock_responses, object_attributes_link: s.object_attributes_link, object_family_id: s.object_family_id,
    pdf_template: s.pdf_template, hide_in_exports: s.hide_in_exports,
    organization_id: s.organization_id, account_id: s.account_id, created_by: auth.session.collaborator.id, updated_by: auth.session.collaborator.id,
  });
  if (error) return fail(dbError(error));
  const { data: companies } = await supabase.from("form_companies").select("company_id").eq("form_id", formId);
  await setCompanies(id, (companies ?? []).map((c) => c.company_id));
  const copyError = await copyStructure(supabase, source, id, false);
  if (copyError) { await supabase.from("forms").delete().eq("id", id); return fail("unknown"); }
  revalidatePath(projectPath(s.project_id!));
  return ok({ id });
}

export async function setProjectFormEnabled(formId: string, enabled: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: form } = await supabase.from("forms").select("project_id").eq("id", formId).maybeSingle();
  if (!form?.project_id) return fail("not_found");
  const auth = await authorize("DashboardForms", "deactivate", form.project_id);
  if ("error" in auth) return fail(auth.error);
  const { error, count } = await supabase.from("forms")
    .update({ enabled, updated_by: auth.session.collaborator.id }, { count: "exact" }).eq("id", formId);
  if (error) return fail(dbError(error));
  if (!count) return fail("forbidden");
  revalidatePath(projectPath(form.project_id));
  return ok(undefined);
}

export type DeleteBlockers = { steps: { flow: string; phase: string; step: string }[]; responses: number };

/** Supprimer un formulaire d'entité : refusé s'il est lié à des étapes ou a des réponses (pas de corbeille). */
export async function deleteProjectForm(formId: string): Promise<ActionResult<undefined>> {
  const supabase = await createClient();
  const { data: form } = await supabase.from("forms").select("project_id").eq("id", formId).maybeSingle();
  if (!form?.project_id) return fail("not_found");
  const auth = await authorize("DashboardForms", "delete", form.project_id);
  if ("error" in auth) return fail(auth.error);
  const [{ data: links }, { count }] = await Promise.all([
    supabase.from("form_block_links").select("flow:flows(name), step:steps(name, position, phase:phases(name, position))").eq("form_id", formId),
    supabase.from("form_responses").select("id", { count: "exact", head: true }).eq("form_id", formId).is("deleted_at", null),
  ]);
  if (links?.length || count) {
    const blockers: DeleteBlockers = {
      responses: count ?? 0,
      steps: (links ?? []).map((l) => {
        const step = l.step as { name: string; position: number; phase: { name: string; position: number } | null } | null;
        return { flow: (l.flow as { name: string } | null)?.name ?? "—", phase: step?.phase?.name ?? "—", step: step?.name ?? "—" };
      }),
    };
    return fail("form_in_use", blockers);
  }
  const { error, count: deleted } = await supabase.from("forms").delete({ count: "exact" }).eq("id", formId);
  if (error) return fail(error.code === "23503" ? "form_in_use" : dbError(error), { steps: [], responses: 0 });
  if (!deleted) return fail("forbidden");
  revalidatePath(projectPath(form.project_id));
  return ok(undefined);
}
