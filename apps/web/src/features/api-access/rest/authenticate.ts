import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACCESS_TOKEN_TTL_SECONDS, dummySecretHash, generateAccessToken, hashToken, verifySecret } from "../crypto";
import { ApiError } from "./errors";
import { apiPath, clientIp, errorResponse, json, logRequest } from "./handler";
import { parseBody } from "./params";
import { hitRateLimit, RATE_LIMITS } from "./rate-limit";

export const authenticateSchema = z.object({
  clientId: z.string().min(1).max(100),
  clientSecret: z.string().min(1).max(200),
});

/**
 * POST /authenticate : identifiant + secret client → jeton d'accès opaque valable 24 h.
 * Réponse sans racine `data` (exception documentée « Typology-of-errors »).
 */
export async function authenticateHandler(req: NextRequest) {
  const start = performance.now();
  const url = new URL(req.url);
  const path = apiPath(url);
  const db = createAdminClient();
  let res: Response;
  let errorKey: string | null = null;
  let client: { id: string; organization_id: string; account_id: string | null } | null = null;
  try {
    const rl = hitRateLimit(`auth:${clientIp(req)}`, RATE_LIMITS.authPerIp);
    if (!rl.allowed) {
      throw new ApiError("TOO-MANY-REQUESTS", undefined, { retryAfter: rl.retryAfter }, { "Retry-After": String(rl.retryAfter) });
    }
    const body = await parseBody(req, authenticateSchema);
    const { data: row } = await db.from("api_clients")
      .select("id, organization_id, account_id, active, expires_at, revoked_at, secret:api_client_secrets(secret_hash)")
      .eq("client_id", body.clientId).maybeSingle();
    const secretHash = row?.secret?.secret_hash ?? null;
    // Toujours exécuter scrypt (empreinte factice si client inconnu) : pas d'oracle temporel sur l'existence du client_id.
    const valid = await verifySecret(body.clientSecret, secretHash ?? (await dummySecretHash()));
    const now = Date.now();
    if (!row || !secretHash || !valid) throw new ApiError("UNAUTHORIZED", "Invalid client credentials");
    if (!row.active || row.revoked_at || (row.expires_at && new Date(row.expires_at).getTime() <= now)) {
      throw new ApiError("UNAUTHORIZED", "Invalid client credentials");
    }
    client = row;
    const token = generateAccessToken();
    const expiresAt = new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString();
    const { error } = await db.from("api_access_tokens").insert({ api_client_id: row.id, token_hash: hashToken(token), expires_at: expiresAt });
    if (error) throw new ApiError("INTERNAL-ERROR");
    await Promise.all([
      db.from("api_clients").update({ last_used_at: new Date(now).toISOString() }).eq("id", row.id),
      db.from("api_access_tokens").delete().eq("api_client_id", row.id).lt("expires_at", new Date(now).toISOString()),
    ]);
    res = json({ accessToken: token, tokenType: "Bearer", expiresIn: ACCESS_TOKEN_TTL_SECONDS, expiresAt });
  } catch (e) {
    res = errorResponse(path, e);
    errorKey = e instanceof ApiError ? e.key : "INTERNAL-ERROR";
  }
  logRequest({ db, req, url, status: res.status, errorKey, start, clientId: client?.id, organizationId: client?.organization_id, accountId: client?.account_id });
  return res;
}
