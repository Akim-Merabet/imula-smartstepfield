"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_AUTHORITIES } from "@/lib/permissions/types";
import type { Enums } from "@/lib/supabase/database.types";

const ROLES = ["readonly", "writer", "expert", "responsible"] as const;
const uuid = z.uuid();
const uuids = z.array(z.uuid()).max(1000);

const membersPath = (projectId: string) => `/explore/projects/${projectId}/dashboard/collaborators`;
const tabletsPath = (projectId: string) => `/explore/projects/${projectId}/dashboard/tablets`;

/** Import depuis la base des collaborateurs (spec 01 §5.11) : admins → Responsable, opérateurs → Opérateur. */
export async function importMembers(projectId: string, collaboratorIds: string[], defaultRole: string):
  Promise<ActionResult<{ added: number; skipped: number }>> {
  const auth = await authorize("DashboardContributors", "add", projectId);
  if ("error" in auth) return fail(auth.error);
  const parsed = z.object({ projectId: uuid, ids: uuids.min(1), role: z.enum(ROLES) })
    .safeParse({ projectId, ids: collaboratorIds, role: defaultRole });
  if (!parsed.success) return fail("invalid");

  const supabase = await createClient();
  const [{ data: project }, { data: existing }, { data: collabs }] = await Promise.all([
    supabase.from("projects").select("type").eq("id", projectId).single(),
    supabase.from("project_members").select("collaborator_id").eq("project_id", projectId),
    supabase.from("collaborators").select("id, kind, authority, status")
      .in("id", parsed.data.ids).is("deleted_at", null),
  ]);
  if (!project) return fail("not_found");
  const already = new Set((existing ?? []).map((m) => m.collaborator_id));
  const operatorsAllowed = ["project", "pgac", "referential"].includes(project.type);
  const max = (existing ?? []).length;

  const rows = (collabs ?? [])
    .filter((c) => !already.has(c.id) && c.status === "active" && (c.kind === "user" || operatorsAllowed))
    .map((c, i) => ({
      project_id: projectId,
      collaborator_id: c.id,
      sort_order: max + i,
      role: (c.kind === "operator" ? "operator"
        : c.authority && ADMIN_AUTHORITIES.includes(c.authority) ? "responsible"
        : parsed.data.role) as Enums<"team_role">,
    }));
  if (rows.length) {
    const { error } = await supabase.from("project_members").insert(rows);
    if (error) return fail(dbError(error));
    // Hiérarchies par défaut du collaborateur recopiées dans l'entité [INF].
    const { data: defaults } = await supabase.from("collaborator_default_hierarchies")
      .select("collaborator_id, hierarchy_id").in("collaborator_id", rows.map((r) => r.collaborator_id));
    if (defaults?.length) {
      await supabase.from("project_member_hierarchies")
        .insert(defaults.map((d) => ({ project_id: projectId, collaborator_id: d.collaborator_id, hierarchy_id: d.hierarchy_id })));
    }
  }
  revalidatePath(membersPath(projectId));
  return ok({ added: rows.length, skipped: parsed.data.ids.length - rows.length });
}

/** Hiérarchies d'un collaborateur utilisées dans des flows de l'entité où il est restreint. */
async function lockedHierarchies(projectId: string, collaboratorId: string) {
  const supabase = await createClient();
  const { data: flows } = await supabase.from("flows").select("id").eq("project_id", projectId).is("deleted_at", null);
  const ids = (flows ?? []).map((f) => f.id);
  if (!ids.length) return new Set<string>();
  const { data } = await supabase.from("flow_collaborator_hierarchies").select("hierarchy_id")
    .eq("collaborator_id", collaboratorId).in("flow_id", ids);
  return new Set((data ?? []).map((r) => r.hierarchy_id));
}

