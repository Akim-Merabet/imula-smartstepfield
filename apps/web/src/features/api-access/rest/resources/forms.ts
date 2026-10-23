import "server-only";
import type { Enums, Json, Tables } from "@/lib/supabase/database.types";
import { notFound } from "../errors";
import { accountScopeFilter, apiRoute, assertReadable, dbCheck, list, one, page, type ApiContext } from "../handler";
import { managementProperties, MANAGEMENT_PROPERTIES, upper, withEmbeds } from "../mappers";
import { boolParam, enumListParam, likePattern, parseDateFilters, parseEmbed, parsePaging, pathUuid, textParam, uuidParam } from "../params";
import { loadFamilies } from "./common";

export const FORM_EMBEDS = [MANAGEMENT_PROPERTIES, "RUBRICS", "PROJECT", "LABEL_FAMILY"] as const;
export const RESPONSE_EMBEDS = [MANAGEMENT_PROPERTIES, "VALUES"] as const;
type FormEmbed = (typeof FORM_EMBEDS)[number];
const NATURES: readonly Enums<"form_nature">[] = ["model", "generic", "other", "local", "archived"];
const LOCATIONS: readonly Enums<"form_location">[] = ["library", "project"];
const STATES: readonly Enums<"response_state">[] = ["in_progress", "done"];

type FormRow = Tables<"forms">;
type ResponseRow = Tables<"form_responses">;
type ValueRow = Pick<Tables<"form_response_values">, "option_lineage_id" | "question_lineage_id" | "rubric_lineage_id" | "option_code" | "coord"
  | "question_type" | "value_type" | "value_text" | "value_number" | "value_bool" | "value_date" | "value_ts" | "value_json" | "observation" | "locked" | "updated_at">;

// ===== Structure (version figée) ================================================
type StructOption = { lineageId: string; coord?: string; code?: string | null; name?: string | null; optionName?: string | null; position?: number; unit?: string | null };
type StructQuestion = { lineageId: string; name: string; type: string; position: number; mandatory?: boolean; options?: StructOption[]; signatories?: StructOption[] };
type StructRubric = { lineageId: string; name: string; type: string; position: number; questions?: StructQuestion[] };

function rubricsOf(structure: Json | null | undefined): StructRubric[] {
  const s = structure as { rubrics?: StructRubric[] } | null;
  return Array.isArray(s?.rubrics) ? s.rubrics : [];
}

function cellsOf(q: StructQuestion): StructOption[] {
  return [...(q.options ?? []), ...(q.signatories ?? [])];
}

function mapStructure(structure: Json | null | undefined) {
  return rubricsOf(structure).map((r) => ({
    uuidEntity: r.lineageId,
    name: r.name,
    rubricOrder: r.position,
    rubricType: upper(r.type),
    rubricQuestions: (r.questions ?? []).map((q) => ({
      uuidEntity: q.lineageId,
      name: q.name,
      questionOrder: q.position,
      nature: upper(q.type),
      mandatory: !!q.mandatory,
      rubricOptions: cellsOf(q).map((o) => ({
        uuidEntity: o.lineageId, identifier: o.coord ?? null, code: o.code ?? null, name: o.optionName ?? o.name ?? null,
        optionOrder: o.position ?? null, unit: o.unit ?? null,
      })),
    })),
  }));
}

// ===== Formulaires ================================================================
function mapForm(f: FormRow) {
  return {
    uuidEntity: f.id,
    uuidType: f.lineage_id,
    uuidOrganization: f.organization_id,
    uuidAccount: f.account_id,
    name: f.name,
    description: f.description,
    indice: f.index_label,
    reference: f.reference,
    nature: upper(f.nature),
    location: upper(f.location),
    origin: upper(f.origin),
    projectId: f.project_id,
    sourcedFromFormId: f.sourced_from_form_id,
    customStatusId: f.custom_status_id,
    labelFamilyId: f.family_id,
    isEnabled: f.enabled,
    isArchived: f.archived,
    modificationDate: f.updated_at,
    isDeleted: !!f.deleted_at,
  };
}

