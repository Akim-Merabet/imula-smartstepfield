"use server";

import { revalidatePath } from "next/cache";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { accountSchema, generalAccountSchema, organizationSchema, type AccountInput, type GeneralAccountInput, type OrganizationInput } from "../schema";

export async function updateAccount(input: AccountInput): Promise<ActionResult> {
  const auth = await authorize("SettingsAccount", "edit");
  if ("error" in auth) return fail(auth.error);
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").update(parsed.data).eq("id", auth.session.account.id);
  if (error) return fail(dbError(error));
  revalidatePath("/explore", "layout");
  return ok(undefined);
}

export async function updateGeneralAccount(accountId: string, input: GeneralAccountInput): Promise<ActionResult> {
  const auth = await authorize("SettingsGeneralAccount", "read");
  if ("error" in auth) return fail(auth.error);
  const parsed = generalAccountSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const { pgac_subcontractors, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").update({
    ...rest,
    pgac_subcontractors: pgac_subcontractors.split("__").map((s) => s.trim()).filter(Boolean),
  }).eq("id", accountId);
  if (error) return fail(dbError(error));
  revalidatePath("/explore/settings/general-account");
  return ok(undefined);
}

export async function createAccount(name: string): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("SettingsGeneralAccount", "read");
  if ("error" in auth) return fail(auth.error);
  const value = name.trim();
  if (value.length < 3) return fail("invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.from("accounts")
    .insert({ name: value, organization_id: auth.session.organization.id }).select("id").single();
  if (error || !data) return fail(dbError(error));
  revalidatePath("/explore/settings/general-account");
  return ok({ id: data.id });
}

export async function updateOrganization(input: OrganizationInput): Promise<ActionResult> {
  const auth = await authorize("SettingsGeneralOrganization", "edit");
  if ("error" in auth) return fail(auth.error);
  const parsed = organizationSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  // Les copies locales de formulaires ne peuvent plus être désactivées une fois activées.
  const values = { ...parsed.data, local_form_allowed: parsed.data.local_form_allowed || auth.session.organization.local_form_allowed };
  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update(values).eq("id", auth.session.organization.id);
  if (error) return fail(dbError(error));
  revalidatePath("/explore", "layout");
  return ok(undefined);
}
