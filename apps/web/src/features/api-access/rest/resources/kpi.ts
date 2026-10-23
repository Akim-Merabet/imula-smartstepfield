import "server-only";
import { accountScopeFilter, apiRoute, dbCheck, one } from "../handler";
import { pathUuid, uuidParam } from "../params";
import { loadProject } from "./projects";

type CountRes = { count: number | null; error: { code?: string; message?: string } | null };
const n = (res: CountRes) => dbCheck({ data: res.count ?? 0, error: res.error });

/** GET /kpi/projects — nombre d'entités du compte, par type. */
export const kpiProjects = apiRoute({ level: "L1" }, async (ctx) => {
  const rows = dbCheck(await ctx.db.from("projects").select("type").eq("organization_id", ctx.organizationId)
    .eq("account_id", ctx.accountId).is("deleted_at", null)) ?? [];
  const byType: Record<string, number> = {};
  for (const r of rows) byType[r.type.toUpperCase()] = (byType[r.type.toUpperCase()] ?? 0) + 1;
  return one({ total: rows.length, byType });
});

/** GET /kpi/flows — nombre de flows (filtre optionnel projectId), par type et par catégorie de statut. */
export const kpiFlows = apiRoute({ level: "L1" }, async (ctx) => {
  const projectId = uuidParam(ctx.url.searchParams, "projectId");
  const scope = await accountScopeFilter(ctx);
  let q = ctx.db.from("flows").select("flow_type, status:custom_statuses(category)").eq("organization_id", ctx.organizationId)
    .or(scope).is("deleted_at", null);
  if (projectId) q = q.eq("project_id", projectId);
  const rows = dbCheck(await q.limit(50_000)) ?? [];
  const byType: Record<string, number> = {};
  const byStatusCategory: Record<string, number> = {};
  for (const r of rows) {
    const t = r.flow_type.toUpperCase();
    byType[t] = (byType[t] ?? 0) + 1;
    const c = r.status?.category?.toUpperCase() ?? "NONE";
    byStatusCategory[c] = (byStatusCategory[c] ?? 0) + 1;
  }
  return one({ total: rows.length, byType, byStatusCategory });
});

/** GET /kpi/users — utilisateurs et opérateurs du compte (collaborateurs = utilisateurs + opérateurs). */
export const kpiUsers = apiRoute({ level: "L1" }, async (ctx) => {
  const base = () => ctx.db.from("collaborators").select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.organizationId).eq("account_id", ctx.accountId).is("deleted_at", null);
  const [users, operators, activeUsers, tablets] = await Promise.all([
    base().eq("kind", "user"), base().eq("kind", "operator"), base().eq("kind", "user").eq("status", "active"),
    ctx.db.from("tablets").select("id", { count: "exact", head: true }).eq("account_id", ctx.accountId).is("deleted_at", null),
  ]);
  return one({ users: n(users), activeUsers: n(activeUsers), operators: n(operators), collaborators: n(users) + n(operators), tablets: n(tablets) });
});

/** GET /kpi/tablets — profils tablettes du compte, par statut matériel. */
export const kpiTablets = apiRoute({ level: "L1" }, async (ctx) => {
  const rows = dbCheck(await ctx.db.from("tablets").select("status").eq("account_id", ctx.accountId).is("deleted_at", null)) ?? [];
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status.toUpperCase()] = (byStatus[r.status.toUpperCase()] ?? 0) + 1;
  return one({ total: rows.length, byStatus });
});

/** GET /kpi-progression/{projectId}/flows — pourcentage de flows terminés (catégorie de statut DONE) d'une entité. */
export const kpiProjectFlowProgress = apiRoute<{ projectId: string }>({ level: "L1" }, async (ctx, params) => {
  const id = pathUuid(params.projectId, "projectId");
  await loadProject(ctx, id);
  const rows = dbCheck(await ctx.db.from("flows").select("id, status:custom_statuses(category)").eq("project_id", id)
    .eq("organization_id", ctx.organizationId).is("deleted_at", null)) ?? [];
  const done = rows.filter((r) => r.status?.category === "done").length;
  return one({ projectId: id, total: rows.length, done, percentage: rows.length ? Math.round((done / rows.length) * 1000) / 10 : 0 });
});
