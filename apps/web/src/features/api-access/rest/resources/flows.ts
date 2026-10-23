import "server-only";
import { z } from "zod";
import { creatableFlowTypes } from "@/features/flows/meta";
import type { Enums, Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
import { ApiError, conflict, fromDbError, noRight, notFound } from "../errors";
import { accountScopeFilter, apiRoute, assertReadable, assertWritable, dbCheck, list, one, page, type ApiContext, type Db } from "../handler";
import { managementProperties, MANAGEMENT_PROPERTIES, upper, withEmbeds } from "../mappers";
import { boolParam, enumListParam, likePattern, parseBody, parseDateFilters, parseEmbed, parsePaging, pathUuid, textParam, uuidParam } from "../params";
import { firstMissing, loadAttributes, loadFamilies, loadPeople, loadStatuses } from "./common";

export const FLOW_EMBEDS = [MANAGEMENT_PROPERTIES, "LOCATION", "PLANNING", "ASSIGNMENT", "STATUS", "LABEL_FAMILY", "CUSTOM_ATTRIBUTES", "PROJECT"] as const;
type FlowEmbed = (typeof FLOW_EMBEDS)[number];
type FlowType = Enums<"flow_type">;
const FLOW_TYPES: readonly FlowType[] = ["specific", "generic", "group", "flow_form", "template", "referential",
  "referential_generic", "group_referential", "referential_intervention", "local_referential"];
export const MAX_BULK = 100;

type FlowRow = Tables<"flows">;

function mapFlow(f: FlowRow) {
  return {
    uuidEntity: f.id,
    uuidOrganization: f.organization_id,
    uuidAccount: f.account_id,
    projectId: f.project_id,
    type: upper(f.flow_type),
    name: f.name,
    description: f.description,
    refInt: f.ref_int,
    refExt: f.ref_ext,
    customStatusId: f.custom_status_id,
    projectLabelFamilyId: f.family_id,
    categoryId: f.category_id,
    unlocked: f.unlocked,
    origin: upper(f.origin),
    color: f.bar_color,
    modifiedAt: f.updated_at,
    isDeleted: !!f.deleted_at,
  };
}

async function present(ctx: ApiContext, rows: FlowRow[], embed: Set<FlowEmbed>) {
  const ids = rows.map((r) => r.id);
  const assignees = embed.has("ASSIGNMENT") && ids.length
    ? dbCheck(await ctx.db.from("flow_assignees").select("flow_id, collaborator_id").in("flow_id", ids)) ?? []
    : [];
  const tabletIds = embed.has("ASSIGNMENT") ? rows.flatMap((r) => [r.tablet_1_id, r.tablet_2_id, r.tablet_3_id]).filter(Boolean) as string[] : [];
  const [statuses, families, attributes, people, tablets, projects] = await Promise.all([
    embed.has("STATUS") ? loadStatuses(ctx.db, rows.map((r) => r.custom_status_id)) : null,
    embed.has("LABEL_FAMILY") ? loadFamilies(ctx.db, rows.flatMap((r) => [r.family_id, r.category_id])) : null,
    embed.has("CUSTOM_ATTRIBUTES") ? loadAttributes(ctx.db, ids) : null,
    embed.has("ASSIGNMENT") ? loadPeople(ctx.db, [...rows.map((r) => r.reporter_id), ...assignees.map((a) => a.collaborator_id)]) : null,
    tabletIds.length ? ctx.db.from("tablets").select("id, name").in("id", [...new Set(tabletIds)]).then(dbCheck) : null,
    embed.has("PROJECT") && ids.length
      ? ctx.db.from("projects").select("id, designation, type").in("id", [...new Set(rows.map((r) => r.project_id))]).then(dbCheck)
      : null,
  ]);
  const tablet = (id: string | null) => {
    const t = id ? tablets?.find((x) => x.id === id) : null;
    return t ? { uuidEntity: t.id, name: t.name } : null;
  };
  return rows.map((f) => withEmbeds(mapFlow(f), {
    managementProperties: embed.has(MANAGEMENT_PROPERTIES) ? managementProperties(f) : undefined,
    location: embed.has("LOCATION") ? {
      locationActivated: f.location_activated, locationSite: f.location_site, locationArea: f.location_area,
      locationLocal: f.location_local, elementarySystem: f.elementary_system, functionalMarker: f.functional_marker,
      technicalObject: f.technical_object_label, technicalObjectId: f.technical_object_id,
    } : undefined,
    planning: embed.has("PLANNING") ? {
      startedAt: f.start_date, finishedAt: f.finish_date,
      estimatedStartedAt: f.estimated_start_date, estimatedFinishedAt: f.estimated_end_date,
      achievedStartedAt: f.achieved_start_date, achievedFinishedAt: f.achieved_end_date,
    } : undefined,
    assignment: people ? {
      reporterId: f.reporter_id,
      reporter: f.reporter_id ? people.get(f.reporter_id) ?? null : null,
      assignees: assignees.filter((a) => a.flow_id === f.id).map((a) => people.get(a.collaborator_id)).filter(Boolean),
      actor1Id: f.tablet_1_id, actor1: tablet(f.tablet_1_id),
      actor2Id: f.tablet_2_id, actor2: tablet(f.tablet_2_id),
      actor3Id: f.tablet_3_id, actor3: tablet(f.tablet_3_id),
    } : undefined,
    status: statuses ? statuses.get(f.custom_status_id ?? "") ?? null : undefined,
    labelFamily: families ? families.get(f.family_id ?? "") ?? null : undefined,
    category: families ? families.get(f.category_id ?? "") ?? null : undefined,
    customAttributes: attributes ? attributes.get(f.id) ?? [] : undefined,
    project: projects ? (() => {
      const p = projects.find((x) => x.id === f.project_id);
      return p ? { uuidEntity: p.id, name: p.designation, type: upper(p.type) } : null;
    })() : undefined,
  }));
}

// ===== LECTURE ===================================================================

/** GET /flows — filtres : name, projectId, statusId, type, refInt (n° chrono), refExt, labelFamilyId, deletedOnly, dates. */
export const listFlows = apiRoute({ level: "L1" }, async (ctx) => {
  const sp = ctx.url.searchParams;
  const paging = parsePaging(sp);
  const embed = parseEmbed(sp, FLOW_EMBEDS);
  const dates = parseDateFilters(sp);
  const name = textParam(sp, "name");
  const projectId = uuidParam(sp, "projectId");
  const statusIds = (sp.get("statusId") ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => pathUuid(s, "statusId"));
  const types = enumListParam(sp, "type", FLOW_TYPES);
  const refInt = textParam(sp, "refInt");
  const refExt = textParam(sp, "refExt");
  const familyId = uuidParam(sp, "labelFamilyId");
  const deletedOnly = boolParam(sp, "deletedOnly");
  const scope = await accountScopeFilter(ctx);
  const { items, total } = await page<FlowRow>(paging, (from, to) => {
    let q = ctx.db.from("flows").select("*", { count: "exact" }).eq("organization_id", ctx.organizationId).or(scope);
    q = deletedOnly ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
    if (name) q = q.ilike("name", likePattern(name));
    if (projectId) q = q.eq("project_id", projectId);
    if (statusIds.length) q = q.in("custom_status_id", statusIds);
    if (types.length) q = q.in("flow_type", types);
    if (refInt) q = q.eq("ref_int", refInt);
    if (refExt) q = q.eq("ref_ext", refExt);
    if (familyId) q = q.eq("family_id", familyId);
    if (dates.createdAfterAt) q = q.gt("created_at", dates.createdAfterAt);
    if (dates.modifiedAfterAt) q = q.gt("updated_at", dates.modifiedAfterAt);
    return q.order("created_at").order("id").range(from, to);
  });
  return list(await present(ctx, items, embed), total);
});

export async function loadFlow(ctx: ApiContext, id: string, opts: { deleted?: boolean; write?: boolean } = {}) {
  let q = ctx.db.from("flows").select("*").eq("id", id).eq("organization_id", ctx.organizationId);
  q = opts.deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
  const f = dbCheck(await q.maybeSingle());
  if (!f) throw notFound("Flow", id);
  if (opts.write) assertWritable(ctx, f);
  else await assertReadable(ctx, f);
  return f;
}

/** GET /flows/{flowId} — `isDeleted=true` pour cibler un flow supprimé. */
export const getFlow = apiRoute<{ flowId: string }>({ level: "L1" }, async (ctx, params) => {
  const id = pathUuid(params.flowId, "flowId");
  const embed = parseEmbed(ctx.url.searchParams, FLOW_EMBEDS);
  const f = await loadFlow(ctx, id, { deleted: boolParam(ctx.url.searchParams, "isDeleted") });
  return one((await present(ctx, [f], embed))[0]);
});

/** GET /flows/{flowId}/history-status-changes — historique des changements de statut. */
export const flowStatusHistory = apiRoute<{ flowId: string }>({ level: "L1" }, async (ctx, params) => {
  const id = pathUuid(params.flowId, "flowId");
  const paging = parsePaging(ctx.url.searchParams);
  await loadFlow(ctx, id);
  const { items, total } = await page(paging, (from, to) => ctx.db.from("flow_status_history")
    .select("id, from_status_id, to_status_id, comment, actor_id, source, occurred_at", { count: "exact" })
    .eq("flow_id", id).order("occurred_at").order("id").range(from, to));
  const [statuses, people] = await Promise.all([
    loadStatuses(ctx.db, items.flatMap((h) => [h.from_status_id, h.to_status_id])),
    loadPeople(ctx.db, items.map((h) => h.actor_id)),
  ]);
  return list(items.map((h) => ({
    changedAt: h.occurred_at,
    previousStatus: h.from_status_id ? statuses.get(h.from_status_id) ?? null : null,
    newStatus: h.to_status_id ? statuses.get(h.to_status_id) ?? null : null,
    comment: h.comment,
    author: h.actor_id ? people.get(h.actor_id) ?? null : null,
    platform: h.source === "mobile" ? "MOBILEAPP" : h.source === "api" ? "API" : "WEBAPP",
  })), total);
});

// ===== ÉCRITURE ==================================================================

const nText = z.string().trim().max(255).nullish();
const nDate = z.iso.datetime({ offset: true }).nullish();
const attributeValuesSchema = z.array(z.object({
  identifier: z.guid(),
  listValues: z.array(z.string().max(5000)).max(200),
}).strict()).max(200);

const flowFields = {
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).nullish(),
  refInt: nText,
  refExt: nText,
  customStatusId: z.guid().nullish(),
  projectLabelFamilyId: z.guid().nullish(),
  categoryId: z.guid().nullish(),
  locationActivated: z.boolean().optional(),
  locationSite: nText,
  locationArea: nText,
  locationLocal: nText,
  elementarySystem: nText,
  functionalMarker: nText,
  technicalObject: nText,
  startedAt: nDate,
  finishedAt: nDate,
  estimatedStartedAt: nDate,
  estimatedFinishedAt: nDate,
  achievedStartedAt: nDate,
  achievedFinishedAt: nDate,
  reporterId: z.guid().nullish(),
  assigneeIds: z.array(z.guid()).max(50).optional(),
  actor1Id: z.guid().nullish(),
  actor2Id: z.guid().nullish(),
  actor3Id: z.guid().nullish(),
  listCustomAttributesValues: attributeValuesSchema.optional(),
};

