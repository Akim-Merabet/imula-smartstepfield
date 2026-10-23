"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import {
  ADDITIONAL_RIGHT_ELIGIBLE, assignableAuthorities, isReorganizable,
  type Authority, type CollaboratorKind, type ReorganizeCategory,
} from "./meta";
import {
  authorizedDeviceSchema, collaboratorSchema, externalUserSchema, skillSchema, tabletSchema,
  type AuthorizedDeviceInput, type CollaboratorInput, type ExternalUserInput, type SkillInput, type TabletInput,
} from "./schema";

const BASE = "/explore/collaborators";
const routeOf = (kind: CollaboratorKind) => (kind === "user" ? "ContributorUsers" : "ContributorOperators");
const pathOf = (kind: CollaboratorKind) => `${BASE}/${kind === "user" ? "users" : "operators"}`;

/** Traduit une violation d'unicité sur collaborators en code d'erreur métier (spec 01 §4.1). */
function collaboratorConflict(error: { code?: string; message?: string } | null) {
  if (error?.code !== "23505") return dbError(error);
  const msg = error.message ?? "";
  if (msg.includes("sso")) return "sso_conflict";
  if (msg.includes("register")) return "register_conflict";
  return "email_conflict";
}

async function origin() {
  const h = await headers();
  return h.get("origin") ?? `http://${h.get("host") ?? "localhost:3030"}`;
}

type Prepared = {
  values: Omit<ReturnType<typeof collaboratorSchema.parse>, "hierarchy_ids" | "kind">;
  hierarchyIds: string[];
};

/** Règles communes : société co-traitante ⇒ droit Co-traitant ; droits complémentaires selon le droit. */
async function prepare(input: CollaboratorInput, current: Authority | null, previous?: Authority | null):
  Promise<{ ok: true; data: Prepared } | { ok: false; error: string; details?: unknown }> {
  const parsed = collaboratorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", details: parsed.error.flatten() };
  const { hierarchy_ids, kind, ...values } = parsed.data;
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("is_parent_company").eq("id", values.company_id).maybeSingle();
  if (!company) return { ok: false, error: "invalid" };

  if (kind === "operator") {
    return { ok: true, data: { values: { ...values, email: null, sso_identifier: null, authority: null, additional_rights: [] }, hierarchyIds: hierarchy_ids } };
  }
  let authority = values.authority ?? null;
  if (!company.is_parent_company) authority = "co_contractor_user";
  else if (authority === "co_contractor_user") authority = "normal";
  if (authority && authority !== "co_contractor_user" && authority !== previous && !assignableAuthorities(current).includes(authority)) {
    return { ok: false, error: "forbidden" };
  }
  const additional_rights = authority && ADDITIONAL_RIGHT_ELIGIBLE.includes(authority) ? values.additional_rights : [];
  return { ok: true, data: { values: { ...values, authority, additional_rights }, hierarchyIds: hierarchy_ids } };
}

async function saveHierarchies(collaboratorId: string, ids: string[]) {
  const supabase = await createClient();
  const { error } = await supabase.from("collaborator_default_hierarchies").delete().eq("collaborator_id", collaboratorId);
  if (error) return error;
  if (!ids.length) return null;
  const { error: insErr } = await supabase.from("collaborator_default_hierarchies")
    .insert(ids.map((hierarchy_id) => ({ collaborator_id: collaboratorId, hierarchy_id })));
  return insErr;
}

/** Envoie l'invitation (ou crée le compte avec un mot de passe temporaire si l'invitation échoue en local). */
async function inviteAuthUser(email: string, meta: Record<string, string>) {
  const admin = createAdminClient();
  const redirectTo = `${await origin()}/callback?next=/reset/finish`;
  const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: meta });
  if (invited.data.user) return { id: invited.data.user.id, error: null };
  const created = await admin.auth.admin.createUser({
    email, password: `${randomBytes(18).toString("base64url")}!9a`, email_confirm: true, user_metadata: meta,
  });
  if (created.data.user) return { id: created.data.user.id, error: null };
  return { id: null, error: created.error ?? invited.error };
}

