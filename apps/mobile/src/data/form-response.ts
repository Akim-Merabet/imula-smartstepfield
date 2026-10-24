// Réponses de formulaire dans la base locale (spec 05 §4.7) : création, sauvegarde par rubrique, fin de réponse.
// Les calculs (modèle, renseigné, validations, formules, contrôles) viennent du moteur partagé @imula/forms-core.
import type { NumberLocale } from "@imula/formula";
import { buildModel, type RtModel, type RtRubric, valueTypeOf } from "@imula/forms-core/model";
import type { DynamicItem, FormDefinition } from "@imula/forms-core/types";
import {
  checkValidation, computeRedirect, type DynamicCtx, evaluateCell, isFilled, sameJson, typedColumns, type ValuesMap,
} from "@imula/forms-core/values";

/** Interface minimale de la base (PowerSync React Native ou Node). */
export type Db = {
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>;
  getOptional<T>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<unknown>;
  writeTransaction<T>(fn: (tx: { execute(sql: string, params?: unknown[]): Promise<unknown>; getOptional<R>(sql: string, params?: unknown[]): Promise<R | null> }) => Promise<T>): Promise<T>;
};

const parse = <T>(v: unknown, fallback: T): T => {
  if (typeof v !== "string") return (v as T) ?? fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};

export type ResponseRow = {
  id: string; project_id: string; form_id: string; form_version_id: string; reference: string; state: "in_progress" | "done";
  created_at: string; context: string; block_link_id: string | null; flow_id: string | null; step_id: string | null;
  last_rubric_lineage_id: string | null; dynamic_context: string | null; form_reference: string | null; form_index_label: string | null;
};

export type LoadedResponse = {
  response: ResponseRow;
  definition: FormDefinition;
  model: RtModel;
  values: ValuesMap;
  observations: Record<string, string>;
  dynamicCtx: DynamicCtx;
  /** Rubriques saisissables à l'étape (permissions du lien) ; null = toutes. */
  fillable: Set<string> | null;
  locale: NumberLocale;
  blockEdition: boolean;
};

export async function loadResponse(db: Db, responseId: string): Promise<LoadedResponse | null> {
  const response = await db.getOptional<ResponseRow>("select * from form_responses where id = ? and deleted_at is null", [responseId]);
  if (!response) return null;
  const version = await db.getOptional<{ structure: string }>("select structure from form_versions where id = ?", [response.form_version_id]);
  if (!version) return null;
  const definition = parse<FormDefinition>(version.structure, null as unknown as FormDefinition);
  const items = await db.getAll<{ id: string; rubric_lineage_id: string; kind: "question" | "option"; parent_lineage_id: string | null; template_lineage_id: string; lineage_id: string; position: number; name: string | null }>(
    "select * from form_response_dynamic_items where response_id = ? order by position", [responseId]);
  const dynamicItems: DynamicItem[] = items.map((i) => ({
    id: i.id, rubricLineageId: i.rubric_lineage_id, kind: i.kind, parentLineageId: i.parent_lineage_id,
    templateLineageId: i.template_lineage_id, lineageId: i.lineage_id, position: i.position, name: i.name,
  }));
  const model = buildModel(definition, dynamicItems);
  const rows = await db.getAll<{ option_lineage_id: string; question_lineage_id: string; value_json: string | null; locked: number; is_valid: number | null; observation: string | null }>(
    "select option_lineage_id, question_lineage_id, value_json, locked, is_valid, observation from form_response_values where response_id = ?", [responseId]);
  const values: ValuesMap = {};
  const observations: Record<string, string> = {};
  for (const r of rows) {
    values[r.option_lineage_id] = { value: parse(r.value_json, null), locked: !!r.locked, isValid: r.is_valid == null ? null : !!r.is_valid };
    if (r.observation) observations[r.question_lineage_id] = r.observation;
  }
  const link = response.block_link_id
    ? await db.getOptional<{ fillable_rubric_lineage_ids: string | null }>("select fillable_rubric_lineage_ids from form_block_links where id = ?", [response.block_link_id])
    : null;
  const fillableIds = parse<string[] | null>(link?.fillable_rubric_lineage_ids ?? null, null);
  const org = await db.getOptional<{ number_format: string | null; block_form_response_edition: number | null }>(
    "select number_format, block_form_response_edition from organizations limit 1");
  return {
    response, definition, model, values, observations,
    dynamicCtx: parse<DynamicCtx>(response.dynamic_context, {}),
    fillable: fillableIds ? new Set(fillableIds) : null,
    locale: (org?.number_format ?? "fr") as NumberLocale,
    blockEdition: !!org?.block_form_response_edition,
  };
}

