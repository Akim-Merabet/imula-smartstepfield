import "server-only";
import { z } from "zod";
import type { Tables } from "@/lib/supabase/database.types";
import { ApiError, conflict, notFound } from "../errors";
import { apiRoute, assertReadable, dbCheck, list, one, page, type ApiContext } from "../handler";
import { managementProperties, MANAGEMENT_PROPERTIES, upper, withEmbeds } from "../mappers";
import { boolParam, enumListParam, likePattern, parseBody, parseDateFilters, parseEmbed, parsePaging, pathUuid, textParam, uuidParam } from "../params";
import { loadAttributes, loadFamilies, loadStatuses } from "./common";

export const PROJECT_EMBEDS = [MANAGEMENT_PROPERTIES, "CLIENT", "LABEL_FAMILY", "STATUS", "CUSTOM_ATTRIBUTES", "RESOURCES"] as const;
type ProjectEmbed = (typeof PROJECT_EMBEDS)[number];
const PROJECT_TYPES = ["project", "referential", "template", "pgac", "folder"] as const;
const CREATABLE_TYPES = ["project", "referential", "template"] as const;

type ProjectRow = Tables<"projects">;

function mapProject(p: ProjectRow) {
  return {
    uuidEntity: p.id,
    uuidOrganization: p.organization_id,
    uuidAccount: p.account_id,
    type: upper(p.type),
    name: p.designation,
    designation: p.designation,
    businessRef: p.business_ref,
    contractRef: p.contract_ref,
    code: p.code_project,
    locationLabel: p.location_label,
    description: p.description,
    clientId: p.client_id,
    labelFamilyId: p.family_id,
    customStatusId: p.custom_status_id,
    folderId: p.folder_id,
    internalCommand: p.internal_command,
    externalCommand: p.external_command,
    marketNumber: p.market_number,
    technicalDeal: p.technical_deal,
    keywords: p.keywords,
    businessDomain: p.business_domain,
    nationalProgram: p.national_program,
    complementRef1: p.complement_ref_1,
    complementRef2: p.complement_ref_2,
    pgacActivities: p.pgac_activities,
    exportLanguage1: upper(p.export_language_1),
    exportLanguage2: upper(p.export_language_2),
    internSupervised: p.is_intern_supervised,
    supervised: p.is_supervised,
    startedAt: p.start_date,
    endedAt: p.end_date,
    isPublished: p.published,
    isArchived: p.archived,
    isDeleted: !!p.deleted_at,
  };
}

async function present(ctx: ApiContext, rows: ProjectRow[], embed: Set<ProjectEmbed>) {
  const ids = rows.map((r) => r.id);
  const [statuses, families, attributes, clients, members, tablets] = await Promise.all([
    embed.has("STATUS") ? loadStatuses(ctx.db, rows.map((r) => r.custom_status_id)) : null,
    embed.has("LABEL_FAMILY") ? loadFamilies(ctx.db, rows.map((r) => r.family_id)) : null,
    embed.has("CUSTOM_ATTRIBUTES") ? loadAttributes(ctx.db, ids) : null,
    embed.has("CLIENT") && ids.length
      ? ctx.db.from("clients").select("id, name, reference, city, country").in("id", [...new Set(rows.map((r) => r.client_id))]).then(dbCheck)
      : null,
    embed.has("RESOURCES") && ids.length
      ? ctx.db.from("project_members").select("project_id, role, collaborator:collaborators!inner(id, kind, first_name, last_name, email)").in("project_id", ids).then(dbCheck)
      : null,
    embed.has("RESOURCES") && ids.length
      ? ctx.db.from("project_tablets").select("project_id, tablet:tablets!inner(id, name)").in("project_id", ids).then(dbCheck)
      : null,
  ]);
  return rows.map((p) => withEmbeds(mapProject(p), {
    managementProperties: embed.has(MANAGEMENT_PROPERTIES) ? managementProperties(p) : undefined,
    status: statuses ? statuses.get(p.custom_status_id ?? "") ?? null : undefined,
    labelFamily: families ? families.get(p.family_id) ?? null : undefined,
    customAttributes: attributes ? attributes.get(p.id) ?? [] : undefined,
    client: clients ? (() => {
      const c = clients.find((x) => x.id === p.client_id);
      return c ? { uuidEntity: c.id, name: c.name, reference: c.reference, city: c.city, country: c.country } : null;
    })() : undefined,
    resources: members && tablets ? {
      collaborators: members.filter((m) => m.project_id === p.id).map((m) => ({
        uuidEntity: m.collaborator.id, type: upper(m.collaborator.kind), firstName: m.collaborator.first_name,
        lastName: m.collaborator.last_name, email: m.collaborator.email, role: upper(m.role),
      })),
      tablets: tablets.filter((t) => t.project_id === p.id).map((t) => ({ uuidEntity: t.tablet.id, name: t.tablet.name })),
    } : undefined,
  }));
}