async function presentForms(ctx: ApiContext, rows: FormRow[], embed: Set<FormEmbed>) {
  const [versions, families, projects] = await Promise.all([
    embed.has("RUBRICS") && rows.some((r) => r.current_version_id)
      ? ctx.db.from("form_versions").select("id, structure").in("id", rows.map((r) => r.current_version_id).filter(Boolean) as string[]).then(dbCheck)
      : null,
    embed.has("LABEL_FAMILY") ? loadFamilies(ctx.db, rows.map((r) => r.family_id)) : null,
    embed.has("PROJECT") && rows.some((r) => r.project_id)
      ? ctx.db.from("projects").select("id, designation, type, description, updated_at").in("id", rows.map((r) => r.project_id).filter(Boolean) as string[]).then(dbCheck)
      : null,
  ]);
  return rows.map((f) => withEmbeds(mapForm(f), {
    managementProperties: embed.has(MANAGEMENT_PROPERTIES) ? managementProperties(f) : undefined,
    rubrics: embed.has("RUBRICS") ? mapStructure(versions?.find((v) => v.id === f.current_version_id)?.structure) : undefined,
    labelFamily: families ? families.get(f.family_id ?? "") ?? null : undefined,
    project: embed.has("PROJECT") ? (() => {
      const p = projects?.find((x) => x.id === f.project_id);
      return p ? { uuidEntity: p.id, designation: p.designation, typeProject: upper(p.type), description: p.description, modificationDate: p.updated_at } : null;
    })() : undefined,
  }));
}

/** GET /forms — filtres : name, nature, location (LIBRARY/PROJECT), projectId, statusId, deletedOnly, dates. */
export const listForms = apiRoute({ level: "L1" }, async (ctx) => {
  const sp = ctx.url.searchParams;
  const paging = parsePaging(sp);
  const embed = parseEmbed(sp, FORM_EMBEDS);
  const dates = parseDateFilters(sp);
  const name = textParam(sp, "name");
  const natures = enumListParam(sp, "nature", NATURES);
  const locations = enumListParam(sp, "location", LOCATIONS);
  const projectId = uuidParam(sp, "projectId");
  const statusId = uuidParam(sp, "statusId");
  const deletedOnly = boolParam(sp, "deletedOnly");
  const scope = await accountScopeFilter(ctx);
  const { items, total } = await page<FormRow>(paging, (from, to) => {
    let q = ctx.db.from("forms").select("*", { count: "exact" }).eq("organization_id", ctx.organizationId).or(scope);
    q = deletedOnly ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
    if (name) q = q.ilike("name", likePattern(name));
    if (natures.length) q = q.in("nature", natures);
    if (locations.length) q = q.in("location", locations);
    if (projectId) q = q.eq("project_id", projectId);
    if (statusId) q = q.eq("custom_status_id", statusId);
    if (dates.createdAfterAt) q = q.gt("created_at", dates.createdAfterAt);
    if (dates.modifiedAfterAt) q = q.gt("updated_at", dates.modifiedAfterAt);
    return q.order("created_at").order("id").range(from, to);
  });
  return list(await presentForms(ctx, items, embed), total);
});

/** GET /forms/{formId} */
export const getForm = apiRoute<{ formId: string }>({ level: "L1" }, async (ctx, params) => {
  const id = pathUuid(params.formId, "formId");
  const embed = parseEmbed(ctx.url.searchParams, FORM_EMBEDS);
  let q = ctx.db.from("forms").select("*").eq("id", id).eq("organization_id", ctx.organizationId);
  q = boolParam(ctx.url.searchParams, "isDeleted") ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
  const f = dbCheck(await q.maybeSingle());
  if (!f) throw notFound("Form", id);
  await assertReadable(ctx, f);
  return one((await presentForms(ctx, [f], embed))[0]);
});

// ===== Réponses ===================================================================
function mapResponse(r: ResponseRow) {
  return {
    uuidEntity: r.id,
    uuidOrganization: r.organization_id,
    uuidAccount: r.account_id,
    projectId: r.project_id,
    formId: r.form_id,
    uuidType: r.form_lineage_id,
    formVersionId: r.form_version_id,
    indice: r.form_index_label,
    formReference: r.form_reference,
    responseReference: r.reference,
    state: upper(r.state),
    customStatusId: r.custom_status_id,
    context: upper(r.context),
    flowId: r.flow_id,
    phaseId: r.phase_id,
    stepId: r.step_id,
    provenance: upper(r.provenance),
    doneAt: r.done_at,
    modificationDate: r.updated_at,
    isDeleted: !!r.deleted_at,
  };
}

