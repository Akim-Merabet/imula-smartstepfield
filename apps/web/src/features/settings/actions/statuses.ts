"use server";

import { revalidatePath } from "next/cache";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { SHARED_STATUS_NATURES, statusLinkTypes, statusRules } from "../meta";
import { statusSchema, type StatusInput } from "../schema";
import { findUsages } from "./helpers";

const PATH = "/explore/settings/statuses";

export async function saveStatus(id: string | null, input: StatusInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("CustomStatus", id ? "edit" : "add");
  if ("error" in auth) return fail(auth.error);
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const v = parsed.data;
  const rules = statusRules(v.nature);
  if (!statusLinkTypes(v.nature).includes(v.link_type)) return fail("invalid");
  const supabase = await createClient();
  const accountId = SHARED_STATUS_NATURES.includes(v.nature) ? null : auth.session.account.id;

  // Nom unique par nature (et par compte pour les statuts non partagés).
  let dup = supabase.from("custom_statuses").select("id").eq("nature", v.nature).ilike("name", v.name.replace(/[%_]/g, "\\$&"));
  dup = accountId ? dup.eq("account_id", accountId) : dup.is("account_id", null);
  const { data: same } = await dup;
  if ((same ?? []).some((s) => s.id !== id)) return fail("duplicate_name");

  const options = {
    name: v.name, description: v.description, color: v.color,
    category: rules.category ? v.category : "todo",
    is_default: rules.isDefault ? v.is_default : false,
    downloadable: rules.downloadable ? v.downloadable : false,
    importable: rules.importable ? v.importable : false,
    exportable: rules.exportable ? v.exportable : false,
    hide_entity: rules.hideEntity && v.category === "done" ? v.hide_entity : false,
  };

  let savedId = id;
  if (id) {
    const { data: before } = await supabase.from("custom_statuses").select("is_default").eq("id", id).single();
    // Un statut par défaut le reste tant qu'un autre ne le remplace pas.
    if (before?.is_default) options.is_default = true;
    const { error } = await supabase.from("custom_statuses").update(options).eq("id", id);
    if (error) return fail(dbError(error));
  } else {
    const { data: last } = await supabase.from("custom_statuses").select("sort_order").eq("nature", v.nature)
      .order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase.from("custom_statuses").insert({
      ...options, nature: v.nature, link_type: rules.family ? v.link_type : "default",
      label_family_id: rules.family && v.link_type !== "default" ? v.label_family_id ?? null : null,
      organization_id: auth.session.organization.id, account_id: accountId, sort_order: (last?.sort_order ?? 0) + 1,
    }).select("id").single();
    if (error || !data) return fail(dbError(error));
    savedId = data.id;
  }
  if (options.is_default && savedId) {
    let others = supabase.from("custom_statuses").update({ is_default: false }).eq("nature", v.nature).neq("id", savedId);
    others = accountId ? others.eq("account_id", accountId) : others.is("account_id", null);
    await others;
  }
  revalidatePath(PATH);
  return ok({ id: savedId! });
}

export async function setStatusActive(id: string, active: boolean): Promise<ActionResult> {
  const auth = await authorize("CustomStatus", "edit");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data } = await supabase.from("custom_statuses").select("is_default").eq("id", id).single();
  if (!active && data?.is_default) return fail("default_status");
  const { error } = await supabase.from("custom_statuses").update({ active }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}

export async function deleteStatus(id: string): Promise<ActionResult> {
  const auth = await authorize("CustomStatus", "delete");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data } = await supabase.from("custom_statuses").select("is_default").eq("id", id).single();
  if (data?.is_default) return fail("default_status");
  const usages = await findUsages(id, [
    { table: "projects", column: "custom_status_id", label: "projects" },
    { table: "flows", column: "custom_status_id", label: "flows" },
    { table: "forms", column: "custom_status_id", label: "forms" },
    { table: "form_responses", column: "custom_status_id", label: "responses" },
    { table: "technical_objects", column: "custom_status_id", label: "objects" },
    { table: "block_multi_pr_items", column: "custom_status_id", label: "blocks" },
  ]);
  if (usages.length) return fail("in_use", usages);
  const { error } = await supabase.from("custom_statuses").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}