/** GET /projects — filtres : name, type, statusId, clientId, labelFamilyId, deletedOnly, createdAfterAt, modifiedAfterAt. */
export const listProjects = apiRoute({ level: "L1" }, async (ctx) => {
  const sp = ctx.url.searchParams;
  const paging = parsePaging(sp);
  const embed = parseEmbed(sp, PROJECT_EMBEDS);
  const dates = parseDateFilters(sp);
  const name = textParam(sp, "name");
  const types = enumListParam(sp, "type", PROJECT_TYPES);
  const statusId = uuidParam(sp, "statusId");
  const clientId = uuidParam(sp, "clientId");
  const familyId = uuidParam(sp, "labelFamilyId");
  const deletedOnly = boolParam(sp, "deletedOnly");
  const { items, total } = await page<ProjectRow>(paging, (from, to) => {
    let q = ctx.db.from("projects").select("*", { count: "exact" })
      .eq("organization_id", ctx.organizationId)
      .or(`account_id.eq.${ctx.accountId},published.eq.true`);
    q = deletedOnly ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
    if (name) q = q.ilike("designation", likePattern(name));
    if (types.length) q = q.in("type", types);
    if (statusId) q = q.eq("custom_status_id", statusId);
    if (clientId) q = q.eq("client_id", clientId);
    if (familyId) q = q.eq("family_id", familyId);
    if (dates.createdAfterAt) q = q.gt("created_at", dates.createdAfterAt);
    if (dates.modifiedAfterAt) q = q.gt("updated_at", dates.modifiedAfterAt);
    return q.order("created_at").order("id").range(from, to);
  });
  return list(await present(ctx, items, embed), total);
});

export async function loadProject(ctx: ApiContext, id: string, opts: { deleted?: boolean } = {}) {
  let q = ctx.db.from("projects").select("*").eq("id", id).eq("organization_id", ctx.organizationId);
  q = opts.deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
  const p = dbCheck(await q.maybeSingle());
  if (!p) throw notFound("Project", id);
  if (p.account_id !== ctx.accountId && !p.published) await assertReadable(ctx, { account_id: p.account_id, project_id: p.id });
  return p;
}

/** GET /projects/{projectId} — `isDeleted=true` pour cibler une entité supprimée. */
export const getProject = apiRoute<{ projectId: string }>({ level: "L1" }, async (ctx, params) => {
  const id = pathUuid(params.projectId, "projectId");
  const embed = parseEmbed(ctx.url.searchParams, PROJECT_EMBEDS);
  const p = await loadProject(ctx, id, { deleted: boolParam(ctx.url.searchParams, "isDeleted") });
  return one((await present(ctx, [p], embed))[0]);
});