/** Types dont la valeur est structurée (objectValue) ; les autres sont exposés en `values` (liste de chaînes). */
const OBJECT_VALUE_TYPES = new Set(["duration", "value_and_unit", "coordinates", "file_list", "signature", "number"]);

/** Valeur exportée selon son `valueType` : `values` (chaînes) et/ou `objectValue` (objet JSON). */
export function exportValue(v: ValueRow) {
  const json = v.value_json as unknown;
  let values: string[] | null = null;
  let objectValue: unknown = null;
  switch (v.value_type) {
    case "string_list": values = Array.isArray(json) ? json.map(String) : v.value_text ? v.value_text.split("__") : []; break;
    case "boolean": values = v.value_bool === null ? [] : [String(v.value_bool)]; break;
    case "date": values = v.value_date ? [v.value_date] : json ? [String(json)] : []; break;
    case "datetime": values = v.value_ts ? [new Date(v.value_ts).toISOString()] : json ? [String(json)] : []; break;
    case "number":
      values = v.value_number !== null ? [String(v.value_number)] : v.value_bool !== null ? [String(v.value_bool)] : [];
      objectValue = json ?? null;
      break;
    default:
      if (OBJECT_VALUE_TYPES.has(v.value_type)) objectValue = json ?? null;
      else values = v.value_text !== null ? [v.value_text] : json !== null && json !== undefined ? [typeof json === "string" ? json : JSON.stringify(json)] : [];
  }
  return {
    identifier: v.coord,
    code: v.option_code,
    optionId: v.option_lineage_id,
    questionId: v.question_lineage_id,
    rubricId: v.rubric_lineage_id,
    questionType: upper(v.question_type),
    valueType: upper(v.value_type),
    values,
    objectValue,
    observation: v.observation,
    locked: v.locked,
    modificationDate: v.updated_at,
  };
}

const VALUE_COLUMNS = "response_id, option_lineage_id, question_lineage_id, rubric_lineage_id, option_code, coord, question_type, value_type, value_text, value_number, value_bool, value_date, value_ts, value_json, observation, locked, updated_at";

async function loadValues(ctx: ApiContext, responseIds: string[]) {
  if (!responseIds.length) return [];
  return dbCheck(await ctx.db.from("form_response_values").select(VALUE_COLUMNS).in("response_id", responseIds)
    .eq("organization_id", ctx.organizationId).order("coord")) ?? [];
}

/** GET /form-responses — filtres : projectId, formId, uuidType, flowId, state, statusId, reference, isDeleted, dates. */
export const listResponses = apiRoute({ level: "L1" }, async (ctx) => {
  const sp = ctx.url.searchParams;
  const paging = parsePaging(sp);
  const embed = parseEmbed(sp, RESPONSE_EMBEDS);
  const dates = parseDateFilters(sp);
  const projectId = uuidParam(sp, "projectId");
  const formId = uuidParam(sp, "formId");
  const lineage = uuidParam(sp, "uuidType");
  const flowId = uuidParam(sp, "flowId");
  const states = enumListParam(sp, "state", STATES);
  const statusId = uuidParam(sp, "statusId");
  const reference = textParam(sp, "reference");
  const deleted = boolParam(sp, "isDeleted");
  const scope = await accountScopeFilter(ctx);
  const { items, total } = await page<ResponseRow>(paging, (from, to) => {
    let q = ctx.db.from("form_responses").select("*", { count: "exact" }).eq("organization_id", ctx.organizationId).or(scope);
    q = deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
    if (projectId) q = q.eq("project_id", projectId);
    if (formId) q = q.eq("form_id", formId);
    if (lineage) q = q.eq("form_lineage_id", lineage);
    if (flowId) q = q.eq("flow_id", flowId);
    if (states.length) q = q.in("state", states);
    if (statusId) q = q.eq("custom_status_id", statusId);
    if (reference) q = q.ilike("reference", likePattern(reference));
    if (dates.createdAfterAt) q = q.gt("created_at", dates.createdAfterAt);
    if (dates.modifiedAfterAt) q = q.gt("updated_at", dates.modifiedAfterAt);
    return q.order("created_at").order("id").range(from, to);
  });
  const values = embed.has("VALUES") ? await loadValues(ctx, items.map((r) => r.id)) : [];
  return list(items.map((r) => withEmbeds(mapResponse(r), {
    managementProperties: embed.has(MANAGEMENT_PROPERTIES) ? managementProperties(r) : undefined,
    values: embed.has("VALUES") ? values.filter((v) => v.response_id === r.id).map(exportValue) : undefined,
  })), total);
});