export const flowCreateSchema = z.object({
  projectId: z.guid(),
  type: z.string().toUpperCase().pipe(z.enum(FLOW_TYPES.map((t) => t.toUpperCase()) as [string, ...string[]])).default("SPECIFIC"),
  ...flowFields,
}).strict();
export const flowPutSchema = z.object(flowFields).strict();
export const flowPatchSchema = z.object(flowFields).partial().strict();
export const flowBulkCreateSchema = z.object({ data: z.array(flowCreateSchema).min(1).max(MAX_BULK) }).strict();
export const flowBulkUpdateSchema = z.object({
  data: z.array(flowPatchSchema.extend({ uuidEntity: z.guid() })).min(1).max(MAX_BULK),
}).strict();
export const attributesBulkUpdateSchema = z.object({
  data: z.array(z.object({ flowId: z.guid(), listCustomAttributesValues: attributeValuesSchema.min(1) }).strict()).min(1).max(MAX_BULK),
}).strict();

type FlowFieldsInput = Partial<z.output<z.ZodObject<typeof flowFields>>>;

const COLUMN_OF = {
  name: "name", description: "description", refInt: "ref_int", refExt: "ref_ext", customStatusId: "custom_status_id",
  projectLabelFamilyId: "family_id", categoryId: "category_id", locationActivated: "location_activated",
  locationSite: "location_site", locationArea: "location_area", locationLocal: "location_local",
  elementarySystem: "elementary_system", functionalMarker: "functional_marker", technicalObject: "technical_object_label",
  startedAt: "start_date", finishedAt: "finish_date", estimatedStartedAt: "estimated_start_date",
  estimatedFinishedAt: "estimated_end_date", achievedStartedAt: "achieved_start_date", achievedFinishedAt: "achieved_end_date",
  reporterId: "reporter_id", actor1Id: "tablet_1_id", actor2Id: "tablet_2_id", actor3Id: "tablet_3_id",
} as const satisfies Partial<Record<keyof FlowFieldsInput, keyof TablesUpdate<"flows">>>;

