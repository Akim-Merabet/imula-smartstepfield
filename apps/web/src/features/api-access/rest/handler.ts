import "server-only";
import { after, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "../crypto";
import { API_V2_BASE, classAllows, type ApiKeyType, type ServiceClass } from "../meta";
import { ApiError, errorBody, fromDbError, noRight } from "./errors";
import { isUuid } from "./params";
import { hitRateLimit, RATE_LIMITS } from "./rate-limit";

export type Db = ReturnType<typeof createAdminClient>;

export type ApiClientCtx = {
  id: string;
  name: string;
  keyType: ApiKeyType;
  serviceClass: ServiceClass;
  organizationId: string;
  accountId: string | null;
};

/**
 * Contexte d'un appel authentifié. Toutes les requêtes passent par le client service (contournement RLS) :
 * le filtrage par `organizationId` / `accountId` est donc OBLIGATOIRE dans chaque ressource.
 */
export type ApiContext = {
  req: NextRequest;
  url: URL;
  path: string;
  db: Db;
  client: ApiClientCtx;
  organizationId: string;
  /** Compte (applicabilité) ciblé : celui de la clé compte, ou le paramètre `accountId` d'une clé organisation. */
  accountId: string;
  /** Entités publiées d'autres comptes de l'organisation (données partagées dans l'organisation). */
  sharedProjectIds: () => Promise<string[]>;
};

export type AccountMode = "required" | "none";

type HandlerOptions = { level: ServiceClass; account?: AccountMode };
type RouteParams = { params: Promise<Record<string, string>> };
type Handler<P> = (ctx: ApiContext, params: P) => Promise<Response>;
type OrgHandler<P> = (ctx: Omit<ApiContext, "accountId" | "sharedProjectIds"> & { accountId: string | null }, params: P) => Promise<Response>;

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return Response.json(body, { status: init.status ?? 200, headers: { ...SECURITY_HEADERS, ...init.headers } });
}

/** Liste paginée : corps `{ data: [...] }` + en-têtes X-Count / X-Total-Count. */
export function list(items: unknown[], total: number) {
  return json({ data: items }, { headers: { "X-Count": String(items.length), "X-Total-Count": String(total) } });
}

export const one = (item: unknown, status = 200) => json({ data: item }, { status });

export function apiPath(url: URL) {
  return url.pathname.startsWith(API_V2_BASE) ? url.pathname.slice(API_V2_BASE.length) || "/" : url.pathname;
}

export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export function errorResponse(path: string, e: unknown) {
  const err = e instanceof ApiError ? e : new ApiError("INTERNAL-ERROR");
  if (!(e instanceof ApiError)) console.error("[api/ext/v2]", path, e instanceof Error ? e.message : e);
  return json(errorBody(path, err), { status: err.status, headers: err.headers });
}

/** Journalise l'appel après la réponse (aucune valeur de paramètre, aucun corps, aucun jeton). */
export function logRequest(entry: {
  db: Db; req: NextRequest; url: URL; status: number; errorKey: string | null; start: number;
  clientId?: string | null; organizationId?: string | null; accountId?: string | null;
}) {
  const { db, req, url } = entry;
  after(async () => {
    const { error } = await db.from("api_request_logs").insert({
      api_client_id: entry.clientId ?? null,
      organization_id: entry.organizationId ?? null,
      account_id: entry.accountId ?? null,
      method: req.method,
      path: url.pathname.slice(0, 500),
      query_keys: [...new Set([...url.searchParams.keys()])].slice(0, 30).map((k) => k.slice(0, 60)),
      status: entry.status,
      error_key: entry.errorKey,
      duration_ms: Math.round(performance.now() - entry.start),
      ip: clientIp(req).slice(0, 64),
      user_agent: req.headers.get("user-agent")?.slice(0, 255) ?? null,
    });
    if (error) console.error("[api/ext/v2] log insert failed", error.code);
  });
}

/** Résout le client à partir du jeton Bearer (empreinte SHA-256, jeton non expiré, clé active). */
async function authenticate(db: Db, req: NextRequest): Promise<ApiClientCtx> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  if (!m || m[1].length > 200) throw new ApiError("UNAUTHORIZED");
  const { data: token } = await db.from("api_access_tokens")
    .select("expires_at, revoked_at, client:api_clients!inner(id, name, key_type, service_class, organization_id, account_id, active, expires_at, revoked_at)")
    .eq("token_hash", hashToken(m[1])).maybeSingle();
  const now = Date.now();
  const c = token?.client;
  if (!token || !c || token.revoked_at || new Date(token.expires_at).getTime() <= now) throw new ApiError("UNAUTHORIZED");
  if (!c.active || c.revoked_at || (c.expires_at && new Date(c.expires_at).getTime() <= now)) throw new ApiError("UNAUTHORIZED");
  return {
    id: c.id, name: c.name, keyType: c.key_type, serviceClass: c.service_class,
    organizationId: c.organization_id, accountId: c.account_id,
  };
}

/**
 * Compte ciblé (« API-key-Scope ») :
 * - clé compte : le compte de la clé ; un `accountId` différent → 403 NO-RIGHT ;
 * - clé organisation : `accountId` (query) ou en-tête `X-Account-Id` obligatoire, compte de la même organisation.
 */