export async function updateMember(projectId: string, collaboratorId: string, input: { role: string; hierarchyIds: string[] }):
  Promise<ActionResult> {
  const auth = await authorize("DashboardContributors", "edit", projectId);
  if ("error" in auth) return fail(auth.error);
  const parsed = z.object({ role: z.enum([...ROLES, "operator"]), hierarchyIds: uuids }).safeParse(input);
  if (!parsed.success) return fail("invalid");

  const supabase = await createClient();
  const { data: member } = await supabase.from("project_members")
    .select("role, collaborator:collaborators(kind)").eq("project_id", projectId).eq("collaborator_id", collaboratorId).single();
  if (!member) return fail("not_found");
  const isOperator = (member.collaborator as { kind: string } | null)?.kind === "operator";
  const role = isOperator ? "operator" : parsed.data.role;
  if (!isOperator && role === "operator") return fail("invalid");

  const locked = await lockedHierarchies(projectId, collaboratorId);
  const { data: current } = await supabase.from("project_member_hierarchies").select("hierarchy_id")
    .eq("project_id", projectId).eq("collaborator_id", collaboratorId);
  const currentIds = new Set((current ?? []).map((h) => h.hierarchy_id));
  const next = new Set(parsed.data.hierarchyIds);
  const removed = [...currentIds].filter((h) => !next.has(h));
  if (removed.some((h) => locked.has(h))) return fail("hierarchy_locked");

  const { error } = await supabase.from("project_members").update({ role: role as Enums<"team_role"> })
    .eq("project_id", projectId).eq("collaborator_id", collaboratorId);
  if (error) return fail(dbError(error));
  if (removed.length) {
    const { error: e } = await supabase.from("project_member_hierarchies").delete()
      .eq("project_id", projectId).eq("collaborator_id", collaboratorId).in("hierarchy_id", removed);
    if (e) return fail(dbError(e));
  }
  const added = [...next].filter((h) => !currentIds.has(h));
  if (added.length) {
    const { error: e } = await supabase.from("project_member_hierarchies")
      .insert(added.map((hierarchy_id) => ({ project_id: projectId, collaborator_id: collaboratorId, hierarchy_id })));
    if (e) return fail(dbError(e));
  }
  revalidatePath(membersPath(projectId));
  return ok(undefined);
}

/** Réorganisation : change le rôle ou les hiérarchies des collaborateurs sélectionnés. */
export async function reorganizeMembers(projectId: string, collaboratorIds: string[], change:
  { kind: "role"; role: string } | { kind: "hierarchy"; hierarchyIds: string[] }): Promise<ActionResult<{ updated: number }>> {
  const auth = await authorize("DashboardContributors", "edit", projectId);
  if ("error" in auth) return fail(auth.error);
  const ids = uuids.min(1).safeParse(collaboratorIds);
  if (!ids.success) return fail("invalid");
  const supabase = await createClient();
  const { data: members } = await supabase.from("project_members")
    .select("collaborator_id, collaborator:collaborators(kind)").eq("project_id", projectId).in("collaborator_id", ids.data);
  const targets = (members ?? []);

  if (change.kind === "role") {
    const role = z.enum(ROLES).safeParse(change.role);
    if (!role.success) return fail("invalid");
    const userIds = targets.filter((m) => (m.collaborator as { kind: string } | null)?.kind !== "operator").map((m) => m.collaborator_id);
    if (!userIds.length) return ok({ updated: 0 });
    const { error } = await supabase.from("project_members").update({ role: role.data })
      .eq("project_id", projectId).in("collaborator_id", userIds);
    if (error) return fail(dbError(error));
    revalidatePath(membersPath(projectId));
    return ok({ updated: userIds.length });
  }

  const hier = uuids.safeParse(change.hierarchyIds);
  if (!hier.success) return fail("invalid");
  for (const m of targets) {
    const locked = await lockedHierarchies(projectId, m.collaborator_id);
    const keep = new Set(hier.data);
    const { data: cur } = await supabase.from("project_member_hierarchies").select("hierarchy_id")
      .eq("project_id", projectId).eq("collaborator_id", m.collaborator_id);
    const curIds = (cur ?? []).map((h) => h.hierarchy_id);
    const removable = curIds.filter((h) => !keep.has(h) && !locked.has(h));
    if (removable.length) {
      await supabase.from("project_member_hierarchies").delete()
        .eq("project_id", projectId).eq("collaborator_id", m.collaborator_id).in("hierarchy_id", removable);
    }
    const add = hier.data.filter((h) => !curIds.includes(h));
    if (add.length) {
      const { error } = await supabase.from("project_member_hierarchies")
        .insert(add.map((hierarchy_id) => ({ project_id: projectId, collaborator_id: m.collaborator_id, hierarchy_id })));
      if (error) return fail(dbError(error));
    }
  }
  revalidatePath(membersPath(projectId));
  return ok({ updated: targets.length });
}