/** Champs API → colonnes ; `replace` (PUT) remet à null les champs absents. */
function toColumns(input: FlowFieldsInput, replace: boolean): TablesUpdate<"flows"> {
  const out: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(COLUMN_OF)) {
    const v = (input as Record<string, unknown>)[key];
    if (v !== undefined) out[col] = v;
    else if (replace) out[col] = col === "location_activated" ? false : null;
  }
  return out as TablesUpdate<"flows">;
}

function checkDates(input: FlowFieldsInput, before?: FlowRow, index?: number) {
  const pairs: [keyof FlowFieldsInput, keyof FlowFieldsInput, keyof FlowRow, keyof FlowRow][] = [
    ["startedAt", "finishedAt", "start_date", "finish_date"],
    ["estimatedStartedAt", "estimatedFinishedAt", "estimated_start_date", "estimated_end_date"],
    ["achievedStartedAt", "achievedFinishedAt", "achieved_start_date", "achieved_end_date"],
  ];
  for (const [a, b, ca, cb] of pairs) {
    const s = (input[a] !== undefined ? input[a] : before?.[ca]) as string | null | undefined;
    const e = (input[b] !== undefined ? input[b] : before?.[cb]) as string | null | undefined;
    if (s && e && new Date(s) > new Date(e)) throw conflict(`'${a}' must be before '${b}'`, { index, field: b });
  }
}