// ---------------------------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------------------------

const s = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const join = (parts: (string | null | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join(" - ");
const pad = (n: number) => String(n).padStart(2, "0");
const today = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Référence par défaut d'une nouvelle réponse (même règle que la WebApp, spec 03 §6.2). */
export function defaultReference(p: {
  formReference: string | null; indexLabel: string | null; objectName?: string | null; flowRef?: string | null;
  phaseNumber?: string | null; stepNumber?: string | null; count: number; now: Date; inFlow: boolean;
}): string {
  const n = p.count + 1;
  return p.inFlow
    ? `${join([p.formReference, p.indexLabel, p.objectName, p.flowRef, `P${p.phaseNumber ?? ""}`, `E${p.stepNumber ?? ""}`, today(p.now)])} R${n}`
    : `${join([p.formReference, p.indexLabel, today(p.now)])} - R${n}`;
}

export type LinkInfo = {
  id: string; form_id: string; flow_id: string; step_id: string; pinned_version_id: string | null;
  unique_response: number; unique_mode: string | null; enabled: number;
};

/** Version à utiliser : version épinglée du lien, sinon version courante du formulaire, sinon la plus récente. */
export async function versionFor(db: Db, formId: string, link: LinkInfo | null): Promise<string | null> {
  if (link?.pinned_version_id) return link.pinned_version_id;
  const form = await db.getOptional<{ current_version_id: string | null }>("select current_version_id from forms where id = ?", [formId]);
  if (form?.current_version_id && await db.getOptional("select 1 from form_versions where id = ?", [form.current_version_id])) {
    return form.current_version_id;
  }
  const latest = await db.getOptional<{ id: string }>("select id from form_versions where form_id = ? order by version_no desc limit 1", [formId]);
  return latest?.id ?? null;
}

/** Variables dynamiques résolues à la création (miroir local de buildDynamicContext de la WebApp). */
export async function buildDynamicContext(db: Db, p: {
  projectId: string; flowId?: string | null; phaseId?: string | null; stepId?: string | null;
  formComment: string | null; reference: string; me: string;
}): Promise<DynamicCtx> {
  const ctx: DynamicCtx = {};
  const pr = await db.getOptional<Record<string, unknown>>(
    `select p.*, f.short_name as family_name, c.name as client_name from projects p left join label_families f on f.id = p.family_id
       left join clients c on c.id = p.client_id where p.id = ?`, [p.projectId]);
  if (pr) Object.assign(ctx, {
    "@@ProjectDesignation": s(pr.designation), "@@ProjectNoCase": s(pr.business_ref), "@@ProjectNoContract": s(pr.contract_ref),
    "@@ProjectClientName1": s(pr.client_name), "@@ProjectClientName2": null, "@@ProjectClientName3": null,
    "@@ProjectLocation": s(pr.location_label), "@@ProjectDescription": s(pr.description),
    "@@ProjectSupervision1": s(pr.supervision_1), "@@ProjectSupervision2": s(pr.supervision_2), "@@ProjectSupervision3": s(pr.supervision_3),
    "@@ProjectInternalSupervision1": s(pr.supervision_intern_1), "@@ProjectInternalSupervision2": s(pr.supervision_intern_2),
    "@@ProjectInternalSupervision3": s(pr.supervision_intern_3), "@@ProjectInternalOrder": s(pr.internal_command),
    "@@ProjectExternalOrder": s(pr.external_command), "@@ProjectNoMarket": s(pr.market_number),
    "@@ProjectTechnicalCase": s(pr.technical_deal), "@@ProjectKeywords": s(pr.keywords), "@@ProjectBusinessField": s(pr.business_domain),
    "@@ProjectNationalProgram": s(pr.national_program), "@@ProjectFamily": s(pr.family_name),
  });
  if (p.flowId) {
    const f = await db.getOptional<Record<string, unknown>>(
      `select f.*, fa.short_name as family_name, ca.short_name as category_name, st.name as status_name,
              r.first_name || ' ' || r.last_name as reporter_name, t1.name as t1, t2.name as t2, t3.name as t3
         from flows f left join label_families fa on fa.id = f.family_id left join label_families ca on ca.id = f.category_id
         left join custom_statuses st on st.id = f.custom_status_id left join collaborators r on r.id = f.reporter_id
         left join tablets t1 on t1.id = f.tablet_1_id left join tablets t2 on t2.id = f.tablet_2_id left join tablets t3 on t3.id = f.tablet_3_id
        where f.id = ?`, [p.flowId]);
    if (f) {
      const assignees = await db.getAll<{ name: string }>(
        "select c.first_name || ' ' || c.last_name as name from flow_assignees a join collaborators c on c.id = a.collaborator_id where a.flow_id = ?", [p.flowId]);
      const geo = await db.getOptional<{ geojson: string | null; altitude: number | null }>(
        "select geojson, altitude from flow_geometries where flow_id = ? and kind = 'point' limit 1", [p.flowId]).catch(() => null);
      const coords = parse<{ coordinates?: number[] } | null>(geo?.geojson ?? null, null)?.coordinates;
      Object.assign(ctx, {
        "@@FlowName": s(f.name), "@@FlowDescription": s(f.description), "@@FlowFamily": s(f.family_name),
        "@@FlowCategory": s(f.category_name), "@@FlowStatus": s(f.status_name),
        "@@FlowSite": s(f.location_site), "@@FlowUnit": s(f.location_area), "@@FlowLocal": s(f.location_local),
        "@@FlowElementarySystem": s(f.elementary_system), "@@FlowFunctionalLandmark": s(f.functional_marker),
        "@@FlowTechnicalObject": s(f.technical_object_label), "@@FlowChrono": s(f.ref_int), "@@FlowEpsilonFolderRef": s(f.ref_ext),
        "@@FlowRapporteur": s(f.reporter_name), "@@FlowResponsable": s(assignees.map((a) => a.name).join(", ")),
        "@@FlowTablette1": s(f.t1), "@@FlowTablette2": s(f.t2), "@@FlowTablette3": s(f.t3),
        "@@FlowDateDebut": s(f.start_date), "@@FlowDateFin": s(f.finish_date),
        "@@FlowGeometryCoordinateLng": coords?.[0] ?? null, "@@FlowGeometryCoordinateLat": coords?.[1] ?? null,
        "@@FlowGeometryCoordinateAlt": geo?.altitude ?? null,
        "@@FlowInternalSupervision1": s(f.internal_supervisor_name_1), "@@FlowInternalSupervision2": s(f.internal_supervisor_name_2),
        "@@FlowInternalSupervision3": s(f.internal_supervisor_name_3), "@@FlowExternalSupervision1": s(f.external_supervisor_name_1),
        "@@FlowExternalSupervision2": s(f.external_supervisor_name_2), "@@FlowExternalSupervision3": s(f.external_supervisor_name_3),
      });
    }
  }
  if (p.phaseId) {
    const ph = await db.getOptional<Record<string, unknown>>("select position, custom_number, name, description, additional_comment from phases where id = ?", [p.phaseId]);
    if (ph) Object.assign(ctx, {
      "@@CurrPhaseNumber": s(ph.custom_number ?? ph.position), "@@CurrPhaseName": s(ph.name),
      "@@CurrPhaseDescription": s(ph.description), "@@AdditionalStatementPhase": s(ph.additional_comment),
    });
  }
  if (p.stepId) {
    const st = await db.getOptional<Record<string, unknown>>("select position, custom_number, name, description, additional_comment from steps where id = ?", [p.stepId]);
    if (st) Object.assign(ctx, {
      "@@CurrStepNumber": s(st.custom_number ?? st.position), "@@CurrStepName": s(st.name),
      "@@CurrStepDescription": s(st.description), "@@AdditionalStatementStep": s(st.additional_comment),
    });
  }
  const me = await db.getOptional<{ name: string }>("select first_name || ' ' || last_name as name from collaborators where id = ?", [p.me]);
  Object.assign(ctx, {
    "@@refResponse": p.reference, "@@currentCollaborator": me?.name ?? null,
    "@@externalCollaboratorLastName": null, "@@externalCollaboratorFirstName": null,
    "@@externalCollaboratorCompany": null, "@@externalCollaboratorJob": null, "@@AdditionalStatementForm": s(p.formComment),
  });
  // Attributs personnalisés (entité / flow / phase / étape) ayant un nom de variable.
  const objectIds = [p.projectId, p.flowId, p.phaseId, p.stepId].filter((x): x is string => !!x);
  const attrs = await db.getAll<{ variable_name: string; value_text: string | null; value_json: string | null }>(
    `select cf.variable_name, v.value_text, v.value_json from custom_fields cf
       left join custom_field_values v on v.custom_field_id = cf.id and v.object_id in (${objectIds.map(() => "?").join(",")})
      where cf.variable_name is not null and cf.deleted_at is null`, objectIds);
  for (const a of attrs) {
    const list = parse<unknown>(a.value_json, null);
    ctx[`@@${a.variable_name}`] = s(a.value_text ?? (Array.isArray(list) ? list.join(", ") : null));
  }
  return ctx;
}

/** Crée une réponse localement (envoyée ensuite par mobile_create_form_response). Renvoie son identifiant. */
export async function createResponse(db: Db, p: {
  id: string; formId: string; link: LinkInfo | null; projectId: string; reference: string; me: string;
}): Promise<string | null> {
  const form = await db.getOptional<{ lineage_id: string; reference: string | null; index_label: string | null; additional_comment: string | null; organization_id: string; account_id: string }>(
    "select lineage_id, reference, index_label, additional_comment, organization_id, account_id from forms where id = ?", [p.formId]);
  const versionId = await versionFor(db, p.formId, p.link);
  if (!form || !versionId) return null;
  const step = p.link ? await db.getOptional<{ phase_id: string }>("select phase_id from steps where id = ?", [p.link.step_id]) : null;
  const ctx = await buildDynamicContext(db, {
    projectId: p.projectId, flowId: p.link?.flow_id, phaseId: step?.phase_id, stepId: p.link?.step_id,
    formComment: form.additional_comment, reference: p.reference, me: p.me,
  });
  const now = new Date().toISOString();
  await db.execute(
    `insert into form_responses (id, organization_id, account_id, project_id, form_id, form_version_id, form_lineage_id,
        form_index_label, form_reference, context, block_link_id, flow_id, phase_id, step_id, reference, state, provenance,
        dynamic_context, created_at, created_by, updated_at, updated_by, mobile_visible)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', 'mobile', ?, ?, ?, ?, ?, 1)`,
    [p.id, form.organization_id, form.account_id, p.projectId, p.formId, versionId, form.lineage_id, form.index_label, form.reference,
      p.link ? "flow" : "project", p.link?.id ?? null, p.link?.flow_id ?? null, step?.phase_id ?? null, p.link?.step_id ?? null,
      p.reference, JSON.stringify(ctx), now, p.me, now, p.me]);
  return p.id;
}

// ---------------------------------------------------------------------------------------------
// Sauvegarde d'une rubrique
// ---------------------------------------------------------------------------------------------

export type ValueRow = {
  rubric_lineage_id: string; question_lineage_id: string; option_lineage_id: string; option_code: string | null; coord: string;
  question_type: string; value_type: string; value_json: string | null; value_text: string | null; value_number: number | null;
  value_bool: number | null; value_date: string | null; value_ts: string | null; observation: string | null;
  is_valid: number | null; locked: number;
};

/**
 * Lignes à écrire pour une rubrique : cellules modifiées (formules recalculées) et observations, comme saveRubric
 * de la WebApp. Les valeurs verrouillées ne sont pas modifiables sur l'appareil (signature de modification à venir).
 */
export function rubricRows(loaded: Pick<LoadedResponse, "model" | "definition" | "dynamicCtx" | "locale">, rubric: RtRubric,
  current: ValuesMap, baseline: ValuesMap, observations: Record<string, string>, baseObservations: Record<string, string>): ValueRow[] {
  const merged: ValuesMap = { ...baseline, ...current };
  const out: ValueRow[] = [];
  for (const q of rubric.questions) {
    const obs = observations[q.lineageId] ?? "";
    const obsChanged = obs !== (baseObservations[q.lineageId] ?? "");
    q.cells.forEach((cell, i) => {
      let value = current[cell.lineageId]?.value ?? null;
      const base = baseline[cell.lineageId];
      if (base?.locked) return;
      if (q.type === "formula") {
        const res = evaluateCell(loaded.model, rubric, q, cell, merged, loaded.dynamicCtx, loaded.locale);
        value = res.ok ? { result: res.value, unit: cell.opt?.unit } : null;
        merged[cell.lineageId] = { value, locked: false };
      }
      const changed = !sameJson(base?.value ?? null, value);
      const first = i === 0;
      if (!changed && !(first && obsChanged)) return;
      if (value === null && !base && !(first && obsChanged)) return;
      const filled = isFilled(q.type, value, cell);
      const isValid = filled && cell.opt?.validation ? checkValidation(q.type, value, cell.opt.validation) : null;
      out.push({
        rubric_lineage_id: rubric.def.lineageId, question_lineage_id: q.lineageId, option_lineage_id: cell.lineageId,
        option_code: cell.opt?.code ?? null, coord: cell.coord, question_type: q.type, value_type: valueTypeOf(q.type),
        value_json: value === null ? null : JSON.stringify(value),
        ...(() => {
          const t = typedColumns(q.type, value);
          return { ...t, value_bool: t.value_bool == null ? null : t.value_bool ? 1 : 0 };
        })(),
        observation: first ? obs || null : null,
        is_valid: isValid == null ? null : isValid ? 1 : 0,
        locked: loaded.definition.lockResponses && value !== null ? 1 : 0,
      });
    });
  }
  return out;
}

/** Écrit les lignes d'une rubrique (une ligne par option) et mémorise la rubrique courante et la redirection active. */
export async function saveRubricRows(db: Db, response: { id: string; organization_id?: string }, rubric: RtRubric, rows: ValueRow[],
  current: ValuesMap, me: string, randomId: () => string, project?: { flowId: string | null; projectId: string }) {
  const now = new Date().toISOString();
  await db.writeTransaction(async (tx) => {
    for (const r of rows) {
      const existing = await tx.getOptional<{ id: string }>(
        "select id from form_response_values where response_id = ? and option_lineage_id = ?", [response.id, r.option_lineage_id]);
      const cols = Object.keys(r) as (keyof ValueRow)[];
      if (existing) {
        await tx.execute(`update form_response_values set ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ?, provenance = 'mobile' where id = ?`,
          [...cols.map((c) => r[c]), now, me, existing.id]);
      } else {
        await tx.execute(
          `insert into form_response_values (id, response_id, ${cols.join(", ")}, updated_at, updated_by, provenance, flow_id, project_id)
           values (?, ?, ${cols.map(() => "?").join(", ")}, ?, ?, 'mobile', ?, ?)`,
          [randomId(), response.id, ...cols.map((c) => r[c]), now, me, project?.flowId ?? null, project?.projectId ?? null]);
      }
    }
    const redirect = computeRedirect(rubric, current);
    await tx.execute("update form_responses set last_rubric_lineage_id = ?, active_redirect = ?, updated_at = ? where id = ?",
      [rubric.def.lineageId, redirect ? JSON.stringify(redirect) : null, now, response.id]);
  });
}

export async function finishResponse(db: Db, responseId: string) {
  await db.execute("update form_responses set state = 'done', done_at = ?, active_redirect = null where id = ? and state = 'in_progress'",
    [new Date().toISOString(), responseId]);
}

export async function reopenResponse(db: Db, responseId: string) {
  await db.execute("update form_responses set state = 'in_progress', done_at = null where id = ? and state = 'done'", [responseId]);
}