async function loadResponse(ctx: ApiContext, id: string, deleted: boolean) {
  let q = ctx.db.from("form_responses").select("*").eq("id", id).eq("organization_id", ctx.organizationId);
  q = deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
  const r = dbCheck(await q.maybeSingle());
  if (!r) throw notFound("Form response", id);
  await assertReadable(ctx, r);
  return r;
}

/** GET /form-responses/{responseId} */
export const getResponse = apiRoute<{ responseId: string }>({ level: "L1" }, async (ctx, params) => {
  const id = pathUuid(params.responseId, "responseId");
  const embed = parseEmbed(ctx.url.searchParams, RESPONSE_EMBEDS);
  const r = await loadResponse(ctx, id, boolParam(ctx.url.searchParams, "isDeleted"));
  const values = embed.has("VALUES") ? await loadValues(ctx, [r.id]) : [];
  return one(withEmbeds(mapResponse(r), {
    managementProperties: embed.has(MANAGEMENT_PROPERTIES) ? managementProperties(r) : undefined,
    values: embed.has("VALUES") ? values.map(exportValue) : undefined,
  }));
});

/**
 * GET /form-responses/{responseId}/export — export JSON complet : structure de la version du formulaire
 * (rubriques → questions → options, identifiants « RxQyOz ») avec la valeur de chaque option.
 */
export const exportResponse = apiRoute<{ responseId: string }>({ level: "L2" }, async (ctx, params) => {
  const id = pathUuid(params.responseId, "responseId");
  const r = await loadResponse(ctx, id, boolParam(ctx.url.searchParams, "isDeleted"));
  const [version, form, values] = await Promise.all([
    ctx.db.from("form_versions").select("id, version_no, index_label, structure").eq("id", r.form_version_id).maybeSingle().then(dbCheck),
    ctx.db.from("forms").select("id, name, reference, index_label").eq("id", r.form_id).maybeSingle().then(dbCheck),
    loadValues(ctx, [r.id]),
  ]);
  const byOption = new Map(values.map((v) => [v.option_lineage_id, v]));
  const used = new Set<string>();
  const rubrics = rubricsOf(version?.structure).map((rb) => ({
    uuidEntity: rb.lineageId,
    name: rb.name,
    rubricOrder: rb.position,
    rubricType: upper(rb.type),
    questions: (rb.questions ?? []).map((q) => ({
      uuidEntity: q.lineageId,
      name: q.name,
      questionOrder: q.position,
      nature: upper(q.type),
      mandatory: !!q.mandatory,
      options: cellsOf(q).map((o) => {
        const v = byOption.get(o.lineageId);
        if (v) used.add(o.lineageId);
        const exported = v ? exportValue(v) : null;
        return {
          uuidEntity: o.lineageId,
          identifier: o.coord ?? v?.coord ?? null,
          code: o.code ?? v?.option_code ?? null,
          name: o.optionName ?? o.name ?? null,
          valueType: exported?.valueType ?? null,
          values: exported?.values ?? null,
          objectValue: exported?.objectValue ?? null,
          observation: exported?.observation ?? null,
          locked: exported?.locked ?? false,
        };
      }),
    })),
  }));
  return one({
    response: mapResponse(r),
    form: form ? { uuidEntity: form.id, name: form.name, reference: form.reference, indice: version?.index_label ?? form.index_label, versionNo: version?.version_no ?? null } : null,
    rubrics,
    // Lignes / colonnes ajoutées sur le terrain (hors structure figée).
    additionalValues: values.filter((v) => !used.has(v.option_lineage_id)).map(exportValue),
  });
});