/** Valide en une passe toutes les références (statuts, familles, collaborateurs, tablettes, attributs) dans le périmètre. */
async function validateReferences(ctx: ApiContext, inputs: FlowFieldsInput[]) {
  const ids = (pick: (i: FlowFieldsInput) => (string | null | undefined)[]) => [...new Set(inputs.flatMap(pick).filter(Boolean) as string[])];
  const statusIds = ids((i) => [i.customStatusId]);
  const familyIds = ids((i) => [i.projectLabelFamilyId, i.categoryId]);
  const peopleIds = ids((i) => [i.reporterId, ...(i.assigneeIds ?? [])]);
  const tabletIds = ids((i) => [i.actor1Id, i.actor2Id, i.actor3Id]);
  const attrIds = ids((i) => (i.listCustomAttributesValues ?? []).map((a) => a.identifier));
  const shared = `account_id.is.null,account_id.eq.${ctx.accountId}`;
  const [statuses, families, people, tablets, attrs] = await Promise.all([
    statusIds.length ? ctx.db.from("custom_statuses").select("id").in("id", statusIds).eq("organization_id", ctx.organizationId)
      .eq("nature", "flow").or(shared).then(dbCheck) : [],
    familyIds.length ? ctx.db.from("label_families").select("id, kind").in("id", familyIds).eq("organization_id", ctx.organizationId)
      .is("deleted_at", null).or(shared).then(dbCheck) : [],
    peopleIds.length ? ctx.db.from("collaborators").select("id").in("id", peopleIds).eq("organization_id", ctx.organizationId)
      .eq("account_id", ctx.accountId).is("deleted_at", null).then(dbCheck) : [],
    tabletIds.length ? ctx.db.from("tablets").select("id").in("id", tabletIds).eq("account_id", ctx.accountId).is("deleted_at", null).then(dbCheck) : [],
    attrIds.length ? ctx.db.from("custom_fields").select("id, type, choices").in("id", attrIds).eq("account_id", ctx.accountId)
      .eq("nature", "flow").is("deleted_at", null).then(dbCheck) : [],
  ]);
  const ok = (rows: { id: string }[] | null) => (rows ?? []).map((r) => r.id);
  for (const [kind, wanted, found] of [
    ["Status", statusIds, ok(statuses)], ["Label family", familyIds, ok(families)], ["Collaborator", peopleIds, ok(people)],
    ["Tablet", tabletIds, ok(tablets)], ["Attribute", attrIds, ok(attrs)],
  ] as const) {
    const missing = firstMissing(wanted, found);
    if (missing) throw notFound(kind, missing);
  }
  const familyKind = new Map((families ?? []).map((f) => [f.id, f.kind]));
  inputs.forEach((i, index) => {
    if (i.projectLabelFamilyId && familyKind.get(i.projectLabelFamilyId) !== "family") throw conflict("'projectLabelFamilyId' must be a family", { index });
    if (i.categoryId && familyKind.get(i.categoryId) !== "category") throw conflict("'categoryId' must be a category", { index });
  });
  return new Map((attrs ?? []).map((a) => [a.id, a]));
}

