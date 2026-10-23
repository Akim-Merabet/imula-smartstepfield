"use server";

import { revalidatePath } from "next/cache";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { referenceFields, referenceLinkTypes } from "../meta";
import { referenceSchema, type ReferenceInput } from "../schema";

const PATH = "/explore/settings/references";

/** Autre règle active portant les mêmes caractéristiques (nature, champ, lien, famille). */
async function findTwin(v: { nature: string; field: string; link_type: string; label_family_id: string | null }, accountId: string, exceptId?: string) {
  const supabase = await createClient();
  let q = supabase.from("reference_rules").select("id").eq("account_id", accountId).eq("nature", v.nature as never)
    .eq("field", v.field as never).eq("link_type", v.link_type as never).eq("active", true);
  q = v.label_family_id ? q.eq("label_family_id", v.label_family_id) : q.is("label_family_id", null);
  const { data } = await q;
  return (data ?? []).find((r) => r.id !== exceptId) ?? null;
}

export async function saveReference(id: string | null, input: ReferenceInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("SettingsReferences", id ? "edit" : "add");
  if ("error" in auth) return fail(auth.error);
  const parsed = referenceSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    return fail(issues.some((i) => i.path[0] === "nomenclature") ? "nomenclature_invalid" : "invalid", parsed.error.flatten());
  }
  const v = parsed.data;
  const supabase = await createClient();
  if (id) {
    // Seule la nomenclature (et le format du compteur) est modifiable.
    const { error } = await supabase.from("reference_rules").update({
      nomenclature: v.nomenclature, counter_format: v.counter_format, start_value: v.start_value,
    }).eq("id", id);
    if (error) return fail(dbError(error));
    revalidatePath(PATH);
    return ok({ id });
  }
  if (!referenceFields(v.nature).includes(v.field) || !referenceLinkTypes(v.nature).includes(v.link_type)) return fail("invalid");
  const familyId = v.link_type === "default" ? null : v.label_family_id ?? null;
  if (await findTwin({ ...v, label_family_id: familyId }, auth.session.account.id)) {
    return fail(v.link_type === "default" ? "default_reference_exists" : "reference_exists");
  }
  const { data, error } = await supabase.from("reference_rules").insert({
    account_id: auth.session.account.id, nature: v.nature, field: v.field, link_type: v.link_type, label_family_id: familyId,
    nomenclature: v.nomenclature, counter_type: v.counter_type, counter_format: v.counter_format, start_value: v.start_value,
  }).select("id").single();
  if (error || !data) return fail(dbError(error));
  revalidatePath(PATH);
  return ok({ id: data.id });
}

export async function setReferenceActive(id: string, active: boolean): Promise<ActionResult> {
  const auth = await authorize("SettingsReferences", "edit");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  if (active) {
    const { data: rule } = await supabase.from("reference_rules").select("nature, field, link_type, label_family_id").eq("id", id).single();
    if (rule && await findTwin(rule, auth.session.account.id, id)) return fail("reference_twin_active");
  }
  const { error } = await supabase.from("reference_rules").update({ active }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}

export async function deleteReference(id: string): Promise<ActionResult> {
  const auth = await authorize("SettingsReferences", "delete");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from("reference_rules").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}
