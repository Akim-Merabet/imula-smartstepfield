"use server";

import { revalidatePath } from "next/cache";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import type { Action } from "@/lib/permissions/types";
import { createClient } from "@/lib/supabase/server";
import { familySchema, type FamilyInput } from "../schema";
import { findUsages } from "./helpers";

type Scope = { kind: "family" | "category"; projectId: string | null };

function routeFor(scope: Scope) {
  if (scope.kind === "family") return "SettingsFamilies";
  return scope.projectId ? "DashboardCategories" : "DefaultCategories";
}

function revalidate(scope: Scope) {
  if (scope.projectId) revalidatePath(`/explore/projects/${scope.projectId}/dashboard/categories`);
  else revalidatePath(scope.kind === "family" ? "/explore/settings/families" : "/explore/settings/categories");
}

async function auth(scope: Scope, action: Action) {
  return authorize(routeFor(scope), action, scope.projectId);
}

const FAMILY_USAGES = [
  { table: "projects", column: "family_id", label: "projects" },
  { table: "flows", column: "family_id", label: "flows" },
  { table: "flows", column: "category_id", label: "flows" },
  { table: "flow_secondary_categories", column: "category_id", label: "flows" },
  { table: "forms", column: "family_id", label: "forms" },
  { table: "forms", column: "object_family_id", label: "forms" },
  { table: "custom_statuses", column: "label_family_id", label: "statuses" },
  { table: "custom_fields", column: "label_family_id", label: "attributes" },
  { table: "reference_rules", column: "label_family_id", label: "references" },
  { table: "tablets", column: "family_id", label: "tablets" },
  { table: "collaborators", column: "function_id", label: "collaborators" },
  { table: "collaborators", column: "group_id", label: "collaborators" },
  { table: "collaborators", column: "legal_id", label: "collaborators" },
  { table: "collaborators", column: "contract_type_id", label: "collaborators" },
  { table: "collaborator_skills", column: "skill_id", label: "skills" },
  { table: "collaborator_skills", column: "activity_domain_id", label: "skills" },
  { table: "collaborator_default_hierarchies", column: "hierarchy_id", label: "hierarchies" },
  { table: "project_member_hierarchies", column: "hierarchy_id", label: "hierarchies" },
  { table: "flow_collaborator_hierarchies", column: "hierarchy_id", label: "hierarchies" },
  { table: "library_equipments", column: "family_id", label: "equipments" },
  { table: "library_risks", column: "family_id", label: "risks" },
  { table: "technical_objects", column: "family_id", label: "objects" },
  { table: "block_emm_items", column: "family_id", label: "blocks" },
  { table: "block_rhp_items", column: "function_family_id", label: "blocks" },
  { table: "block_rhp_item_skills", column: "skill_family_id", label: "blocks" },
];

function mergeUsages(list: { label: string; count: number }[]) {
  const map = new Map<string, number>();
  for (const u of list) map.set(u.label, (map.get(u.label) ?? 0) + u.count);
  return [...map].map(([label, count]) => ({ label, count }));
}

export async function saveFamily(id: string | null, input: FamilyInput): Promise<ActionResult<{ id: string }>> {
  const parsed = familySchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const v = parsed.data;
  const scope: Scope = { kind: v.kind, projectId: v.project_id ?? null };
  const a = await auth(scope, id ? "edit" : "add");
  if ("error" in a) return fail(a.error);
  const supabase = await createClient();

  const common = {
    short_name: v.short_name, long_name: v.long_name, code: v.code, color: v.color, priority: v.priority,
    quality_reference: v.nature === "document" ? v.quality_reference : null,
    client_supervision: v.nature === "document" && v.kind === "family" ? v.client_supervision : false,
    client_supervision_sub_index: v.nature === "document" && v.kind === "family" ? v.client_supervision_sub_index : false,
    wording_configuration_id: v.nature === "document" && v.kind === "family" ? v.wording_configuration_id ?? null : null,
  };
  if (v.nature === "document" && v.kind === "family" && !common.wording_configuration_id) {
    const { count } = await supabase.from("wording_configurations").select("id", { count: "exact", head: true });
    if (count) return fail("wording_required");
  }

  if (id) {
    // Nature, type et parent sont figés après création.
    const { data, error } = await supabase.from("label_families").update(common).eq("id", id).select("id").single();
    if (error || !data) return fail(error?.message?.includes("unique_code") ? "duplicate_code" : dbError(error));
    revalidate(scope);
    return ok({ id: data.id });
  }

  let accountId: string | null = null;
  if (v.kind === "category") {
    if (scope.projectId) {
      const { data: project } = await supabase.from("projects").select("account_id").eq("id", scope.projectId).single();
      accountId = project?.account_id ?? a.session.account.id;
    } else accountId = a.session.account.id;
  }
  if (v.relative_nature === "child") {
    const { data: parent } = await supabase.from("label_families").select("id, kind, nature, relative_nature, project_id, active")
      .eq("id", v.parent_id!).maybeSingle();
    if (!parent || parent.kind !== v.kind || parent.nature !== v.nature || parent.relative_nature !== "parent"
      || (parent.project_id ?? null) !== scope.projectId) return fail("invalid_parent");
  }
  const { data, error } = await supabase.from("label_families").insert({
    ...common,
    organization_id: a.session.organization.id,
    account_id: accountId,
    project_id: scope.projectId,
    kind: v.kind,
    nature: v.nature,
    relative_nature: v.relative_nature,
    parent_id: v.relative_nature === "child" ? v.parent_id! : null,
    provenance: v.kind === "category" ? (scope.projectId ? "entity" : "default") : null,
  }).select("id").single();
  if (error || !data) return fail(error?.message?.includes("unique_code") ? "duplicate_code" : dbError(error));
  revalidate(scope);
  return ok({ id: data.id });
}

