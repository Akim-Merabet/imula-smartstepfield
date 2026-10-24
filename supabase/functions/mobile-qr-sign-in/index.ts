// Connexion rapide par QR code de l'app mobile terrain (spec 05 §1.2, §9.2).
// Le QR (WebApp, « Connexion rapide ») contient { v: 1, host, token } ; le jeton est lié au premier appareil qui l'utilise.
// Entrée : { token, device: { id, ... } }. Sortie : identique à mobile-sign-in.
import {
  checkPrincipal, fail, issueSession, preflight, PRINCIPAL_COLUMNS, type Principal, serviceClient, sha256Hex, signedIn,
  validDevice,
} from "../_shared/mobile.ts";

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== "POST") return fail("INVALID_REQUEST", 405);

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (token.length < 32 || !validDevice(body?.device)) return fail("INVALID_REQUEST", 400);
  const device = body.device;

  const db = serviceClient();
  const { data: qr } = await db.from("quick_connection_tokens").select("id, principal_id, device_id, expires_at, revoked_at")
    .eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (!qr || qr.revoked_at || new Date(qr.expires_at) <= new Date()) return fail("EXPIRED_QR", 401);
  if (qr.device_id && qr.device_id !== device.id) return fail("QR_ALREADY_BOUND", 400);

  const { data: principal } = await db.from("collaborators").select(`${PRINCIPAL_COLUMNS}, auth_user_id`)
    .eq("id", qr.principal_id).is("deleted_at", null).maybeSingle<Principal & { auth_user_id: string | null }>();
  const refused = await checkPrincipal(db, principal, device.id);
  if (refused) return refused;
  if (!principal!.auth_user_id) return fail("EXPIRED_QR", 401);

  if (!qr.device_id) {
    // Liaison au premier appareil ; la condition évite qu'un scan concurrent sur un autre appareil l'emporte.
    const { data: bound } = await db.from("quick_connection_tokens").update({ device_id: device.id })
      .eq("id", qr.id).is("device_id", null).select("id");
    if (!bound?.length) return fail("QR_ALREADY_BOUND", 400);
  }

  const session = await issueSession(db, principal!.auth_user_id);
  if (!session) return fail("EXPIRED_QR", 401);
  const { auth_user_id: _, ...rest } = principal!;
  return signedIn(session, rest);
});