export async function createCollaborator(input: CollaboratorInput, options?: { externalUserId?: string }):
  Promise<ActionResult<{ id: string }>> {
  const kind: CollaboratorKind = input.kind === "operator" ? "operator" : "user";
  const auth = await authorize(routeOf(kind), "add");
  if ("error" in auth) return fail(auth.error);
  const { collaborator: me } = auth.session;
  const prepared = await prepare(input, me.authority);
  if (!prepared.ok) return fail(prepared.error, prepared.details);
  const { values, hierarchyIds } = prepared.data;
  const supabase = await createClient();

  let authUserId: string | null = null;
  if (kind === "user") {
    // Conflit d'email vérifié avant de créer le compte d'authentification.
    const { count } = await supabase.from("collaborators").select("id", { count: "exact", head: true })
      .eq("kind", "user").eq("email", values.email!);
    if (count) return fail("email_conflict");
    const invited = await inviteAuthUser(values.email!, { first_name: values.first_name, last_name: values.last_name });
    if (!invited.id) return fail(invited.error?.message?.toLowerCase().includes("already") ? "email_conflict" : "invite_failed");
    authUserId = invited.id;
  }

  const { data, error } = await supabase.from("collaborators").insert({
    ...values,
    kind,
    organization_id: me.organization_id,
    account_id: me.account_id,
    auth_user_id: authUserId,
    status: kind === "user" ? "onboarding" : "active",
  }).select("id").single();
  if (error || !data) {
    if (authUserId) await createAdminClient().auth.admin.deleteUser(authUserId);
    return fail(collaboratorConflict(error));
  }
  await saveHierarchies(data.id, hierarchyIds);
  if (options?.externalUserId) {
    await supabase.from("external_users").update({ converted_to: data.id }).eq("id", options.externalUserId);
    revalidatePath(`${BASE}/external-users`);
  }
  revalidatePath(pathOf(kind));
  return ok({ id: data.id });
}

export async function updateCollaborator(id: string, input: CollaboratorInput): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: before } = await supabase.from("collaborators").select("kind, authority, email, auth_user_id").eq("id", id).maybeSingle();
  if (!before) return fail("not_found");
  const auth = await authorize(routeOf(before.kind), "edit");
  if ("error" in auth) return fail(auth.error);
  const prepared = await prepare({ ...input, kind: before.kind }, auth.session.collaborator.authority, before.authority);
  if (!prepared.ok) return fail(prepared.error, prepared.details);
  const { values, hierarchyIds } = prepared.data;
  // L'email est le login : non modifiable ici (changement via le compte d'authentification).
  const { email, ...rest } = values;
  void email;
  const { error } = await supabase.from("collaborators").update(rest).eq("id", id);
  if (error) return fail(collaboratorConflict(error));
  const hErr = await saveHierarchies(id, hierarchyIds);
  if (hErr) return fail(dbError(hErr));
  revalidatePath(pathOf(before.kind));
  return ok(undefined);
}

export type Dependency = { type: "flowAssignee" | "flowCollaborator" | "flowReporter" | "project"; name: string };

/** Dépendances bloquant la suppression d'un collaborateur (spec 01 §4.3). */
async function collaboratorDependencies(id: string): Promise<Dependency[]> {
  const admin = createAdminClient();
  const [assignees, restricted, reporter, projects] = await Promise.all([
    admin.from("flow_assignees").select("flow:flows!inner(name, deleted_at)").eq("collaborator_id", id).is("flow.deleted_at", null),
    admin.from("flow_collaborators").select("flow:flows!inner(name, deleted_at)").eq("collaborator_id", id).is("flow.deleted_at", null),
    admin.from("flows").select("name").eq("reporter_id", id).is("deleted_at", null),
    admin.from("project_members").select("project:projects!inner(designation, deleted_at)").eq("collaborator_id", id).is("project.deleted_at", null),
  ]);
  return [
    ...(assignees.data ?? []).map((r) => ({ type: "flowAssignee" as const, name: r.flow.name })),
    ...(restricted.data ?? []).map((r) => ({ type: "flowCollaborator" as const, name: r.flow.name })),
    ...(reporter.data ?? []).map((r) => ({ type: "flowReporter" as const, name: r.name })),
    ...(projects.data ?? []).map((r) => ({ type: "project" as const, name: r.project.designation })),
  ];
}

