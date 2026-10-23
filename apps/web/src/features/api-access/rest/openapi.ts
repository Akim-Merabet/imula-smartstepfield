import "server-only";
import { z } from "zod";
import { API_V2_BASE } from "../meta";
import { ACCOUNT_PARAM, COMMON_LIST_PARAMS, ENDPOINTS, type Endpoint, type ParamDef } from "./catalog";
import { ERROR_STATUS, DEFAULT_MESSAGES, type ApiErrorKey } from "./errors";

const STATUS_DESCRIPTION: Record<number, string> = {
  400: "Bad Request (REQUIRED-MISSING, VALUE-NOT-VALID)",
  401: "Unauthorized (UNAUTHORIZED)",
  403: "Forbidden (NO-RIGHT)",
  404: "Not Found (OBJECT-NOT-FOUND)",
  409: "Conflict (CONSTRAINT-NOT-SATISFIED)",
  429: "Too Many Requests (TOO-MANY-REQUESTS)",
};

function paramSchema(p: ParamDef): Record<string, unknown> {
  switch (p.type) {
    case "uuid": return { type: "string", format: "uuid" };
    case "integer": return { type: "integer", minimum: 0 };
    case "boolean": return { type: "boolean" };
    case "datetime": return { type: "string", format: "date-time" };
    case "enum": return { type: "string", description: `One or more of ${p.enum?.join(", ")}, comma separated`, examples: p.enum?.slice(0, 1) };
    default: return { type: "string" };
  }
}

function bodySchema(schema: z.ZodType) {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function operation(e: Endpoint) {
  const params: ParamDef[] = [...(e.params ?? [])];
  if (e.paginated) params.push(...COMMON_LIST_PARAMS);
  if (e.level && e.accountScoped !== false) params.push(ACCOUNT_PARAM);
  if (e.embed?.length) {
    params.push({ name: "embed", in: "query", type: "enum", enum: e.embed, description: `Embed keywords: ${e.embed.join(", ")}` });
  }
  const errors = e.level ? [400, 401, 403, 404, 409, 429] : [400, 401, 429];
  const ok = e.created ? "201" : "200";
  const responses: Record<string, unknown> = {
    [ok]: {
      description: e.id === "authenticate" ? "Access token" : e.paginated ? "List of items (root `data`)" : "Item (root `data`)",
      ...(e.paginated ? {
        headers: {
          "X-Count": { description: "Number of items returned", schema: { type: "integer" } },
          "X-Total-Count": { description: "Total number of items satisfying the query", schema: { type: "integer" } },
        },
      } : {}),
      content: { "application/json": { schema: e.id === "authenticate" ? { $ref: "#/components/schemas/AccessToken" } : e.paginated
        ? { type: "object", properties: { data: { type: "array", items: { type: "object" } } }, required: ["data"] }
        : { type: "object", properties: { data: {} }, required: ["data"] } } },
    },
  };
  for (const s of errors) {
    responses[String(s)] = { description: STATUS_DESCRIPTION[s], content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
  }
  return {
    operationId: e.id,
    tags: [e.tag],
    summary: e.summary.en,
    description: `${e.summary.fr}${e.level ? `\n\nService class: **${e.level}**` : ""}`,
    ...(e.level ? { security: [{ bearerAuth: [] }], "x-service-class": e.level } : { security: [] }),
    parameters: params.map((p) => ({ name: p.name, in: p.in, required: p.in === "path" || !!p.required, description: p.description, schema: paramSchema(p) })),
    ...(e.body ? { requestBody: { required: true, content: { "application/json": { schema: bodySchema(e.body) } } } } : {}),
    responses,
  };
}

/** Document OpenAPI 3.1 généré depuis le catalogue (schémas de corps issus de zod via z.toJSONSchema). */
export function buildOpenApi(origin: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
    paths[e.path] ??= {};
    paths[e.path][e.method.toLowerCase()] = operation(e);
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Field operations API",
      version: "2.0.0",
      description: [
        "REST API v2: data analysis (datalake, dashboards) and transactional exchanges.",
        "Authenticate with `POST /authenticate` (clientId + clientSecret) to get a Bearer token valid 24 h.",
        "Account keys see their account data and data shared in the organization (published entities); organization keys must target one account per query with `accountId`.",
        "Service classes: L1 = read endpoints, L2 = unit writes and exports, L3 = bulk operations (L1 ⊂ L2 ⊂ L3).",
        "Lists: `limit` (1..100, default 20), `offset`, `createdAfterAt`, `modifiedAfterAt`; headers `X-Count` and `X-Total-Count`; sorted by creation date (oldest first).",
        "Errors: body `{ path, key, code, message, details }`.",
      ].join("\n\n"),
    },
    servers: [{ url: `${origin}${API_V2_BASE}` }],
    tags: [...new Set(ENDPOINTS.map((e) => e.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "Opaque access token from POST /authenticate (24 h)" } },
      schemas: {
        Error: {
          type: "object",
          required: ["path", "key", "code", "message"],
          properties: {
            path: { type: "string", description: "Relative path of the endpoint" },
            key: { type: "string", enum: Object.keys(ERROR_STATUS) },
            code: { type: "string", description: "Same value as key" },
            message: { type: "string" },
            details: {},
          },
          examples: (Object.keys(ERROR_STATUS) as ApiErrorKey[]).slice(0, 1).map((k) => ({ path: "/flows", key: k, code: k, message: DEFAULT_MESSAGES[k], details: null })),
        },
        AccessToken: {
          type: "object",
          required: ["accessToken", "tokenType", "expiresIn", "expiresAt"],
          properties: {
            accessToken: { type: "string" }, tokenType: { const: "Bearer" }, expiresIn: { type: "integer", const: 86400 },
            expiresAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
  };
}
