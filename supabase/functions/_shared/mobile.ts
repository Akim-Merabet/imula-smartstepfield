// Outils communs aux fonctions de connexion de l'app mobile terrain (spec 05 §1.1, §1.2, §9.2).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type MobileErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_DOMAIN"
  | "INVALID_CREDENTIALS"
  | "PROFILE_BLOCKED"
  | "DEVICE_UNAUTHORIZED"
  | "ANOTHER_DEVICE"
  | "EXPIRED_QR"
  | "QR_ALREADY_BOUND";

export type DeviceInfo = {
  id: string;
  app_version?: string | null;
  os_version?: string | null;
  model?: string | null;
  screen_size?: string | null;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

export function fail(code: MobileErrorCode, status: number): Response {
  return json({ error: code }, status);
}

export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: CORS }) : null;
}

const env = (name: string) => Deno.env.get(name) ?? "";

/** Client service (contourne la RLS) : n'appliquer que des filtres stricts sur la cible. */
export function serviceClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client anonyme, pour ouvrir une session au nom de l'utilisateur. */
export function anonClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** « Entreprise » saisie sur l'appareil : sous-domaine seul ou hôte complet (acme, acme.imula.fr, https://acme.imula.fr). */
export function subdomainOf(company: string): string {
  const host = company.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  return host.split(".")[0];
}

export function validDevice(device: unknown): device is DeviceInfo {
  const d = device as DeviceInfo | null;
  return !!d && typeof d.id === "string" && d.id.length >= 3 && d.id.length <= 200;
}

/** R-LOG-2 : liste d'appareils autorisés de l'organisation (vide = tout appareil accepté). */
export async function deviceAuthorized(db: SupabaseClient, organizationId: string, deviceId: string): Promise<boolean> {
  const { data } = await db.from("authorized_devices").select("device_id").eq("organization_id", organizationId);
  return !data?.length || data.some((d) => d.device_id === deviceId);
}

/** R-LOG-1 : un profil n'est lié qu'à un appareil ; lie le profil à cet appareil s'il est libre. */
export async function bindDevice(db: SupabaseClient, principalId: string, deviceId: string): Promise<boolean> {
  const { data: binding } = await db.from("mobile_device_bindings").select("device_id")
    .eq("principal_id", principalId).maybeSingle();
  if (binding && binding.device_id !== deviceId) return false;
  const now = new Date().toISOString();
  const { error } = binding
    ? await db.from("mobile_device_bindings").update({ last_seen_at: now }).eq("principal_id", principalId)
    : await db.from("mobile_device_bindings").insert({ principal_id: principalId, device_id: deviceId });
  if (error) throw error;
  return true;
}

/** Empreinte stockée d'un jeton de connexion rapide (le jeton lui-même n'est jamais conservé). */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Ouvre une session au nom d'un utilisateur sans mot de passe (lien magique généré côté serveur, jamais envoyé). */
export async function issueSession(db: SupabaseClient, authUserId: string) {
  const { data: user } = await db.auth.admin.getUserById(authUserId);
  const email = user.user?.email;
  if (!email) return null;
  const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !link.properties?.hashed_token) return null;
  const { data } = await anonClient().auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  return data.session ?? null;
}

export type Principal = {
  id: string;
  kind: "user" | "operator" | "device";
  first_name: string;
  last_name: string;
  organization_id: string;
  account_id: string;
  language: string;
  status: string;
};

export const PRINCIPAL_COLUMNS = "id, kind, first_name, last_name, organization_id, account_id, language, status";

/** R-LOG-1/2 et statut du profil : contrôles communs aux deux modes de connexion. */
export async function checkPrincipal(db: SupabaseClient, principal: Principal | null, deviceId: string):
  Promise<Response | null> {
  if (!principal || principal.status === "inactive" || principal.status === "deleted") return fail("INVALID_CREDENTIALS", 401);
  if (principal.status === "blocked") return fail("PROFILE_BLOCKED", 401);
  if (!(await deviceAuthorized(db, principal.organization_id, deviceId))) return fail("DEVICE_UNAUTHORIZED", 401);
  if (!(await bindDevice(db, principal.id, deviceId))) return fail("ANOTHER_DEVICE", 400);
  return null;
}

type SessionLike = { access_token: string; refresh_token: string; expires_at?: number; user: { id: string } };

export function signedIn(session: SessionLike, principal: Principal): Response {
  return json({
    session: {
      access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at,
      user_id: session.user.id,
    },
    principal,
  });
}
