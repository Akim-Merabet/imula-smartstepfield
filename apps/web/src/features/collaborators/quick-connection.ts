"use server";

import { createHash, randomBytes } from "node:crypto";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { getSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Connexion rapide (QR) de l'app mobile terrain — spec 01 §2.9/§4.8, spec 05 §1.2.
 * Le QR contient { v: 1, host, token } ; seul le hash du jeton est stocké (quick_connection_tokens).
 * La fonction Edge mobile-qr-sign-in l'échange contre une session et le lie au premier appareil qui le scanne.
 */
export type QuickConnectionTarget = { type: "user" | "tablet"; id: string };

const QR_TTL_DAYS = 30;

type Resolved = { principalId: string; authUserId: string | null };

/**
 * Contrôles d'accès et résolution du collaborateur porteur de la session mobile.
 * `write` : action qui modifie l'accès d'un autre profil (dissocier l'appareil) → droit de modification exigé.
 */
async function resolve(target: QuickConnectionTarget, write = false): Promise<ActionResult<Resolved>> {
  const session = await getSession();
  if (!session) return fail("unauthenticated");
  const supabase = await createClient();

  if (target.type === "user") {
    if (target.id !== session.collaborator.id) {
      const auth = await authorize("ContributorUsers", write ? "edit" : "read");
      if ("error" in auth) return fail(auth.error);
    }
    const { data: c } = await supabase.from("collaborators").select("id, kind, status, auth_user_id")
      .eq("id", target.id).is("deleted_at", null).maybeSingle();
    if (!c || c.kind !== "user") return fail("not_found");
    if (c.status !== "active") return fail("forbidden");
    return ok({ principalId: c.id, authUserId: c.auth_user_id });
  }

  const auth = await authorize("ContributorTablets", "edit");
  if ("error" in auth) return fail(auth.error);
  const { data: tablet } = await supabase.from("tablets").select("id, profile_status, collaborator_id")
    .eq("id", target.id).is("deleted_at", null).maybeSingle();
  if (!tablet?.collaborator_id) return fail("not_found");
  if (tablet.profile_status === "inactive") return fail("tablet_disabled");
  const { data: c } = await createAdminClient().from("collaborators").select("auth_user_id")
    .eq("id", tablet.collaborator_id).single();
  return ok({ principalId: tablet.collaborator_id, authUserId: c?.auth_user_id ?? null });
}

/**
 * Compte d'authentification technique du collaborateur « appareil » d'une tablette (sans mot de passe).
 * Un compte déjà créé (lien perdu, essai précédent interrompu) est retrouvé par son adresse et relié.
 */
async function ensureDeviceAuthUser(principalId: string): Promise<string | null> {
  const admin = createAdminClient();
  const email = `tablet-${principalId}@devices.imula.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { device: true } });
  let userId = data.user?.id ?? null;
  if (error && !userId) {
    for (let page = 1; page <= 50 && !userId; page++) {
      const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      userId = list?.users.find((u) => u.email === email)?.id ?? null;
      if (!list?.users.length || list.users.length < 200) break;
    }
  }
  if (!userId) return null;
  const { error: linkErr } = await admin.from("collaborators").update({ auth_user_id: userId }).eq("id", principalId);
  return linkErr ? null : userId;
}

/** Vérifie le mot de passe de l'utilisateur ciblé (modale « Connexion avec QR code ») sans ouvrir de session. */
async function checkPassword(authUserId: string, password: string): Promise<boolean> {
  if (!password) return false;
  const { data, error } = await createAdminClient().rpc("verify_user_password", { p_user_id: authUserId, p_password: password });
  return !error && data === true;
}

/**
 * Génère un nouveau QR. Les QR précédents jamais utilisés sont révoqués ; ceux déjà liés à un appareil restent
 * valables pour cet appareil jusqu'à « Dissocier l'appareil actuel ».
 */
export async function generateQuickConnection(target: QuickConnectionTarget, password?: string):
  Promise<ActionResult<{ payload: string; expiresAt: string }>> {
  const res = await resolve(target);
  if (!res.ok) return res;
  let { authUserId } = res.data;
  const { principalId } = res.data;

  if (target.type === "user") {
    if (!authUserId || !(await checkPassword(authUserId, password ?? ""))) return fail("wrong_password");
  } else if (!authUserId) {
    authUserId = await ensureDeviceAuthUser(principalId);
    if (!authUserId) return fail("unknown");
  }

  const session = (await getSession())!;
  const admin = createAdminClient();
  const { error: revokeErr } = await admin.from("quick_connection_tokens").update({ revoked_at: new Date().toISOString() })
    .eq("principal_id", principalId).is("revoked_at", null).is("device_id", null);
  if (revokeErr) return fail(dbError(revokeErr));

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + QR_TTL_DAYS * 86_400_000).toISOString();
  const { error } = await admin.from("quick_connection_tokens").insert({
    principal_id: principalId, token_hash: createHash("sha256").update(token).digest("hex"),
    created_by: session.collaborator.id, expires_at: expiresAt,
  });
  if (error) return fail(dbError(error));
  return ok({ payload: JSON.stringify({ v: 1, host: session.organization.subdomain, token }), expiresAt });
}

/** « Dissocier l'appareil actuel » : libère le profil (R-LOG-1) et invalide les QR déjà scannés. */
export async function unlinkQuickConnectionDevice(target: QuickConnectionTarget): Promise<ActionResult> {
  const res = await resolve(target, true);
  if (!res.ok) return res;
  const { principalId } = res.data;
  const admin = createAdminClient();
  const { error } = await admin.from("mobile_device_bindings").delete().eq("principal_id", principalId);
  if (error) return fail(dbError(error));
  const { error: revokeErr } = await admin.from("quick_connection_tokens").update({ revoked_at: new Date().toISOString() })
    .eq("principal_id", principalId).is("revoked_at", null).not("device_id", "is", null);
  if (revokeErr) return fail(dbError(revokeErr));
  return ok(undefined);
}