async function resolveAccount(db: Db, req: NextRequest, url: URL, client: ApiClientCtx): Promise<string> {
  const requested = url.searchParams.get("accountId") ?? req.headers.get("x-account-id");
  if (requested !== null && !isUuid(requested)) {
    throw new ApiError("VALUE-NOT-VALID", "Value of parameter 'accountId' must be a UUID", { field: "accountId" });
  }
  if (client.keyType === "account") {
    if (requested && requested.toLowerCase() !== client.accountId) {
      throw noRight("Account key used is not allowed to execute a query targeting a different account");
    }
    return client.accountId!;
  }
  if (!requested) {
    throw new ApiError("REQUIRED-MISSING", "Organization key: parameter 'accountId' (target account) is required", { field: "accountId" });
  }
  const { data: account } = await db.from("accounts").select("id").eq("id", requested.toLowerCase())
    .eq("organization_id", client.organizationId).maybeSingle();
  if (!account) throw new ApiError("NO-RIGHT", "Target account does not belong to the organization of the API key", { field: "accountId" });
  return account.id;
}

async function run<P>(req: NextRequest, rp: RouteParams, opts: HandlerOptions,
  fn: (ctx: ApiContext | (Omit<ApiContext, "accountId" | "sharedProjectIds"> & { accountId: string | null }), params: P) => Promise<Response>) {
  const start = performance.now();
  const url = new URL(req.url);
  const path = apiPath(url);
  const db = createAdminClient();
  let client: ApiClientCtx | null = null;
  let accountId: string | null = null;
  let res: Response;
  let errorKey: string | null = null;
  try {
    client = await authenticate(db, req);
    const rl = hitRateLimit(`client:${client.id}`, RATE_LIMITS.perClient);
    if (!rl.allowed) {
      throw new ApiError("TOO-MANY-REQUESTS", undefined, { retryAfter: rl.retryAfter },
        { "Retry-After": String(rl.retryAfter), "X-RateLimit-Limit": String(rl.limit), "X-RateLimit-Remaining": "0" });
    }
    if (!classAllows(client.serviceClass, opts.level)) {
      throw noRight(`This endpoint requires service class ${opts.level} (granted: ${client.serviceClass})`);
    }
    if ((opts.account ?? "required") === "required") accountId = await resolveAccount(db, req, url, client);
    const params = (await rp.params) as P;
    const orgId = client.organizationId;
    let shared: Promise<string[]> | null = null;
    const ctx = {
      req, url, path, db, client, organizationId: orgId, accountId,
      sharedProjectIds: () => {
        shared ??= (async () => {
          if (!accountId) return [];
          const { data, error } = await db.from("projects").select("id").eq("organization_id", orgId)
            .eq("published", true).neq("account_id", accountId).is("deleted_at", null).limit(1000);
          if (error) throw fromDbError(error);
          return (data ?? []).map((p) => p.id);
        })();
        return shared;
      },
    };
    res = await fn(ctx as ApiContext, params);
  } catch (e) {
    res = errorResponse(path, e);
    errorKey = e instanceof ApiError ? e.key : "INTERNAL-ERROR";
  }
  logRequest({ db, req, url, status: res.status, errorKey, start, clientId: client?.id, organizationId: client?.organizationId, accountId });
  return res;
}

/** Endpoint authentifié dans le périmètre d'un compte (compte de la clé ou compte ciblé par une clé organisation). */
export function apiRoute<P extends Record<string, string> = Record<string, never>>(opts: { level: ServiceClass }, fn: Handler<P>) {
  return (req: NextRequest, rp: RouteParams) => run<P>(req, rp, { ...opts, account: "required" }, fn as never);
}

/** Endpoint authentifié de niveau organisation (pas de compte cible requis), ex. label-applicabilities. */
export function apiOrgRoute<P extends Record<string, string> = Record<string, never>>(opts: { level: ServiceClass }, fn: OrgHandler<P>) {
  return (req: NextRequest, rp: RouteParams) => run<P>(req, rp, { ...opts, account: "none" }, fn as never);
}

/**
 * Filtre PostgREST `or` du périmètre de lecture : données du compte + données des entités publiées
 * (partagées dans l'organisation). À combiner TOUJOURS avec `.eq("organization_id", ctx.organizationId)`.
 */
export async function accountScopeFilter(ctx: ApiContext, projectColumn = "project_id"): Promise<string> {
  const shared = await ctx.sharedProjectIds();
  return shared.length ? `account_id.eq.${ctx.accountId},${projectColumn}.in.(${shared.join(",")})` : `account_id.eq.${ctx.accountId}`;
}

/** Contrôle de visibilité d'un objet chargé par identifiant (déjà filtré par organisation). */
export async function assertReadable(ctx: ApiContext, row: { account_id: string; project_id?: string | null }) {
  if (row.account_id === ctx.accountId) return;
  if (row.project_id && (await ctx.sharedProjectIds()).includes(row.project_id)) return;
  throw noRight("The object belongs to another account");
}

/** Écriture : uniquement sur les données du compte ciblé. */
export function assertWritable(ctx: ApiContext, row: { account_id: string }) {
  if (row.account_id !== ctx.accountId) throw noRight("The object belongs to another account");
}

export type PgResult<R> = { data: R[] | null; count: number | null; error: { code?: string; message?: string } | null };

/** Exécute une requête paginée ; offset ≥ total → liste vide (et non une erreur 416). */
export async function page<R>(paging: { limit: number; offset: number }, exec: (from: number, to: number) => PromiseLike<PgResult<R>>) {
  const res = await exec(paging.offset, paging.offset + paging.limit - 1);
  if (res.error?.code === "PGRST103") {
    const c = await exec(0, 0);
    if (c.error) throw fromDbError(c.error);
    return { items: [] as R[], total: c.count ?? 0 };
  }
  if (res.error) throw fromDbError(res.error);
  return { items: res.data ?? [], total: res.count ?? 0 };
}

export function dbCheck<T>(res: { data: T; error: { code?: string; message?: string } | null }): T {
  if (res.error) throw fromDbError(res.error);
  return res.data;
}
