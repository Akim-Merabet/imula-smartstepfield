import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Enums, Tables } from "@/lib/supabase/database.types";

export type CustomField = Tables<"custom_fields">;
export type CustomFieldValues = Record<string, string | string[] | null>;

/** Attributs actifs d'une nature, applicables à une famille (lien par défaut ou famille parent/enfant). */
export async function getCustomFields(nature: Enums<"business_class">, familyId?: string | null) {
  const supabase = await createClient();
  const { data } = await supabase.from("custom_fields").select("*")
    .eq("nature", nature).eq("active", true).is("deleted_at", null).order("sort_order").order("name");
  const fields = data ?? [];
  if (!familyId) return fields.filter((f) => f.link_type === "default");
  const { data: family } = await supabase.from("label_families").select("id, parent_id").eq("id", familyId).maybeSingle();
  const allowed = new Set([familyId, family?.parent_id].filter(Boolean) as string[]);
  return fields.filter((f) => f.link_type === "default" || (f.label_family_id && allowed.has(f.label_family_id)));
}

export async function getCustomFieldValues(objectId: string): Promise<CustomFieldValues> {
  const supabase = await createClient();
  const { data } = await supabase.from("custom_field_values").select("custom_field_id, value_text, value_json").eq("object_id", objectId);
  const out: CustomFieldValues = {};
  for (const row of data ?? []) {
    out[row.custom_field_id] = Array.isArray(row.value_json) ? (row.value_json as string[]) : row.value_text;
  }
  return out;
}

export async function saveCustomFieldValues(params: {
  accountId: string; businessClass: Enums<"business_class">; objectId: string; values: CustomFieldValues; updatedBy: string;
}) {
  const supabase = await createClient();
  const rows = Object.entries(params.values).map(([custom_field_id, value]) => ({
    custom_field_id,
    object_id: params.objectId,
    account_id: params.accountId,
    business_class: params.businessClass,
    value_text: Array.isArray(value) ? value.join(";") : value,
    value_json: Array.isArray(value) ? value : null,
    updated_by: params.updatedBy,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return null;
  const { error } = await supabase.from("custom_field_values").upsert(rows, { onConflict: "custom_field_id,object_id" });
  return error;
}
