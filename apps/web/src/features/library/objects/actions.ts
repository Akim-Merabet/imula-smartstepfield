"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { saveCustomFieldValues } from "@/lib/custom-fields/server";
import { clean, libraryAuth, type Supa } from "../shared/server";

const ROUTE = "LibraryObjectManagement";
const PATH = "/explore/library/object-management/list-vue";

const schema = z.object({
  family_id: z.uuid(),
  account_id: z.uuid(),
  parent_id: z.uuid().nullable(),
  name: z.string().trim().min(1).max(255),
  item_code: z.string().max(255).nullable(),
  external_reference: z.string().max(255).nullable(),
  identification_number: z.string().max(255).nullable(),
  object_index: z.string().max(50).nullable(),
  custom_status_id: z.uuid().nullable(),
  certificate_document_id: z.uuid().nullable(),
  description: z.string().max(5000).nullable(),
  values: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.null()])),
});
export type ObjectInput = z.infer<typeof schema>;

/** Statut « par défaut » applicable à la famille (lien défaut, famille parent ou enfant). */
async function defaultStatus(supabase: Supa, familyId: string): Promise<string | null> {
  const [{ data: family }, { data: statuses }] = await Promise.all([
    supabase.from("label_families").select("id, parent_id").eq("id", familyId).maybeSingle(),
    supabase.from("custom_statuses").select("id, link_type, label_family_id").eq("nature", "technical_object").eq("active", true).eq("is_default", true),
  ]);
  const list = statuses ?? [];
  return list.find((s) => s.label_family_id === familyId)?.id
    ?? list.find((s) => !!family?.parent_id && s.label_family_id === family.parent_id)?.id
    ?? list.find((s) => s.link_type === "default")?.id
    ?? null;
}

const dbFail = (error: { code?: string; message?: string } | null) =>
  fail(error?.code === "23505" ? "identification_exists" : dbError(error));

export async function saveObject(id: string | null, input: ObjectInput): Promise<ActionResult<{ id: string }>> {
  const auth = await libraryAuth(ROUTE, id ? "edit" : "add");
  if ("error" in auth) return fail(auth.error);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { values, ...v } = parsed.data;
  const { supabase, session } = auth;
  const row = {
    ...v, item_code: clean(v.item_code), external_reference: clean(v.external_reference), identification_number: clean(v.identification_number),
    object_index: clean(v.object_index, 50), description: clean(v.description, 5000),
  };
  if (!row.custom_status_id) {
    row.custom_status_id = await defaultStatus(supabase, row.family_id);
    if (!row.custom_status_id) return fail("no_default_status");
  }
  if (id && row.parent_id) {
    // Pas de cycle : le parent ne doit pas être un descendant de l'objet.
    const { data: all } = await supabase.from("technical_objects").select("id, parent_id").is("deleted_at", null);
    const parentOf = new Map((all ?? []).map((o) => [o.id, o.parent_id]));
    for (let cur: string | null | undefined = row.parent_id; cur; cur = parentOf.get(cur)) if (cur === id) return fail("cycle");
  }
  let objectId = id;
  if (id) {
    const { error } = await supabase.from("technical_objects").update(row).eq("id", id);
    if (error) return dbFail(error);
  } else {
    const { data, error } = await supabase.from("technical_objects").insert({ ...row, organization_id: session.organization.id }).select("id").single();
    if (error || !data) return dbFail(error);
    objectId = data.id;
  }
  const cfError = await saveCustomFieldValues({
    accountId: row.account_id, businessClass: "technical_object", objectId: objectId!, values, updatedBy: session.collaborator.id,
  });
  if (cfError) return fail(dbError(cfError));
  revalidatePath(PATH);
  return ok({ id: objectId! });
}

/** Suppression bloquée : sous-objets, bloc Objet, flow ou lien formulaire ↔ objet. */
export async function deleteObject(id: string): Promise<ActionResult> {
  const auth = await libraryAuth(ROUTE, "delete");
  if ("error" in auth) return fail(auth.error);
  const { supabase } = auth;
  const { data } = await supabase.rpc("library_item_usage", { p_kind: "object", p_id: id });
  const u = (data ?? {}) as { blocks?: number; flows?: number; forms?: number; children?: number };
  if ((u.children ?? 0) > 0) return fail("has_children", u);
  if ((u.blocks ?? 0) + (u.flows ?? 0) + (u.forms ?? 0) > 0) return fail("in_use", u);
  await supabase.from("custom_field_values").delete().eq("object_id", id);
  const { error } = await supabase.from("technical_objects").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}

const duplicateSchema = z.object({ name: z.string().trim().min(1).max(255), identification_number: z.string().max(255).nullable() });

/** Duplication : propriétés + valeurs d'attributs (les sous-objets ne sont pas recopiés). */
export async function duplicateObject(id: string, input: z.infer<typeof duplicateSchema>): Promise<ActionResult<{ id: string }>> {
  const auth = await libraryAuth(ROUTE, "duplicate");
  if ("error" in auth) return fail(auth.error);
  const parsed = duplicateSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { supabase, session } = auth;
  const { data: src } = await supabase.from("technical_objects").select("*").eq("id", id).maybeSingle();
  if (!src) return fail("not_found");
  const { id: _i, created_at: _c, updated_at: _u, created_by: _cb, updated_by: _ub, deleted_at: _d, ...rest } = src;
  void _i; void _c; void _u; void _cb; void _ub; void _d;
  const { data: copy, error } = await supabase.from("technical_objects")
    .insert({ ...rest, name: parsed.data.name, identification_number: clean(parsed.data.identification_number) }).select("id").single();
  if (error || !copy) return dbFail(error);
  const { data: values } = await supabase.from("custom_field_values").select("custom_field_id, value_text, value_json").eq("object_id", id);
  if (values?.length) {
    await supabase.from("custom_field_values").insert(values.map((v) => ({
      ...v, object_id: copy.id, account_id: src.account_id, business_class: "technical_object" as const, updated_by: session.collaborator.id,
    })));
  }
  revalidatePath(PATH);
  return ok({ id: copy.id });
}