const optText = z.string().trim().max(255).nullish();
export const projectCreateSchema = z.object({
  name: z.string().trim().min(3).max(255),
  type: z.enum(CREATABLE_TYPES.map((t) => t.toUpperCase()) as ["PROJECT", "REFERENTIAL", "TEMPLATE"]).default("PROJECT"),
  clientId: z.guid(),
  labelFamilyId: z.guid(),
  customStatusId: z.guid().nullish(),
  businessRef: optText,
  contractRef: optText,
  locationLabel: optText,
  description: z.string().trim().max(5000).nullish(),
  internalCommand: optText,
  externalCommand: optText,
  marketNumber: optText,
  technicalDeal: optText,
  keywords: optText,
  businessDomain: optText,
  nationalProgram: optText,
  complementRef1: optText,
  complementRef2: optText,
  startedAt: z.iso.date().nullish(),
  endedAt: z.iso.date().nullish(),
}).strict();

/** POST /projects — crée une entité dans le compte ciblé. */
export const createProject = apiRoute({ level: "L2" }, async (ctx) => {
  const body = await parseBody(ctx.req, projectCreateSchema);
  if (body.startedAt && body.endedAt && body.endedAt < body.startedAt) throw conflict("endedAt must be after startedAt");
  const [client, family, status] = await Promise.all([
    ctx.db.from("clients").select("id").eq("id", body.clientId).eq("account_id", ctx.accountId).maybeSingle().then(dbCheck),
    ctx.db.from("label_families").select("id").eq("id", body.labelFamilyId).eq("organization_id", ctx.organizationId)
      .eq("kind", "family").eq("nature", "project").is("project_id", null).is("deleted_at", null)
      .or(`account_id.is.null,account_id.eq.${ctx.accountId}`).maybeSingle().then(dbCheck),
    body.customStatusId
      ? ctx.db.from("custom_statuses").select("id").eq("id", body.customStatusId).eq("organization_id", ctx.organizationId)
        .eq("nature", "project").or(`account_id.is.null,account_id.eq.${ctx.accountId}`).maybeSingle().then(dbCheck)
      : ctx.db.from("custom_statuses").select("id").eq("organization_id", ctx.organizationId).eq("nature", "project")
        .eq("is_default", true).eq("active", true).or(`account_id.is.null,account_id.eq.${ctx.accountId}`)
        .order("account_id", { nullsFirst: false }).limit(1).maybeSingle().then(dbCheck),
  ]);
  if (!client) throw notFound("Client", body.clientId);
  if (!family) throw notFound("Label family", body.labelFamilyId);
  if (body.customStatusId && !status) throw notFound("Status", body.customStatusId);
  const inserted = dbCheck(await ctx.db.from("projects").insert({
    organization_id: ctx.organizationId,
    account_id: ctx.accountId,
    type: body.type.toLowerCase() as (typeof CREATABLE_TYPES)[number],
    designation: body.name,
    client_id: client.id,
    family_id: family.id,
    custom_status_id: status?.id ?? null,
    business_ref: body.businessRef ?? null,
    contract_ref: body.contractRef ?? null,
    location_label: body.locationLabel ?? null,
    description: body.description ?? null,
    internal_command: body.internalCommand ?? null,
    external_command: body.externalCommand ?? null,
    market_number: body.marketNumber ?? null,
    technical_deal: body.technicalDeal ?? null,
    keywords: body.keywords ?? null,
    business_domain: body.businessDomain ?? null,
    national_program: body.nationalProgram ?? null,
    complement_ref_1: body.complementRef1 ?? null,
    complement_ref_2: body.complementRef2 ?? null,
    start_date: body.startedAt ?? null,
    end_date: body.endedAt ?? null,
  }).select("*").single());
  if (!inserted) throw new ApiError("INTERNAL-ERROR");
  await ctx.db.from("project_status_history").insert({
    project_id: inserted.id, from_status_id: null, to_status_id: inserted.custom_status_id, source: "api",
  });
  return one((await present(ctx, [inserted], new Set()))[0], 201);
});