export async function deleteCollaborator(id: string): Promise<ActionResult<undefined>> {
  const supabase = await createClient();
  const { data: c } = await supabase.from("collaborators").select("kind, status").eq("id", id).maybeSingle();
  if (!c) return fail("not_found");
  const auth = await authorize(routeOf(c.kind), "delete");
  if ("error" in auth) return fail(auth.error);
  if (id === auth.session.collaborator.id) return fail("self");
  const deps = await collaboratorDependencies(id);
  if (deps.length) return fail("in_use", deps);
  const { error } = await supabase.from("collaborators").update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(pathOf(c.kind));
  return ok(undefined);
}

/** Désactiver / réactiver (opérateur) / débloquer / restaurer (spec 01 §4.3). */
export async function setCollaboratorStatus(id: string, action: "deactivate" | "activate" | "unlock" | "restore"): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: c } = await supabase.from("collaborators").select("kind, status").eq("id", id).maybeSingle();
  if (!c) return fail("not_found");
  const permission = action === "unlock" ? "unlock" : action === "restore" ? "restore" : "edit";
  const auth = await authorize(routeOf(c.kind), permission);
  if ("error" in auth) return fail(auth.error);
  if (id === auth.session.collaborator.id && action === "deactivate") return fail("self");
  const expected = { deactivate: ["active"], activate: ["inactive"], unlock: ["blocked"], restore: ["deleted"] }[action];
  if (!expected.includes(c.status)) return fail("invalid");
  const patch: TablesUpdate<"collaborators"> =
    action === "deactivate" ? { status: "inactive" }
    : action === "restore" ? { status: "active", deleted_at: null }
    : { status: "active" };
  const { error } = await supabase.from("collaborators").update(patch).eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(pathOf(c.kind));
  return ok(undefined);
}

/** « Activer » un utilisateur désactivé ou en attente : renvoie l'email d'activation. */
export async function resendActivation(id: string): Promise<ActionResult> {
  const auth = await authorize("ContributorUsers", "edit");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: c } = await supabase.from("collaborators").select("kind, status, email, auth_user_id, first_name, last_name").eq("id", id).maybeSingle();
  if (!c || c.kind !== "user" || !c.email || !["inactive", "onboarding"].includes(c.status)) return fail("invalid");
  const admin = createAdminClient();
  const redirectTo = `${await origin()}/callback?next=/reset/finish`;
  let authUserId = c.auth_user_id;
  if (!authUserId) {
    const invited = await inviteAuthUser(c.email, { first_name: c.first_name, last_name: c.last_name });
    if (!invited.id) return fail("invite_failed");
    authUserId = invited.id;
  } else {
    const invited = await admin.auth.admin.inviteUserByEmail(c.email, { redirectTo });
    if (invited.error) {
      // Compte déjà confirmé : lien de définition du mot de passe.
      const { error } = await supabase.auth.resetPasswordForEmail(c.email, { redirectTo });
      if (error) return fail("invite_failed");
    }
  }
  const { error } = await supabase.from("collaborators").update({ status: "onboarding", auth_user_id: authUserId }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(pathOf("user"));
  return ok(undefined);
}