/** N° chrono : règle de référence du compte (nature flow, champ ref_int) + compteur. */
async function generateRefInt(db: Db, accountId: string, projectId: string): Promise<string | null> {
  const { data: rule } = await db.from("reference_rules").select("id, nomenclature, counter_type, counter_format, start_value")
    .eq("account_id", accountId).eq("nature", "flow").eq("field", "ref_int").eq("active", true).limit(1).maybeSingle();
  if (!rule) return null;
  const scope = rule.counter_type === "local" ? projectId : null;
  let q = db.from("reference_counters").select("id, current_value").eq("reference_rule_id", rule.id);
  q = scope ? q.eq("project_id", scope) : q.is("project_id", null);
  const { data: counter } = await q.maybeSingle();
  const value = counter ? counter.current_value + 1 : rule.start_value;
  const res = counter
    ? await db.from("reference_counters").update({ current_value: value }).eq("id", counter.id).eq("current_value", counter.current_value)
    : await db.from("reference_counters").insert({ reference_rule_id: rule.id, project_id: scope, current_value: value });
  if (res.error) return null;
  const chrono = String(value).padStart(rule.counter_format, "0");
  return rule.nomenclature.includes("{chrono}") ? rule.nomenclature.replace("{chrono}", chrono) : `${rule.nomenclature}${chrono}`;
}

type AttrDef = { id: string; type: Enums<"custom_field_type">; choices: string[] };

function attributeRows(ctx: ApiContext, flowId: string, values: { identifier: string; listValues: string[] }[], defs: Map<string, AttrDef>, index?: number) {
  return values.map((v) => {
    const def = defs.get(v.identifier)!;
    const multi = def.type === "multiselect" || def.type === "file" || def.type === "image";
    if (!multi && v.listValues.length > 1) throw conflict(`Attribute having identifier '${v.identifier}' accepts a single value`, { index });
    if ((def.type === "select" || def.type === "multiselect") && def.choices.length) {
      const bad = v.listValues.find((x) => x !== "" && !def.choices.includes(x));
      if (bad !== undefined) throw conflict(`Value '${bad}' is not an allowed choice of attribute '${v.identifier}'`, { index });
    }
    const vals = v.listValues.filter((x) => x !== "");
    return {
      custom_field_id: v.identifier, object_id: flowId, account_id: ctx.accountId, business_class: "flow" as const,
      value_text: vals.length ? vals.join(";") : null, value_json: multi ? vals : null, updated_at: new Date().toISOString(),
    };
  });
}

async function markApiSource(db: Db, flowIds: string[], since: string) {
  if (!flowIds.length) return;
  await Promise.all([
    db.from("flow_status_history").update({ source: "api" }).in("flow_id", flowIds).gte("occurred_at", since),
    db.from("flow_events").update({ source: "api" }).in("flow_id", flowIds).gte("occurred_at", since),
  ]);
}

type CreateInput = z.output<typeof flowCreateSchema>;

