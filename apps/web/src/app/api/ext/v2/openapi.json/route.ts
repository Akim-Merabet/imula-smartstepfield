import { buildOpenApi } from "@/features/api-access/rest/openapi";

/** Document OpenAPI 3.1 de l'API v2 (public, sans authentification). */
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return Response.json(buildOpenApi(origin), { headers: { "Cache-Control": "public, max-age=300" } });
}
