"use server";

import { revalidatePath } from "next/cache";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { clientSchema, companySchema, type ClientInput, type CompanyInput } from "../schema";
import { findUsages } from "./helpers";

export async function saveClient(id: string | null, input: ClientInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("SettingsClientBook", "edit");
  if ("error" in auth) return fail(auth.error);
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const supabase = await createClient();
  const query = id
    ? supabase.from("clients").update(parsed.data).eq("id", id).select("id").single()
    : supabase.from("clients").insert({ ...parsed.data, account_id: auth.session.account.id }).select("id").single();
  const { data, error } = await query;
  if (error || !data) return fail(dbError(error));
  revalidatePath("/explore/settings/clients");
  return ok({ id: data.id });
}

export async function deleteClient(id: string): Promise<ActionResult> {
  const auth = await authorize("SettingsClientBook", "delete");
  if ("error" in auth) return fail(auth.error);
  const usages = await findUsages(id, [{ table: "projects", column: "client_id", label: "projects" }]);
  if (usages.length) return fail("in_use", usages);
  const supabase = await createClient();
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath("/explore/settings/clients");
  return ok(undefined);
}

export async function saveCompany(id: string | null, input: CompanyInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("SettingsCompanies", id ? "edit" : "add");
  if ("error" in auth) return fail(auth.error);
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const supabase = await createClient();
  const query = id
    ? supabase.from("companies").update(parsed.data).eq("id", id).select("id").single()
    : supabase.from("companies").insert({
      ...parsed.data, organization_id: auth.session.organization.id, account_id: auth.session.account.id,
    }).select("id").single();
  const { data, error } = await query;
  if (error || !data) return fail(dbError(error));
  revalidatePath("/explore/settings/companies");
  return ok({ id: data.id });
}

export async function deleteCompany(id: string): Promise<ActionResult> {
  const auth = await authorize("SettingsCompanies", "delete");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("is_parent_company").eq("id", id).maybeSingle();
  if (company?.is_parent_company) return fail("parent_company");
  const usages = await findUsages(id, [
    { table: "collaborators", column: "company_id", label: "collaborators" },
    { table: "tablets", column: "company_id", label: "tablets" },
    { table: "form_companies", column: "company_id", label: "forms" },
  ]);
  if (usages.length) return fail("in_use", usages);
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath("/explore/settings/companies");
  return ok(undefined);
}