async function createFlows(ctx: ApiContext, inputs: CreateInput[]) {
  const since = new Date().toISOString();
  const projectIds = [...new Set(inputs.map((i) => i.projectId))];
  const projects = dbCheck(await ctx.db.from("projects").select("id, type, account_id, organization_id")
    .in("id", projectIds).eq("organization_id", ctx.organizationId).is("deleted_at", null)) ?? [];
  const byId = new Map(projects.map((p) => [p.id, p]));
  inputs.forEach((i, index) => {
    const p = byId.get(i.projectId);
    if (!p) throw notFound("Project", i.projectId);
    if (p.account_id !== ctx.accountId) throw noRight("Flows can only be created in projects of the target account");
    const type = i.type.toLowerCase() as FlowType;
    if (!creatableFlowTypes(p.type).includes(type)) {
      throw conflict(`Flow type '${i.type}' cannot be created in a project of type '${p.type.toUpperCase()}'`, { index, allowed: creatableFlowTypes(p.type).map((t) => t.toUpperCase()) });
    }
    checkDates(i, undefined, index);
  });
  const defs = await validateReferences(ctx, inputs);

  const created: FlowRow[] = [];
  try {
    for (const [index, i] of inputs.entries()) {
      const refInt = i.refInt ?? (await generateRefInt(ctx.db, ctx.accountId, i.projectId));
      const row: TablesInsert<"flows"> = {
        ...(toColumns(i, false) as TablesInsert<"flows">),
        name: i.name,
        ref_int: refInt,
        flow_type: i.type.toLowerCase() as FlowType,
        project_id: i.projectId,
        organization_id: ctx.organizationId,
        account_id: ctx.accountId,
      };
      const { data, error } = await ctx.db.from("flows").insert(row).select("*").single();
      if (error || !data) throw Object.assign(fromDbError(error), { index });
      created.push(data);
      if (i.assigneeIds?.length) {
        dbCheck(await ctx.db.from("flow_assignees").insert([...new Set(i.assigneeIds)].map((collaborator_id) => ({ flow_id: data.id, collaborator_id }))));
      }
      if (i.listCustomAttributesValues?.length) {
        dbCheck(await ctx.db.from("custom_field_values").upsert(attributeRows(ctx, data.id, i.listCustomAttributesValues, defs, index),
          { onConflict: "custom_field_id,object_id" }));
      }
    }
  } catch (e) {
    // Tout ou rien : suppression physique des flows déjà créés par cette requête.
    if (created.length) await ctx.db.from("flows").delete().in("id", created.map((f) => f.id));
    throw e;
  }
  await markApiSource(ctx.db, created.map((f) => f.id), since);
  return created;
}

/** POST /flows — crée un flow dans une entité du compte ciblé. */
export const createFlow = apiRoute({ level: "L2" }, async (ctx) => {
  const body = await parseBody(ctx.req, flowCreateSchema);
  const [flow] = await createFlows(ctx, [body]);
  return one((await present(ctx, [flow], new Set(["ASSIGNMENT", "CUSTOM_ATTRIBUTES"])))[0], 201);
});

/** POST /flows/bulk/create — création en masse (≤ 100), tout ou rien. */
export const bulkCreateFlows = apiRoute({ level: "L3" }, async (ctx) => {
  const body = await parseBody(ctx.req, flowBulkCreateSchema);
  const flows = await createFlows(ctx, body.data);
  return one(flows.map((f) => ({ uuidEntity: f.id, refInt: f.ref_int, name: f.name, projectId: f.project_id })), 201);
});

async function updateFlows(ctx: ApiContext, updates: { id: string; input: FlowFieldsInput; replace: boolean }[]) {
  const since = new Date().toISOString();
  const ids = [...new Set(updates.map((u) => u.id))];
  if (ids.length !== updates.length) throw conflict("The same flow appears several times in the request");
  const rows = dbCheck(await ctx.db.from("flows").select("*").in("id", ids).eq("organization_id", ctx.organizationId).is("deleted_at", null)) ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  updates.forEach((u, index) => {
    const before = byId.get(u.id);
    if (!before) throw notFound("Flow", u.id);
    assertWritable(ctx, before);
    checkDates(u.input, u.replace ? undefined : before, index);
  });
  const defs = await validateReferences(ctx, updates.map((u) => u.input));
  for (const [index, u] of updates.entries()) {
    const patch = toColumns(u.input, u.replace);
    if (Object.keys(patch).length) {
      const { error } = await ctx.db.from("flows").update(patch).eq("id", u.id).eq("organization_id", ctx.organizationId);
      if (error) throw Object.assign(fromDbError(error), { index });
    }
    if (u.input.assigneeIds !== undefined || u.replace) {
      dbCheck(await ctx.db.from("flow_assignees").delete().eq("flow_id", u.id));
      const assignees = [...new Set(u.input.assigneeIds ?? [])];
      if (assignees.length) dbCheck(await ctx.db.from("flow_assignees").insert(assignees.map((collaborator_id) => ({ flow_id: u.id, collaborator_id }))));
    }
    if (u.input.listCustomAttributesValues?.length) {
      dbCheck(await ctx.db.from("custom_field_values").upsert(attributeRows(ctx, u.id, u.input.listCustomAttributesValues, defs, index),
        { onConflict: "custom_field_id,object_id" }));
    }
  }
  await markApiSource(ctx.db, ids, since);
  return dbCheck(await ctx.db.from("flows").select("*").in("id", ids).order("created_at")) ?? [];
}

