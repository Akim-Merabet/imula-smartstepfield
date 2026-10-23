import type { z } from "zod";
import { ApiError, invalid, required } from "./errors";

/** Pagination (« Retrieving-lists-of-items ») : limit 1..100 (défaut 20), offset ≥ 0 (défaut 0). */
export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 20;
export type Paging = { limit: number; offset: number };

function intParam(sp: URLSearchParams, name: string, def: number, min: number, max: number): number {
  const raw = sp.get(name);
  if (raw === null || raw === "") return def;
  if (!/^\d+$/.test(raw)) throw invalid(name, `Value of parameter '${name}' must be an integer between ${min} and ${max}`);
  const n = Number(raw);
  if (n < min || n > max) throw invalid(name, `Value of parameter '${name}' must be an integer between ${min} and ${max}`);
  return n;
}

export function parsePaging(sp: URLSearchParams): Paging {
  return {
    limit: intParam(sp, "limit", DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: intParam(sp, "offset", 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function parseDate(sp: URLSearchParams, name: string): string | null {
  const raw = sp.get(name);
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw invalid(name, `Value of parameter '${name}' must be an ISO 8601 datetime`);
  return d.toISOString();
}

/** Filtres de date incrémentaux communs : createdAfterAt, modifiedAfterAt. */
export function parseDateFilters(sp: URLSearchParams) {
  return { createdAfterAt: parseDate(sp, "createdAfterAt"), modifiedAfterAt: parseDate(sp, "modifiedAfterAt") };
}

/**
 * Paramètre `embed` (« Response-data-selection-with-embed-parameter ») : mots-clés propres à chaque endpoint,
 * répétables (`embed=A&embed=B`) ou séparés par des virgules ; aucun par défaut.
 */
export function parseEmbed<T extends string>(sp: URLSearchParams, allowed: readonly T[]): Set<T> {
  const values = sp.getAll("embed").flatMap((v) => v.split(",")).map((v) => v.trim().toUpperCase()).filter(Boolean);
  const out = new Set<T>();
  for (const v of values) {
    if (!(allowed as readonly string[]).includes(v)) {
      throw invalid("embed", `Embed keyword '${v}' is not available for this endpoint`, { allowed });
    }
    out.add(v as T);
  }
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID_RE.test(v);

export function uuidParam(sp: URLSearchParams, name: string, opts: { required?: boolean } = {}): string | null {
  const raw = sp.get(name);
  if (!raw) {
    if (opts.required) throw required(name);
    return null;
  }
  if (!isUuid(raw)) throw invalid(name, `Value of parameter '${name}' must be a UUID`);
  return raw.toLowerCase();
}

export function pathUuid(value: string, name: string): string {
  if (!isUuid(value)) throw invalid(name, `Value of parameter '${name}' must be a UUID`);
  return value.toLowerCase();
}

export function boolParam(sp: URLSearchParams, name: string): boolean {
  const raw = sp.get(name);
  if (raw === null || raw === "") return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw invalid(name, `Value of parameter '${name}' must be true or false`);
}

/** Énumération API (MAJUSCULES) → valeur interne (minuscules) ; liste séparée par des virgules acceptée. */
export function enumListParam<T extends string>(sp: URLSearchParams, name: string, values: readonly T[]): T[] {
  const raw = sp.getAll(name).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  return raw.map((v) => {
    const internal = v.toLowerCase() as T;
    if (!values.includes(internal)) throw invalid(name, `Value '${v}' of parameter '${name}' is not valid`, { allowed: values.map((x) => x.toUpperCase()) });
    return internal;
  });
}

export function textParam(sp: URLSearchParams, name: string, max = 255): string | null {
  const raw = sp.get(name);
  if (raw === null) return null;
  const v = raw.trim();
  if (!v) return null;
  if (v.length > max) throw invalid(name, `Value of parameter '${name}' is too long`);
  return v;
}

/** Échappe une valeur pour un motif ILIKE PostgREST (`%`, `_`, `,`, parenthèses). */
export function likePattern(v: string): string {
  return `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const MAX_BODY_BYTES = 1024 * 1024;

/** Lit et valide un corps JSON avec zod ; champ absent → REQUIRED-MISSING, autre erreur → VALUE-NOT-VALID. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) throw new ApiError("PAYLOAD-TOO-LARGE");
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) throw new ApiError("PAYLOAD-TOO-LARGE");
    raw = text ? JSON.parse(text) : undefined;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("VALUE-NOT-VALID", "Request body is not valid JSON");
  }
  if (raw === undefined) throw new ApiError("REQUIRED-MISSING", "Request body is missing");
  const res = schema.safeParse(raw);
  if (res.success) return res.data;
  const issues = res.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
  const missing = res.error.issues.find((i) => i.code === "invalid_type" && /received undefined/.test(i.message));
  if (missing) {
    throw new ApiError("REQUIRED-MISSING", `Required parameter '${missing.path.join(".")}' is missing`, { issues });
  }
  throw new ApiError("VALUE-NOT-VALID", "Value of parameter is not valid", { issues });
}
