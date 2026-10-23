import "server-only";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import { apiOrgRoute, apiRoute, list, page } from "../handler";
import { CUSTOM_FIELD_TYPE_API, managementProperties, MANAGEMENT_PROPERTIES, upper, withEmbeds } from "../mappers";
import { boolParam, enumListParam, likePattern, parseDateFilters, parseEmbed, parsePaging, textParam, uuidParam } from "../params";

const FAMILY_NATURES: readonly Enums<"label_family_nature">[] = ["project", "flow", "document", "form", "risk", "equipment", "device",
  "team", "function", "legal", "skill", "contract", "technical_object", "activity_domain", "list", "hierarchy"];
const STATUS_NATURES = ["project", "flow", "form", "form_response", "technical_object", "multi_pr"] as const;
const ATTRIBUTE_NATURES = ["project", "flow", "phase", "step", "document", "technical_object"] as const;

// ===== Comptes (applicabilités) =====================================================
/**
 * GET|POST /label-applicabilities — comptes de l'organisation : tous pour une clé organisation,
 * le seul compte de la clé pour une clé compte.
 */
export const listApplicabilities = apiOrgRoute({ level: "L1" }, async (ctx) => {
  const paging = parsePaging(ctx.url.searchParams);
  const name = textParam(ctx.url.searchParams, "name");
  const { items, total } = await page<Tables<"accounts">>(paging, (from, to) => {
    let q = ctx.db.from("accounts").select("*", { count: "exact" }).eq("organization_id", ctx.organizationId);
    if (ctx.client.keyType === "account") q = q.eq("id", ctx.client.accountId!);
    if (name) q = q.ilike("name", likePattern(name));
    return q.order("created_at").order("id").range(from, to);
  });
  return list(items.map((a) => ({
    uuidEntity: a.id, uuidOrganization: a.organization_id, name: a.name, fullName: a.full_name,
    timeZone: a.time_zone, modificationDate: a.updated_at,
  })), total);
});

// ===== Familles ======================================================================
/** GET /label-families — filtres : nature, kind (FAMILY/CATEGORY), relativeNature (PARENT/CHILD), parentId, includeInactive. */
export const listLabelFamilies = apiRoute({ level: "L1" }, async (ctx) => {
  const sp = ctx.url.searchParams;
  const paging = parsePaging(sp);
  const embed = parseEmbed(sp, [MANAGEMENT_PROPERTIES] as const);
  const dates = parseDateFilters(sp);
  const natures = enumListParam(sp, "nature", FAMILY_NATURES);
  const kinds = enumListParam(sp, "kind", ["family", "category"] as const);
  const relative = enumListParam(sp, "relativeNature", ["parent", "child"] as const);
  const parentId = uuidParam(sp, "parentId");
  const includeInactive = boolParam(sp, "includeInactive");
  const { items, total } = await page<Tables<"label_families">>(paging, (from, to) => {
    let q = ctx.db.from("label_families").select("*", { count: "exact" }).eq("organization_id", ctx.organizationId)
      .or(`account_id.is.null,account_id.eq.${ctx.accountId}`).is("project_id", null).is("deleted_at", null);
    if (natures.length) q = q.in("nature", natures);
    if (kinds.length) q = q.in("kind", kinds);
    if (relative.length) q = q.in("relative_nature", relative);
    if (parentId) q = q.eq("parent_id", parentId);
    if (!includeInactive) q = q.eq("active", true);
    if (dates.createdAfterAt) q = q.gt("created_at", dates.createdAfterAt);
    if (dates.modifiedAfterAt) q = q.gt("updated_at", dates.modifiedAfterAt);
    return q.order("created_at").order("id").range(from, to);
  });
  return list(items.map((f) => withEmbeds({
    uuidEntity: f.id, uuidOrganization: f.organization_id, uuidAccount: f.account_id,
    createdAt: f.created_at, modifiedAt: f.updated_at,
    name: f.short_name, fullName: f.long_name, color: f.color, nature: upper(f.nature), kind: upper(f.kind),
    code: f.code, relativeNature: upper(f.relative_nature), parentId: f.parent_id, priority: f.priority,
    qualityReference: f.quality_reference, isActive: f.active,
  }, { managementProperties: embed.has(MANAGEMENT_PROPERTIES) ? managementProperties(f) : undefined })), total);
});

// ===== Dictionnaire : statuts ==========================================================
/** GET /dictionary/statuses — filtre : nature. */
export const listStatuses = apiRoute({ level: "L1" }, async (ctx) => {
  const sp = ctx.url.searchParams;
  const paging = parsePaging(sp);
  const natures = enumListParam(sp, "nature", STATUS_NATURES);
  const { items, total } = await page<Tables<"custom_statuses">>(paging, (from, to) => {
    let q = ctx.db.from("custom_statuses").select("*", { count: "exact" }).eq("organization_id", ctx.organizationId)
      .or(`account_id.is.null,account_id.eq.${ctx.accountId}`);
    if (natures.length) q = q.in("nature", natures);
    return q.order("nature").order("sort_order").order("created_at").order("id").range(from, to);
  });
  return list(items.map((s) => ({
    uuidEntity: s.id, uuidOrganization: s.organization_id, uuidAccount: s.account_id, nature: upper(s.nature),
    name: s.name, description: s.description, color: s.color, category: upper(s.category), linkType: upper(s.link_type),
    labelFamilyId: s.label_family_id, isDefault: s.is_default, isActive: s.active, order: s.sort_order,
  })), total);
});