/** Réorganisation en masse (spec 01 §4.4) ; admins et co-traitants exclus. */
export async function reorganizeCollaborators(kind: CollaboratorKind, ids: string[], category: ReorganizeCategory, value: string):
  Promise<ActionResult<{ updated: number; skipped: number }>> {
  const auth = await authorize(routeOf(kind), "edit");
  if ("error" in auth) return fail(auth.error);
  if (!ids.length || !value) return fail("invalid");
  if (category === "authority" && (kind !== "user" || !(["simple", "normal", "advanced"] as string[]).includes(value))) return fail("invalid");
  const supabase = await createClient();
  const { data } = await supabase.from("collaborators").select("id, authority").in("id", ids).eq("kind", kind);
  const targets = (data ?? []).filter((c) => isReorganizable(c.authority)).map((c) => c.id);
  if (!targets.length) return ok({ updated: 0, skipped: ids.length });

  if (category === "hierarchy") {
    for (const id of targets) {
      const err = await saveHierarchies(id, [value]);
      if (err) return fail(dbError(err));
    }
  } else {
    const column = { function: "function_id", group: "group_id", legal: "legal_id", contract: "contract_type_id", authority: "authority" }[category];
    const { error } = await supabase.from("collaborators").update({ [column]: value } as TablesUpdate<"collaborators">).in("id", targets);
    if (error) return fail(dbError(error));
  }
  revalidatePath(pathOf(kind));
  return ok({ updated: targets.length, skipped: ids.length - targets.length });
}

/** Déplacer un collaborateur vers une autre applicabilité (SFA, GA). */
export async function moveCollaborator(id: string, accountId: string): Promise<ActionResult> {
  const auth = await authorize("MoveApplicability", "read");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: c } = await supabase.from("collaborators").select("kind").eq("id", id).maybeSingle();
  if (!c) return fail("not_found");
  const { error } = await supabase.from("collaborators").update({ account_id: accountId }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(pathOf(c.kind));
  return ok(undefined);
}

// ===== Compétences =====================================================================
function skillError(error: { code?: string; message?: string } | null) {
  if (error?.code === "23505") return "skill_duplicate";
  if (error?.code === "23514") return "skill_dates";
  return dbError(error);
}

export async function createSkill(collaboratorId: string, input: SkillInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("ContributorSkills", "add");
  if ("error" in auth) return fail(auth.error);
  const parsed = skillSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const supabase = await createClient();
  const { data, error } = await supabase.from("collaborator_skills")
    .insert({ ...parsed.data, expertise: parsed.data.expertise ?? null, collaborator_id: collaboratorId }).select("id").single();
  if (error || !data) return fail(skillError(error));
  revalidatePath(BASE, "layout");
  return ok({ id: data.id });
}

export async function updateSkill(skillId: string, input: SkillInput): Promise<ActionResult> {
  const auth = await authorize("ContributorSkills", "edit");
  if ("error" in auth) return fail(auth.error);
  const parsed = skillSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const supabase = await createClient();
  const { error } = await supabase.from("collaborator_skills").update({ ...parsed.data, expertise: parsed.data.expertise ?? null }).eq("id", skillId);
  if (error) return fail(skillError(error));
  revalidatePath(BASE, "layout");
  return ok(undefined);
}

export async function deleteSkill(skillId: string): Promise<ActionResult> {
  const auth = await authorize("ContributorSkills", "delete");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from("collaborator_skills").delete().eq("id", skillId);
  if (error) return fail(dbError(error));
  revalidatePath(BASE, "layout");
  return ok(undefined);
}

// ===== Utilisateurs externes ============================================================
export async function updateExternalUser(id: string, input: ExternalUserInput): Promise<ActionResult> {
  const auth = await authorize("ContributorExternalUsers", "edit");
  if ("error" in auth) return fail(auth.error);
  const parsed = externalUserSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const supabase = await createClient();
  const { error } = await supabase.from("external_users").update(parsed.data).eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(`${BASE}/external-users`);
  return ok(undefined);
}