async function loadScope(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("label_families")
    .select("id, kind, project_id, parent_id, relative_nature, active, default_source_id").eq("id", id).maybeSingle();
  return data;
}

export async function setFamilyActive(id: string, active: boolean): Promise<ActionResult> {
  const row = await loadScope(id);
  if (!row) return fail("not_found");
  const scope: Scope = { kind: row.kind, projectId: row.project_id };
  const a = await auth(scope, row.kind === "family" ? "archive" : "edit");
  if ("error" in a) return fail(a.error);
  const supabase = await createClient();
  if (active && row.parent_id) {
    const { data: parent } = await supabase.from("label_families").select("active").eq("id", row.parent_id).single();
    if (parent && !parent.active) return fail("parent_inactive");
  }
  const { error } = await supabase.from("label_families").update({ active }).eq("id", id);
  if (error) return fail(dbError(error));
  // Désactiver un parent désactive ses enfants.
  if (!active && row.relative_nature === "parent") {
    await supabase.from("label_families").update({ active: false }).eq("parent_id", id);
  }
  revalidate(scope);
  return ok(undefined);
}

export async function deleteFamily(id: string): Promise<ActionResult> {
  const row = await loadScope(id);
  if (!row) return fail("not_found");
  const scope: Scope = { kind: row.kind, projectId: row.project_id };
  const a = await auth(scope, "delete");
  if ("error" in a) return fail(a.error);
  const supabase = await createClient();
  const { count: children } = await supabase.from("label_families").select("id", { count: "exact", head: true })
    .eq("parent_id", id).is("deleted_at", null);
  if (children) return fail("has_children");
  if (row.kind === "category" && !row.project_id) {
    const { count: imported } = await supabase.from("label_families").select("id", { count: "exact", head: true })
      .eq("default_source_id", id).is("deleted_at", null);
    if (imported) return fail("imported");
  }
  const usages = mergeUsages(await findUsages(id, FAMILY_USAGES));
  if (usages.length) return fail("in_use", usages);

  // Catégories → corbeille (30 jours) ; familles → suppression définitive.
  const { error } = row.kind === "category"
    ? await supabase.from("label_families").update({ deleted_at: new Date().toISOString(), deleted_by: a.session.collaborator.id }).eq("id", id)
    : await supabase.from("label_families").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidate(scope);
  return ok(undefined);
}

/** Recopie / met à jour les catégories par défaut du compte dans une entité. */
async function syncDefaults(projectId: string, accountId: string, organizationId: string) {
  const supabase = await createClient();
  const [{ data: defaults }, { data: existing }] = await Promise.all([
    supabase.from("label_families").select("*").eq("kind", "category").is("project_id", null).eq("account_id", accountId)
      .is("deleted_at", null).eq("active", true),
    supabase.from("label_families").select("id, default_source_id").eq("project_id", projectId).is("deleted_at", null)
      .not("default_source_id", "is", null),
  ]);
  const copies = new Map((existing ?? []).map((e) => [e.default_source_id!, e.id]));
  let created = 0;
  let updated = 0;
  const ordered = [...(defaults ?? [])].sort((x, y) => (x.relative_nature === "parent" ? -1 : 1) - (y.relative_nature === "parent" ? -1 : 1));
  for (const d of ordered) {
    const values = { short_name: d.short_name, long_name: d.long_name, color: d.color, priority: d.priority, quality_reference: d.quality_reference };
    const copyId = copies.get(d.id);
    if (copyId) {
      const { error } = await supabase.from("label_families").update(values).eq("id", copyId);
      if (!error) updated++;
      continue;
    }
    const parentCopy = d.parent_id ? copies.get(d.parent_id) : null;
    if (d.parent_id && !parentCopy) continue;
    const { data, error } = await supabase.from("label_families").insert({
      ...values, organization_id: organizationId, account_id: accountId, project_id: projectId, kind: "category",
      nature: d.nature, relative_nature: d.relative_nature, parent_id: parentCopy ?? null, provenance: "default",
      default_source_id: d.id,
    }).select("id").single();
    if (data && !error) { copies.set(d.id, data.id); created++; }
  }
  return { created, updated };
}

export async function updateProjectDefaultCategories(projectId: string): Promise<ActionResult<{ created: number; updated: number }>> {
  const a = await authorize("DashboardCategories", "edit", projectId);
  if ("error" in a) return fail(a.error);
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("account_id, organization_id").eq("id", projectId).single();
  if (!project) return fail("not_found");
  const result = await syncDefaults(projectId, project.account_id, project.organization_id);
  revalidatePath(`/explore/projects/${projectId}/dashboard/categories`);
  return ok(result);
}

export async function assignDefaultCategoriesToAllProjects(): Promise<ActionResult<{ projects: number }>> {
  const a = await authorize("DefaultCategories", "edit");
  if ("error" in a) return fail(a.error);
  const supabase = await createClient();
  const { data: projects } = await supabase.from("projects").select("id").eq("account_id", a.session.account.id).is("deleted_at", null);
  for (const p of projects ?? []) await syncDefaults(p.id, a.session.account.id, a.session.organization.id);
  revalidatePath("/explore/settings/categories");
  return ok({ projects: projects?.length ?? 0 });
}