/** PUT /flows/{flowId} — remplacement des propriétés éditables (champs absents remis à vide). */
export const putFlow = apiRoute<{ flowId: string }>({ level: "L2" }, async (ctx, params) => {
  const id = pathUuid(params.flowId, "flowId");
  const body = await parseBody(ctx.req, flowPutSchema);
  const [flow] = await updateFlows(ctx, [{ id, input: body, replace: true }]);
  return one((await present(ctx, [flow], new Set(["ASSIGNMENT"])))[0]);
});

/** PATCH /flows/{flowId} — mise à jour partielle. */
export const patchFlow = apiRoute<{ flowId: string }>({ level: "L2" }, async (ctx, params) => {
  const id = pathUuid(params.flowId, "flowId");
  const body = await parseBody(ctx.req, flowPatchSchema);
  const [flow] = await updateFlows(ctx, [{ id, input: body, replace: false }]);
  return one((await present(ctx, [flow], new Set(["ASSIGNMENT"])))[0]);
});

/** PATCH /flows/bulk/update — mise à jour partielle en masse (≤ 100). */
export const bulkUpdateFlows = apiRoute({ level: "L3" }, async (ctx) => {
  const body = await parseBody(ctx.req, flowBulkUpdateSchema);
  const flows = await updateFlows(ctx, body.data.map(({ uuidEntity, ...input }) => ({ id: uuidEntity, input, replace: false })));
  return one(flows.map(mapFlow));
});

/** PATCH /flows/custom-attributes/bulk-update — valeurs d'attributs de plusieurs flows, appliquées seulement si tout est valide. */
export const bulkUpdateFlowAttributes = apiRoute({ level: "L3" }, async (ctx) => {
  const body = await parseBody(ctx.req, attributesBulkUpdateSchema);
  const ids = [...new Set(body.data.map((d) => d.flowId))];
  const flows = dbCheck(await ctx.db.from("flows").select("id, account_id, organization_id").in("id", ids)
    .eq("organization_id", ctx.organizationId).is("deleted_at", null)) ?? [];
  const byId = new Map(flows.map((f) => [f.id, f]));
  const attrIds = [...new Set(body.data.flatMap((d) => d.listCustomAttributesValues.map((a) => a.identifier)))];
  const attrs = dbCheck(await ctx.db.from("custom_fields").select("id, type, choices, account_id")
    .in("id", attrIds).eq("nature", "flow").is("deleted_at", null)) ?? [];
  const defs = new Map(attrs.map((a) => [a.id, a]));
  const rows = body.data.flatMap((d, index) => {
    const flow = byId.get(d.flowId);
    if (!flow) throw notFound("Flow", d.flowId);
    assertWritable(ctx, flow);
    for (const a of d.listCustomAttributesValues) {
      const def = defs.get(a.identifier);
      if (!def || def.account_id !== flow.account_id) {
        throw new ApiError("OBJECT-NOT-FOUND",
          `Flow having identifier '${d.flowId}' | Attribute having identifier '${a.identifier}' | Attribute does not belong to the flow's account`,
          { index, flowId: d.flowId, identifier: a.identifier, reason: "ATTRIBUTE_NOT_IN_SAME_ACCOUNT" });
      }
    }
    return attributeRows(ctx, d.flowId, d.listCustomAttributesValues, defs, index);
  });
  dbCheck(await ctx.db.from("custom_field_values").upsert(rows, { onConflict: "custom_field_id,object_id" }));
  return one({ updatedFlows: ids.length, updatedValues: rows.length });
});