export async function deleteExternalUser(id: string): Promise<ActionResult> {
  const auth = await authorize("ContributorExternalUsers", "delete");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from("external_users").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(`${BASE}/external-users`);
  return ok(undefined);
}

// ===== Tablettes ========================================================================
function tabletError(error: { code?: string; message?: string } | null) {
  return error?.code === "23505" ? "name_conflict" : dbError(error);
}

export async function createTablet(input: TabletInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("ContributorTablets", "add");
  if ("error" in auth) return fail(auth.error);
  const parsed = tabletSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const supabase = await createClient();
  const { data, error } = await supabase.from("tablets")
    .insert({ ...parsed.data, account_id: auth.session.collaborator.account_id }).select("id").single();
  if (error || !data) return fail(tabletError(error));
  revalidatePath(`${BASE}/tablets`);
  return ok({ id: data.id });
}

export async function updateTablet(id: string, input: TabletInput): Promise<ActionResult> {
  const auth = await authorize("ContributorTablets", "edit");
  if ("error" in auth) return fail(auth.error);
  const parsed = tabletSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const supabase = await createClient();
  const { data: before } = await supabase.from("tablets").select("profile_status").eq("id", id).maybeSingle();
  if (!before) return fail("not_found");
  if (before.profile_status === "inactive") return fail("tablet_disabled");
  const { nature, ...rest } = parsed.data; // type non modifiable après création
  void nature;
  const { error } = await supabase.from("tablets").update(rest).eq("id", id);
  if (error) return fail(tabletError(error));
  revalidatePath(`${BASE}/tablets`);
  return ok(undefined);
}

export async function setTabletActive(id: string, active: boolean): Promise<ActionResult> {
  const auth = await authorize("ContributorTablets", "edit");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from("tablets").update({ profile_status: active ? "active" : "inactive" }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(`${BASE}/tablets`);
  return ok(undefined);
}

export type TabletDependency = { type: "project" | "flow"; name: string };

export async function deleteTablet(id: string): Promise<ActionResult<undefined>> {
  const auth = await authorize("ContributorTablets", "delete");
  if ("error" in auth) return fail(auth.error);
  const admin = createAdminClient();
  const [projects, flows] = await Promise.all([
    admin.from("project_tablets").select("project:projects!inner(designation, deleted_at)").eq("tablet_id", id).is("project.deleted_at", null),
    admin.from("flows").select("name").or(`tablet_1_id.eq.${id},tablet_2_id.eq.${id},tablet_3_id.eq.${id}`).is("deleted_at", null),
  ]);
  const deps: TabletDependency[] = [
    ...(projects.data ?? []).map((r) => ({ type: "project" as const, name: r.project.designation })),
    ...(flows.data ?? []).map((r) => ({ type: "flow" as const, name: r.name })),
  ];
  if (deps.length) return fail("in_use", deps);
  const supabase = await createClient();
  const { error } = await supabase.from("tablets").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(`${BASE}/tablets`);
  return ok(undefined);
}

// ===== Appareils autorisés ==============================================================
export async function saveAuthorizedDevice(id: string | null, input: AuthorizedDeviceInput): Promise<ActionResult> {
  const auth = await authorize("ContributorAuthorizedDevices", id ? "edit" : "add");
  if ("error" in auth) return fail(auth.error);
  const parsed = authorizedDeviceSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("authorized_devices").update(parsed.data).eq("id", id)
    : await supabase.from("authorized_devices").insert({ ...parsed.data, organization_id: auth.session.collaborator.organization_id });
  if (error) return fail(error.code === "23505" ? "device_conflict" : dbError(error));
  revalidatePath(`${BASE}/authorized-devices`);
  return ok(undefined);
}

export async function deleteAuthorizedDevice(id: string): Promise<ActionResult> {
  const auth = await authorize("ContributorAuthorizedDevices", "delete");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from("authorized_devices").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(`${BASE}/authorized-devices`);
  return ok(undefined);
}
