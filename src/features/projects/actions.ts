"use server";

import { revalidatePath } from "next/cache";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { saveCustomFieldValues } from "@/lib/custom-fields/server";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";
import { projectSchema, type ProjectInput } from "./schema";

export async function createProject(input: ProjectInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("Projects", "add");
  if ("error" in auth) return fail(auth.error);
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const { custom_fields, status_comment, ...values } = parsed.data;
  void status_comment;
  const { collaborator } = auth.session;

  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").insert({
    ...values,
    type: values.type as Enums<"project_type">,
    organization_id: collaborator.organization_id,
    account_id: collaborator.account_id,
    created_by: collaborator.id,
    updated_by: collaborator.id,
  }).select("id, custom_status_id").single();
  if (error || !data) return fail(dbError(error));

  // Le créateur devient Responsable de l'entité.
  await supabase.from("project_members").insert({ project_id: data.id, collaborator_id: collaborator.id, role: "responsible" });
  await supabase.from("project_status_history").insert({
    project_id: data.id, from_status_id: null, to_status_id: data.custom_status_id, actor_id: collaborator.id,
  });
  await saveCustomFieldValues({ accountId: collaborator.account_id, businessClass: "project", objectId: data.id, values: custom_fields, updatedBy: collaborator.id });

  revalidatePath("/explore/projects");
  return ok({ id: data.id });
}

export async function updateProject(projectId: string, input: ProjectInput): Promise<ActionResult> {
  const auth = await authorize("Projects", "edit", projectId);
  if ("error" in auth) return fail(auth.error);
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const { custom_fields, status_comment, type, client_id, export_language_1, export_language_2, ...values } = parsed.data;
  void type; void client_id; void export_language_1; void export_language_2; // non modifiables après création
  const { collaborator } = auth.session;

  const supabase = await createClient();
  const { data: before } = await supabase.from("projects").select("custom_status_id, account_id").eq("id", projectId).single();
  const { error } = await supabase.from("projects").update({ ...values, updated_by: collaborator.id }).eq("id", projectId);
  if (error) return fail(dbError(error));

  if (before && values.custom_status_id && before.custom_status_id !== values.custom_status_id) {
    await supabase.from("project_status_history").insert({
      project_id: projectId, from_status_id: before.custom_status_id, to_status_id: values.custom_status_id,
      comment: status_comment, actor_id: collaborator.id,
    });
  }
  await saveCustomFieldValues({ accountId: before?.account_id ?? collaborator.account_id, businessClass: "project", objectId: projectId, values: custom_fields, updatedBy: collaborator.id });

  revalidatePath("/explore/projects");
  revalidatePath(`/explore/projects/${projectId}`, "layout");
  return ok(undefined);
}

export async function deleteProject(projectId: string): Promise<ActionResult> {
  const auth = await authorize("Projects", "delete", projectId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { count } = await supabase.from("projects").select("id", { count: "exact", head: true })
    .eq("folder_id", projectId).is("deleted_at", null);
  if (count) return fail("has_sub_folders");
  const { error } = await supabase.from("projects")
    .update({ deleted_at: new Date().toISOString(), deleted_by: auth.session.collaborator.id }).eq("id", projectId);
  if (error) return fail(dbError(error));
  revalidatePath("/explore/projects");
  return ok(undefined);
}

export async function setProjectPublished(projectId: string, published: boolean): Promise<ActionResult> {
  const auth = await authorize("Projects", "publish");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ published, updated_by: auth.session.collaborator.id }).eq("id", projectId);
  if (error) return fail(dbError(error));
  revalidatePath("/explore/projects");
  return ok(undefined);
}

export async function setProjectArchived(projectId: string, archived: boolean): Promise<ActionResult> {
  const auth = await authorize("Projects", "edit", projectId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ archived, updated_by: auth.session.collaborator.id }).eq("id", projectId);
  if (error) return fail(dbError(error));
  revalidatePath("/explore/projects");
  return ok(undefined);
}
