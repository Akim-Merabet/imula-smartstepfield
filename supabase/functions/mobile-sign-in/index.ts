// Connexion par identifiants de l'app mobile terrain (spec 05 §1.1, §9.2).
// Entrée : { email, password, company, device: { id, app_version, os_version, model, screen_size } }.
// Sortie : { session: { access_token, refresh_token, expires_at, user_id }, principal } ou { error: code }.
import {
  anonClient, checkPrincipal, fail, preflight, PRINCIPAL_COLUMNS, type Principal, serviceClient, signedIn, subdomainOf,
  validDevice,
} from "../_shared/mobile.ts";

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== "POST") return fail("INVALID_REQUEST", 405);

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const company = typeof body?.company === "string" ? body.company : "";
  if (!email || password.length < 6 || !company.trim() || !validDevice(body?.device)) return fail("INVALID_REQUEST", 400);
  const device = body.device;

  const db = serviceClient();
  const { data: org } = await db.from("organizations").select("id").eq("subdomain", subdomainOf(company)).maybeSingle();
  if (!org) return fail("INVALID_DOMAIN", 404);

  const auth = anonClient();
  const { data: signIn, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !signIn.session) return fail("INVALID_CREDENTIALS", 401);

  const { data: principal } = await db.from("collaborators").select(PRINCIPAL_COLUMNS)
    .eq("auth_user_id", signIn.user.id).eq("organization_id", org.id).is("deleted_at", null)
    .maybeSingle<Principal>();
  const refused = await checkPrincipal(db, principal, device.id);
  if (refused) {
    await auth.auth.signOut({ scope: "local" });
    return refused;
  }
  return signedIn(signIn.session, principal!);
});