// ===== Dictionnaire : attributs personnalisés ===========================================
/** GET /dictionary/custom-attributes — filtre : nature. */
export const listCustomAttributes = apiRoute({ level: "L1" }, async (ctx) => {
  const sp = ctx.url.searchParams;
  const paging = parsePaging(sp);
  const natures = enumListParam(sp, "nature", ATTRIBUTE_NATURES);
  const { items, total } = await page<Tables<"custom_fields">>(paging, (from, to) => {
    let q = ctx.db.from("custom_fields").select("*", { count: "exact" }).eq("account_id", ctx.accountId).is("deleted_at", null);
    if (natures.length) q = q.in("nature", natures);
    return q.order("created_at").order("id").range(from, to);
  });
  return list(items.map((f) => ({
    identifier: f.id, uuidEntity: f.id, uuidAccount: f.account_id, nature: upper(f.nature), name: f.name,
    type: CUSTOM_FIELD_TYPE_API[f.type] ?? upper(f.type), linkType: upper(f.link_type), labelFamilyId: f.label_family_id,
    choices: f.choices, defaultValue: f.default_value, description: f.description, required: f.required,
    readOnly: f.read_only, variableName: f.variable_name, isActive: f.active,
  })), total);
});

// ===== Carnet clients =====================================================================
/** GET /clients — filtres : name, reference, dates. */
export const listClients = apiRoute({ level: "L1" }, async (ctx) => {
  const sp = ctx.url.searchParams;
  const paging = parsePaging(sp);
  const dates = parseDateFilters(sp);
  const name = textParam(sp, "name");
  const reference = textParam(sp, "reference");
  const { items, total } = await page<Tables<"clients">>(paging, (from, to) => {
    let q = ctx.db.from("clients").select("*", { count: "exact" }).eq("account_id", ctx.accountId);
    if (name) q = q.ilike("name", likePattern(name));
    if (reference) q = q.eq("reference", reference);
    if (dates.createdAfterAt) q = q.gt("created_at", dates.createdAfterAt);
    if (dates.modifiedAfterAt) q = q.gt("updated_at", dates.modifiedAfterAt);
    return q.order("created_at").order("id").range(from, to);
  });
  return list(items.map((c) => ({
    uuidEntity: c.id, uuidAccount: c.account_id, uuidOrganization: ctx.organizationId, createdAt: c.created_at, modifiedAt: c.updated_at,
    reference: c.reference, name: c.name, nameComp: c.name_2, nameComp2: c.name_3, address: c.address, addressComp: c.address_comp,
    zipCode: c.zip_code, city: c.city, country: c.country, observation: c.observation,
  })), total);
});

// ===== Utilisateurs, opérateurs, profils tablettes ===========================================
const USER_TYPES = ["user", "operator", "device"] as const;

/** GET /users — filtres : type (USER, OPERATOR, DEVICE), status, email, name. Tri par date de création. */
export const listUsers = apiRoute({ level: "L1" }, async (ctx) => {
  const sp = ctx.url.searchParams;
  const paging = parsePaging(sp);
  const types = enumListParam(sp, "type", USER_TYPES);
  const wanted = new Set(types.length ? types : USER_TYPES);
  const status = textParam(sp, "status")?.toLowerCase() ?? null;
  const email = textParam(sp, "email");
  const name = textParam(sp, "name");
  const kinds = (["user", "operator"] as const).filter((k) => wanted.has(k));
  // Fusion de deux sources triées : on lit au plus offset+limit éléments de chacune.
  const window = { limit: Math.min(paging.offset + paging.limit, 10_000), offset: 0 };
  const [collabs, devices] = await Promise.all([
    kinds.length ? page<Tables<"collaborators">>(window, (from, to) => {
      let q = ctx.db.from("collaborators").select("*", { count: "exact" }).eq("organization_id", ctx.organizationId)
        .eq("account_id", ctx.accountId).is("deleted_at", null).in("kind", kinds);
      if (status) q = q.eq("status", status as Enums<"collaborator_status">);
      if (email) q = q.ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`));
      if (name) q = q.or(`first_name.ilike.${likePattern(name)},last_name.ilike.${likePattern(name)}`);
      return q.order("created_at").order("id").range(from, to);
    }) : { items: [], total: 0 },
    wanted.has("device") && !email ? page<Tables<"tablets">>(window, (from, to) => {
      let q = ctx.db.from("tablets").select("*", { count: "exact" }).eq("account_id", ctx.accountId).is("deleted_at", null);
      if (status) q = q.eq("profile_status", status as Enums<"collaborator_status">);
      if (name) q = q.ilike("name", likePattern(name));
      return q.order("created_at").order("id").range(from, to);
    }) : { items: [], total: 0 },
  ]);
  const merged = [
    ...collabs.items.map((c) => ({ at: c.created_at, id: c.id, item: {
      uuidEntity: c.id, type: upper(c.kind), firstName: c.first_name, lastName: c.last_name, trigram: c.trigram,
      email: c.email, ssoIdentifier: c.sso_identifier, registrationNumber: c.register_number,
      authority: upper(c.authority), status: upper(c.status), language: upper(c.language), labelFamilyId: c.function_id,
      companyId: c.company_id, createdAt: c.created_at, modifiedAt: c.updated_at,
    } })),
    ...devices.items.map((t) => ({ at: t.created_at, id: t.id, item: {
      uuidEntity: t.id, type: "DEVICE", name: t.name, nature: upper(t.nature), status: upper(t.profile_status),
      deviceStatus: upper(t.status), labelFamilyId: t.family_id, companyId: t.company_id, mobileAppVersion: t.app_version,
      androidVersion: t.android_version, lastLatitude: t.last_latitude, lastLongitude: t.last_longitude,
      createdAt: t.created_at, modifiedAt: t.updated_at,
    } })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  return list(merged.slice(paging.offset, paging.offset + paging.limit).map((m) => m.item), collabs.total + devices.total);
});
