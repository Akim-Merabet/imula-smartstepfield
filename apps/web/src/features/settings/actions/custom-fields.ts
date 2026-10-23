"use server";

import { revalidatePath } from "next/cache";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { fieldRules, fieldTypesFor } from "../meta";
import { customFieldSchema, type CustomFieldInput } from "../schema";

const PATH = "/explore/settings/custom-fields";

export async function saveCustomField(id: string | null, input: CustomFieldInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("SettingsCustomField", id ? "edit" : "add");
  if ("error" in auth) return fail(auth.error);
  const parsed = customFieldSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const v = parsed.data;
  if (!fieldTypesFor(v.nature).includes(v.type)) return fail("invalid");
  const r = fieldRules(v.type, v.nature);
  const supabase = await createClient();
  const accountId = auth.session.account.id;

  // Nom unique par nature dans le compte.
  const { data: same } = await supabase.from("custom_fields").select("id").eq("nature", v.nature).eq("account_id", accountId)
    .is("deleted_at", null).ilike("name", v.name.replace(/[%_]/g, "\\$&"));
  if ((same ?? []).some((s) => s.id !== id)) return fail("duplicate_name");

  const options = {
    name: v.name,
    choices: r.choices ? v.choices : [],
    default_value: r.defaultValue ? v.default_value : null,
    placeholder: r.placeholder ? v.placeholder : null,
    tooltip: v.tooltip,
    description: v.description,
    required: r.required ? v.required : false,
    read_only: r.readOnly ? v.read_only : false,
    pdf_field_name: r.pdfField ? v.pdf_field_name : null,
    variable_name: r.variable ? v.variable_name : null,
    text_display: r.textDisplay ? v.text_display : null,
    display_in_flow_card: r.flowDisplay ? v.display_in_flow_card : false,
    display_in_flow_banner: r.flowDisplay ? v.display_in_flow_banner : false,
    display_on_flow_opening: r.flowDisplay ? v.display_on_flow_opening : false,
  };

  if (id) {
    // Une valeur de liste déjà utilisée ne peut pas être retirée.
    if (r.choices) {
      const { data: before } = await supabase.from("custom_fields").select("choices").eq("id", id).single();
      const removed = (before?.choices ?? []).filter((c) => !v.choices.includes(c));
      if (removed.length) {
        const { data: values } = await supabase.from("custom_field_values").select("value_text, value_json").eq("custom_field_id", id);
        const used = (values ?? []).some((row) => removed.includes(row.value_text ?? "")
          || (Array.isArray(row.value_json) && (row.value_json as string[]).some((x) => removed.includes(x))));
        if (used) return fail("choice_in_use");
      }
    }
    // Nature, type, lien et famille sont figés après création.
    const { error } = await supabase.from("custom_fields").update(options).eq("id", id);
    if (error) return fail(error.code === "23505" ? "duplicate_variable" : dbError(error));
    revalidatePath(PATH);
    return ok({ id });
  }
  const { data: last } = await supabase.from("custom_fields").select("sort_order").eq("nature", v.nature).eq("account_id", accountId)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from("custom_fields").insert({
    ...options, account_id: accountId, nature: v.nature, type: v.type, link_type: v.link_type,
    label_family_id: v.link_type === "default" ? null : v.label_family_id ?? null, sort_order: (last?.sort_order ?? 0) + 1,
  }).select("id").single();
  if (error || !data) return fail(error?.code === "23505" ? "duplicate_variable" : dbError(error));
  revalidatePath(PATH);
  return ok({ id: data.id });
}

export async function setCustomFieldActive(id: string, active: boolean): Promise<ActionResult> {
  const auth = await authorize("SettingsCustomField", "edit");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from("custom_fields").update({ active }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}

/** « Activer tout » : active tous les attributs d'une nature. */
export async function activateAllCustomFields(nature: string): Promise<ActionResult> {
  const auth = await authorize("SettingsCustomField", "edit");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from("custom_fields").update({ active: true })
    .eq("nature", nature as never).eq("account_id", auth.session.account.id).is("deleted_at", null);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}

export async function deleteCustomField(id: string): Promise<ActionResult> {
  const auth = await authorize("SettingsCustomField", "delete");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const [{ count: values }, { count: questions }] = await Promise.all([
    supabase.from("custom_field_values").select("custom_field_id", { count: "exact", head: true }).eq("custom_field_id", id),
    supabase.from("form_questions").select("id", { count: "exact", head: true }).eq("object_attribute_id", id),
  ]);
  if (values || questions) return fail("attribute_in_use");
  const { error } = await supabase.from("custom_fields").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}