/** Suppression d'un membre : bloquée s'il est affecté à des flows de l'entité. */
export async function removeMember(projectId: string, collaboratorId: string): Promise<ActionResult<{ flows?: string[] }>> {
  const auth = await authorize("DashboardContributors", "delete", projectId);
  if ("error" in auth) return fail(auth.error);
  if (!uuid.safeParse(collaboratorId).success) return fail("invalid");
  const supabase = await createClient();
  const [{ data: reporter }, { data: assignee }, { data: restricted }] = await Promise.all([
    supabase.from("flows").select("name").eq("project_id", projectId).eq("reporter_id", collaboratorId).is("deleted_at", null),
    supabase.from("flow_assignees").select("flow:flows!inner(name, project_id, deleted_at)")
      .eq("collaborator_id", collaboratorId).eq("flow.project_id", projectId).is("flow.deleted_at", null),
    supabase.from("flow_collaborators").select("flow:flows!inner(name, project_id, deleted_at)")
      .eq("collaborator_id", collaboratorId).eq("flow.project_id", projectId).is("flow.deleted_at", null),
  ]);
  const names = new Set<string>([
    ...(reporter ?? []).map((f) => f.name),
    ...[...(assignee ?? []), ...(restricted ?? [])].map((r) => (r.flow as unknown as { name: string }).name),
  ]);
  if (names.size) return fail("in_flows", { flows: [...names] });

  const { error } = await supabase.from("project_members").delete().eq("project_id", projectId).eq("collaborator_id", collaboratorId);
  if (error) return fail(dbError(error));
  revalidatePath(membersPath(projectId));
  return ok({});
}

/** Import de tablettes (uniquement entités Projet / PGAC). */
export async function importTablets(projectId: string, tabletIds: string[]): Promise<ActionResult<{ added: number }>> {
  const auth = await authorize("DashboardTablets", "add", projectId);
  if ("error" in auth) return fail(auth.error);
  const ids = uuids.min(1).safeParse(tabletIds);
  if (!ids.success) return fail("invalid");
  const supabase = await createClient();
  const [{ data: project }, { data: existing }, { data: tablets }] = await Promise.all([
    supabase.from("projects").select("type").eq("id", projectId).single(),
    supabase.from("project_tablets").select("tablet_id").eq("project_id", projectId),
    supabase.from("tablets").select("id, status").in("id", ids.data).is("deleted_at", null),
  ]);
  if (!project || !["project", "pgac"].includes(project.type)) return fail("invalid_type");
  const already = new Set((existing ?? []).map((t) => t.tablet_id));
  const rows = (tablets ?? []).filter((t) => t.status === "active" && !already.has(t.id))
    .map((t) => ({ project_id: projectId, tablet_id: t.id }));
  if (rows.length) {
    const { error } = await supabase.from("project_tablets").insert(rows);
    if (error) return fail(dbError(error));
  }
  revalidatePath(tabletsPath(projectId));
  return ok({ added: rows.length });
}

export async function removeTablet(projectId: string, tabletId: string): Promise<ActionResult<{ flows?: string[] }>> {
  const auth = await authorize("DashboardTablets", "delete", projectId);
  if ("error" in auth) return fail(auth.error);
  if (!uuid.safeParse(tabletId).success) return fail("invalid");
  const supabase = await createClient();
  const { data: flows } = await supabase.from("flows").select("name").eq("project_id", projectId).is("deleted_at", null)
    .or(`tablet_1_id.eq.${tabletId},tablet_2_id.eq.${tabletId},tablet_3_id.eq.${tabletId}`);
  if (flows?.length) return fail("in_flows", { flows: flows.map((f) => f.name) });
  const { error } = await supabase.from("project_tablets").delete().eq("project_id", projectId).eq("tablet_id", tabletId);
  if (error) return fail(dbError(error));
  revalidatePath(tabletsPath(projectId));
  return ok({});
}
