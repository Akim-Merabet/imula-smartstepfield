"use server";

import { revalidatePath } from "next/cache";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { wordingLanguageSchema, wordingSchema, type WordingInput, type WordingLanguageInput } from "../schema";
import { findUsages } from "./helpers";

const PATH = "/explore/settings/wording-configuration";

export async function saveWording(id: string | null, input: WordingInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("SettingsWordingConfiguration", "edit");
  if ("error" in auth) return fail(auth.error);
  const parsed = wordingSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const supabase = await createClient();
  if (id) {
    const { data: before } = await supabase.from("wording_configurations").select("read_only").eq("id", id).single();
    if (before?.read_only) return fail("read_only");
  }
  const query = id
    ? supabase.from("wording_configurations").update(parsed.data).eq("id", id).select("id").single()
    : supabase.from("wording_configurations").insert({ ...parsed.data, organization_id: auth.session.organization.id }).select("id").single();
  const { data, error } = await query;
  if (error || !data) return fail(error?.code === "23505" ? "duplicate_wording" : dbError(error));
  if (parsed.data.is_default) {
    await supabase.from("wording_configurations").update({ is_default: false }).neq("id", data.id);
  }
  revalidatePath(PATH);
  return ok({ id: data.id });
}

export async function deleteWording(id: string): Promise<ActionResult> {
  const auth = await authorize("SettingsWordingConfiguration", "delete");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data } = await supabase.from("wording_configurations").select("read_only").eq("id", id).single();
  if (data?.read_only) return fail("read_only");
  const usages = await findUsages(id, [{ table: "label_families", column: "wording_configuration_id", label: "families" }]);
  if (usages.length) return fail("in_use", usages);
  const { error } = await supabase.from("wording_configurations").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}

export async function saveWordingLanguage(configId: string, input: WordingLanguageInput): Promise<ActionResult> {
  const auth = await authorize("SettingsWordingConfiguration", "edit");
  if ("error" in auth) return fail(auth.error);
  const parsed = wordingLanguageSchema.safeParse(input);
  if (!parsed.success) return fail("wording_entry_required", parsed.error.flatten());
  const supabase = await createClient();
  const { data: config } = await supabase.from("wording_configurations").select("read_only").eq("id", configId).single();
  if (config?.read_only) return fail("read_only");
  const { error } = await supabase.from("wording_configuration_languages").upsert({
    wording_configuration_id: configId, language: parsed.data.language, fields: parsed.data.fields as unknown as Json,
  }, { onConflict: "wording_configuration_id,language" });
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}

export async function deleteWordingLanguage(configId: string, language: string): Promise<ActionResult> {
  const auth = await authorize("SettingsWordingConfiguration", "delete");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const [{ data: config }, { count }] = await Promise.all([
    supabase.from("wording_configurations").select("is_default, read_only").eq("id", configId).single(),
    supabase.from("wording_configuration_languages").select("id", { count: "exact", head: true }).eq("wording_configuration_id", configId),
  ]);
  if (config?.read_only) return fail("read_only");
  if (config?.is_default && (count ?? 0) <= 1) return fail("last_default_translation");
  const { error } = await supabase.from("wording_configuration_languages").delete()
    .eq("wording_configuration_id", configId).eq("language", language as never);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}
