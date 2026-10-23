/**
 * Typologie des erreurs (« Typology-of-errors ») : statut HTTP + clé prédéfinie.
 * Corps : `{ path, key, code, message, details }` — `key` (doc d'origine) et `code` (alias) portent la même valeur.
 */
export const ERROR_STATUS = {
  "REQUIRED-MISSING": 400,
  "VALUE-NOT-VALID": 400,
  UNAUTHORIZED: 401,
  "NO-RIGHT": 403,
  "OBJECT-NOT-FOUND": 404,
  "CONSTRAINT-NOT-SATISFIED": 409,
  "PAYLOAD-TOO-LARGE": 413,
  "TOO-MANY-REQUESTS": 429,
  "INTERNAL-ERROR": 500,
} as const;
export type ApiErrorKey = keyof typeof ERROR_STATUS;

export const DEFAULT_MESSAGES: Record<ApiErrorKey, string> = {
  "REQUIRED-MISSING": "Required parameter is missing in the query",
  "VALUE-NOT-VALID": "Value of parameter is not valid",
  UNAUTHORIZED: "Access token is invalid or has expired",
  "NO-RIGHT": "API Consumer does not have the adequate privilege to execute the query",
  "OBJECT-NOT-FOUND": "Object identifier could not be found",
  "CONSTRAINT-NOT-SATISFIED": "Parameter values are inconsistent or do not satisfy business rules",
  "PAYLOAD-TOO-LARGE": "Request body is too large",
  "TOO-MANY-REQUESTS": "Rate limit exceeded, retry later",
  "INTERNAL-ERROR": "Unexpected error",
};

export class ApiError extends Error {
  readonly key: ApiErrorKey;
  readonly details?: unknown;
  readonly headers?: Record<string, string>;
  constructor(key: ApiErrorKey, message?: string, details?: unknown, headers?: Record<string, string>) {
    super(message ?? DEFAULT_MESSAGES[key]);
    this.key = key;
    this.details = details;
    this.headers = headers;
  }
  get status() {
    return ERROR_STATUS[this.key];
  }
}

export const required = (field: string) => new ApiError("REQUIRED-MISSING", `Required parameter '${field}' is missing`, { field });
export const invalid = (field: string, message?: string, details?: Record<string, unknown>) =>
  new ApiError("VALUE-NOT-VALID", message ?? `Value of parameter '${field}' is not valid`, { field, ...details });
export const notFound = (kind: string, id: string) =>
  new ApiError("OBJECT-NOT-FOUND", `${kind} having identifier '${id}' could not be found`, { kind, identifier: id });
export const noRight = (message?: string) => new ApiError("NO-RIGHT", message);
export const conflict = (message: string, details?: unknown) => new ApiError("CONSTRAINT-NOT-SATISFIED", message, details);

export function errorBody(path: string, err: ApiError) {
  return { path, key: err.key, code: err.key, message: err.message, details: err.details ?? null };
}

/** Erreur Postgres / PostgREST → erreur API (sans divulguer le message SQL brut). */
export function fromDbError(error: { code?: string; message?: string; details?: string } | null | undefined): ApiError {
  const code = error?.code;
  if (code === "23505") return conflict("An object with the same unique attributes already exists");
  if (code === "23503") return conflict("A referenced object does not exist or is still in use");
  if (code === "23514" || code === "22P02" || code === "22007" || code === "22008") return conflict("Values do not satisfy business rules");
  if (code === "P0001") return conflict(error?.message ?? "Business rule violated");
  return new ApiError("INTERNAL-ERROR");
}
