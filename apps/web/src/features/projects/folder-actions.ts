"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { saveCustomFieldValues } from "@/lib/custom-fields/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueJob } from "@/features/jobs/server";
import { projectSchema, type ProjectInput } from "./schema";

const REFERENTIAL_FLOW_TYPES = ["referential", "referential_generic", "group_referential", "referential_intervention", "local_referential"] as const;

const duplicateSchema = z.object({
  sourceId: z.uuid(),
  type: z.enum(["project", "referential", "template", "folder"]),
  name: z.string().trim().min(3).max(255),
  clientId: z.uuid(),
  index: z.string().trim().max(255).optional(),
});
export type DuplicateInput = z.input<typeof duplicateSchema>;

/** Duplication d'entité (spec 01 §5.6) : mise en file, traitement en tâche de fond. */
export async function duplicateProject(input: DuplicateInput): Promise<ActionResult<{ jobId: string }>> {
  const parsed = duplicateSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const { sourceId, type, name, clientId, index } = parsed.data;
  const supabase = await createClient();
  const { data: source } = await supabase.from("projects").select("id, type, is_sub_folder, account_id, designation")
    .eq("id", sourceId).is("deleted_at", null).maybeSingle();
  if (!source) return fail("not_found");
  if (source.type === "pgac" || (source.type === "folder" && !source.is_sub_folder)) return fail("not_duplicable");
  if ((source.type === "folder") !== (type === "folder")) return fail("invalid_type");
  const auth = await authorize(source.type === "folder" ? "ProjectFolder" : "Projects", "duplicate", sourceId);
  if ("error" in auth) return fail(auth.error);

  const t = await getTranslations("projects.duplicate");
  const jobId = await enqueueJob(supabase, {
    kind: "duplicate_project", accountId: source.account_id, projectId: sourceId, requestedBy: auth.session.collaborator.id,
    label: t("taskLabel", { name: source.designation }),
    params: { source_id: sourceId, type, name, client_id: clientId, index: index || null },
  });
  if (!jobId) return fail("unknown");
  return ok({ jobId });
}

/** « Convertir en dossier » : un référentiel devient un dossier référentiel (spec 01 §5.7). */
export async function convertToFolder(projectId: string): Promise<ActionResult> {
  const auth = await authorize("ProjectFolder", "edit", projectId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("convert_referential_to_folder", { p_project_id: projectId });
  if (error) return fail(error.message.includes("not_convertible") ? "not_convertible" : dbError(error));
  revalidatePath("/explore/projects");
  revalidatePath(`/explore/projects/${projectId}`, "layout");
  return ok(undefined);
}

/** Création d'un sous-dossier référentiel dans un dossier (type Folder, isSubFolder, Indice). */
export async function createSubFolder(folderId: string, input: ProjectInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("ProjectFolder", "add", folderId);
  if ("error" in auth) return fail(auth.error);
  const parsed = projectSchema.safeParse({ ...input, type: "project" });
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const { custom_fields, status_comment, type, ...values } = parsed.data;
  void status_comment; void type;
  const { collaborator } = auth.session;
  const supabase = await createClient();
  const { data: folder } = await supabase.from("projects").select("id, type, is_sub_folder, account_id, organization_id")
    .eq("id", folderId).is("deleted_at", null).maybeSingle();
  if (!folder || folder.type !== "folder" || folder.is_sub_folder) return fail("not_found");

  const { data, error } = await supabase.from("projects").insert({
    ...values, type: "folder", is_sub_folder: true, folder_id: folderId,
    organization_id: folder.organization_id, account_id: folder.account_id, created_by: collaborator.id, updated_by: collaborator.id,
  }).select("id, custom_status_id").single();
  if (error || !data) return fail(dbError(error));
  await supabase.from("project_members").insert({ project_id: data.id, collaborator_id: collaborator.id, role: "responsible" });
  await supabase.from("project_status_history").insert({
    project_id: data.id, from_status_id: null, to_status_id: data.custom_status_id, actor_id: collaborator.id,
  });
  await saveCustomFieldValues({ accountId: folder.account_id, businessClass: "project", objectId: data.id, values: custom_fields, updatedBy: collaborator.id });
  revalidatePath(`/explore/folder/${folderId}`);
  return ok({ id: data.id });
}

const prepareSchema = z.object({ subFolderId: z.uuid(), name: z.string().trim().min(3).max(255), clientId: z.uuid() });

/** « Préparer » un sous-dossier : création asynchrone d'une entité Projet à partir de ses flows référentiels. */
export async function prepareSubFolder(input: z.input<typeof prepareSchema>): Promise<ActionResult<{ jobId: string }>> {
  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const { subFolderId, name, clientId } = parsed.data;
  const auth = await authorize("ProjectFolder", "executeFlowRef", subFolderId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: sub } = await supabase.from("projects").select("id, type, is_sub_folder, account_id, designation, project_index")
    .eq("id", subFolderId).is("deleted_at", null).maybeSingle();
  if (!sub || sub.type !== "folder" || !sub.is_sub_folder) return fail("not_sub_folder");
  const { count } = await supabase.from("flows").select("id", { count: "exact", head: true })
    .eq("project_id", subFolderId).is("deleted_at", null).in("flow_type", [...REFERENTIAL_FLOW_TYPES]);
  if (!count) return fail("no_flows");

  const t = await getTranslations("folders.prepare");
  const jobId = await enqueueJob(supabase, {
    kind: "prepare_folder", accountId: sub.account_id, projectId: subFolderId, requestedBy: auth.session.collaborator.id,
    label: t("taskLabel", { name: sub.designation, index: sub.project_index ?? "-" }),
    params: { folder_id: subFolderId, name, client_id: clientId },
  });
  if (!jobId) return fail("unknown");
  return ok({ jobId });
}
