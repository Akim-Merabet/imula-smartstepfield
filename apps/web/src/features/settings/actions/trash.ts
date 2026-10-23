"use server";

import { revalidatePath } from "next/cache";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

type Nature = "entity" | "flow" | "category" | "form" | "form_response";

async function isDeleted(table: "projects" | "flows" | "forms" | "label_families", id: string | null | undefined) {
  if (!id) return false;
  const supabase = await createClient();
  const { data } = await supabase.from(table).select("deleted_at").eq("id", id).maybeSingle();
  return !data || !!data.deleted_at;
}

/** Restaure un élément de la corbeille (spec 01 §6.15) avec les contrôles de cohérence. */
export async function restoreTrashItem(nature: Nature, id: string): Promise<ActionResult> {
  const auth = await authorize("SettingsTrash", "restore");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const restore = { deleted_at: null, deleted_by: null };
  let error: { code?: string; message?: string } | null = null;

  if (nature === "entity") {
    const { data } = await supabase.from("projects").select("type, folder_id").eq("id", id).single();
    if (!data) return fail("not_found");
    if (data.type === "pgac") return fail("pgac_not_restorable");
    if (await isDeleted("projects", data.folder_id)) return fail("parent_deleted");
    ({ error } = await supabase.from("projects").update(restore).eq("id", id));
  } else if (nature === "flow") {
    const { data } = await supabase.from("flows").select("project_id").eq("id", id).single();
    if (!data) return fail("not_found");
    if (await isDeleted("projects", data.project_id)) return fail("parent_deleted");
    ({ error } = await supabase.from("flows").update(restore).eq("id", id));
  } else if (nature === "form") {
    const { data } = await supabase.from("forms").select("project_id").eq("id", id).single();
    if (!data) return fail("not_found");
    if (await isDeleted("projects", data.project_id)) return fail("parent_deleted");
    ({ error } = await supabase.from("forms").update({ deleted_at: null }).eq("id", id));
  } else if (nature === "form_response") {
    const { data } = await supabase.from("form_responses").select("project_id, flow_id, form_id").eq("id", id).single();
    if (!data) return fail("not_found");
    if (await isDeleted("projects", data.project_id)) return fail("parent_deleted");
    if (await isDeleted("flows", data.flow_id) || await isDeleted("forms", data.form_id)) return fail("response_parent_deleted");
    ({ error } = await supabase.from("form_responses").update(restore).eq("id", id));
  } else {
    const { data } = await supabase.from("label_families").select("project_id, parent_id, default_source_id").eq("id", id).single();
    if (!data) return fail("not_found");
    if (data.default_source_id) return fail("category_imported");
    if (await isDeleted("projects", data.project_id) || await isDeleted("label_families", data.parent_id)) return fail("parent_deleted");
    ({ error } = await supabase.from("label_families").update(restore).eq("id", id));
  }
  if (error) return fail(dbError(error));
  revalidatePath("/explore/settings/trash");
  return ok(undefined);
}
