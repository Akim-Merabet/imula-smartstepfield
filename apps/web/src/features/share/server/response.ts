import "server-only";
import { buildDynamicContext } from "@/features/forms/server/dynamic-context";
import { ensureVersion } from "@/features/forms/server/structure";
import { buildModel, valueTypeOf } from "@/features/forms/response/engine/model";
import {
  cellError, checkResponse, checkValidation, evaluateCell, isFilled, typedColumns, type DynamicCtx, type ValuesMap,
} from "@/features/forms/response/engine/values";
import type { ActiveRedirect, CheckResult, DynamicItem, FormDefinition } from "@/features/forms/types";
import type { NumberLocale } from "@/lib/formula/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { targetResponseId, type Contributor, type ResolvedShare } from "./access";

/**
 * Moteur de réponse en mode partagé : lectures / écritures par le client service, toujours filtrées
 * par la réponse cible du partage et son entité. Seules les questions `shared` sont modifiables.
 */

export type StoredValue = { value: unknown; locked: boolean; isValid: boolean | null; observation: string | null; questionLineageId: string };

export function externalVariables(c: Contributor) {
  return {
    "@@externalCollaboratorLastName": c.lastName, "@@externalCollaboratorFirstName": c.firstName,
    "@@externalCollaboratorCompany": c.company, "@@externalCollaboratorJob": c.job,
  };
}

export async function loadShareResponse(share: ResolvedShare) {
  const responseId = targetResponseId(share);
  if (share.kind !== "form" || !responseId) return null;
  const db = createAdminClient();
  const { data: response } = await db.from("form_responses")
    .select("id, project_id, organization_id, form_id, form_version_id, reference, state, created_at, custom_status_id, context, block_link_id, last_rubric_lineage_id, active_redirect, dynamic_context, form_index_label")
    .eq("id", responseId).eq("project_id", share.projectId).eq("organization_id", share.organizationId).is("deleted_at", null).maybeSingle();
  if (!response) return null;
  const [{ data: version }, { data: items }, { data: values }, { data: form }, { data: org }] = await Promise.all([
    db.from("form_versions").select("structure").eq("id", response.form_version_id).eq("form_id", response.form_id).maybeSingle(),
    db.from("form_response_dynamic_items").select("*").eq("response_id", response.id).order("position"),
    db.from("form_response_values").select("option_lineage_id, question_lineage_id, value_json, locked, is_valid, observation").eq("response_id", response.id),
    db.from("forms").select("name").eq("id", response.form_id).eq("project_id", share.projectId).maybeSingle(),
    db.from("organizations").select("number_format").eq("id", share.organizationId).maybeSingle(),
  ]);
  if (!version) return null;
  const dynamicItems: DynamicItem[] = (items ?? []).map((i) => ({
    id: i.id, rubricLineageId: i.rubric_lineage_id, kind: i.kind as "question" | "option", parentLineageId: i.parent_lineage_id,
    templateLineageId: i.template_lineage_id, lineageId: i.lineage_id, position: i.position, name: i.name,
  }));
  const stored: Record<string, StoredValue> = {};
  for (const v of values ?? []) {
    stored[v.option_lineage_id] = { value: v.value_json, locked: v.locked, isValid: v.is_valid, observation: v.observation, questionLineageId: v.question_lineage_id };
  }
  return {
    db, response, definition: version.structure as unknown as FormDefinition, items: dynamicItems, stored,
    formName: form?.name ?? (version.structure as unknown as FormDefinition).name,
    locale: (org?.number_format ?? "fr") as NumberLocale,
  };
}
export type ShareResponseData = NonNullable<Awaited<ReturnType<typeof loadShareResponse>>>;

const pad = (n: number) => String(n).padStart(2, "0");
function today(locale: string) {
  const d = new Date();
  return locale === "en" ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}` : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Crée la contribution d'un externe sur un formulaire vierge partagé (contexte `share`). */
export async function createContribution(share: ResolvedShare, contributor: Contributor): Promise<string | null> {
  if (share.kind !== "form" || !share.formId || share.responseId) return null;
  const db = createAdminClient();
  const { data: form } = await db.from("forms")
    .select("id, project_id, organization_id, account_id, lineage_id, enabled, deleted_at, reference, index_label, additional_comment, location")
    .eq("id", share.formId).eq("project_id", share.projectId).eq("organization_id", share.organizationId).maybeSingle();
  if (!form || form.deleted_at || !form.enabled || form.location !== "project") return null;
  const version = await ensureVersion(db, form.id, share.sentBy);
  if (!version) return null;
  const { count } = await db.from("form_responses").select("id", { count: "exact", head: true })
    .eq("form_id", form.id).eq("project_id", share.projectId).is("deleted_at", null);
  const head = [form.reference, form.index_label, today(share.language)].map((p) => p?.trim()).filter(Boolean).join(" - ");
  const reference = `${head} - R${(count ?? 0) + 1}`;
  const dynamic = await buildDynamicContext(db, {
    projectId: share.projectId, form, reference, collaborator: { first_name: contributor.firstName, last_name: contributor.lastName },
  });
  Object.assign(dynamic, externalVariables(contributor));
  const { data: project } = await db.from("projects").select("account_id").eq("id", share.projectId).maybeSingle();
  const { data, error } = await db.from("form_responses").insert({
    organization_id: share.organizationId, account_id: project?.account_id ?? form.account_id, project_id: share.projectId,
    form_id: form.id, form_version_id: version.id, form_lineage_id: form.lineage_id, form_index_label: form.index_label,
    form_reference: form.reference, context: "share", reference, provenance: "webapp", dynamic_context: dynamic as Json,
    created_by_external: contributor as unknown as Json,
  }).select("id").single();
  if (error || !data) return null;
  // Rattachement atomique : si une autre requête a déjà créé la contribution, on supprime le doublon.
  const { data: linked } = await db.from("form_shares").update({ contribution_response_id: data.id })
    .eq("id", share.id).is("contribution_response_id", null).select("id");
  if (!linked?.length) {
    await db.from("form_responses").delete().eq("id", data.id);
    const { data: s } = await db.from("form_shares").select("contribution_response_id").eq("id", share.id).maybeSingle();
    return s?.contribution_response_id ?? null;
  }
  await db.from("form_response_events").insert({
    response_id: data.id, action: "created", actor_id: null, provenance: "webapp", payload: { reference, external: contributor.email },
  });
  return data.id;
}

/** Réponse partagée : les variables @@externalCollaborator* sont renseignées pour les pré-remplissages. */
export async function applyContributorToResponse(share: ResolvedShare, contributor: Contributor) {
  if (!share.responseId) return;
  const db = createAdminClient();
  const { data: r } = await db.from("form_responses").select("id, dynamic_context, state")
    .eq("id", share.responseId).eq("project_id", share.projectId).is("deleted_at", null).maybeSingle();
  if (!r || r.state === "done") return;
  const ctx = { ...((r.dynamic_context ?? {}) as Record<string, unknown>), ...externalVariables(contributor) };
  await db.from("form_responses").update({ dynamic_context: ctx as Json }).eq("id", r.id);
}

export type ShareSaveCell = { lineageId: string; value: unknown; filesAdded?: unknown[] | null; filesRemoved?: unknown[] | null };

/** Sauvegarde d'une rubrique par un externe (questions partagées uniquement, valeurs verrouillées intouchables). */
export async function saveSharedRubric(data: ShareResponseData, input: {
  rubricLineageId: string; cells: ShareSaveCell[]; observations: Record<string, string | null>;
  activeRedirect: ActiveRedirect | null; lastRubricLineageId?: string | null;
}): Promise<{ ok: true; changed: number; values: Record<string, unknown> } | { ok: false; error: string; details?: unknown }> {
  const { db, response, definition, items, stored, locale } = data;
  if (response.state === "done") return { ok: false, error: "response_done" };
  const model = buildModel(definition, items);
  const rubric = model.rubrics.find((r) => r.def.lineageId === input.rubricLineageId);
  if (!rubric) return { ok: false, error: "not_found" };

  const merged: ValuesMap = {};
  for (const [k, v] of Object.entries(stored)) merged[k] = { value: v.value, locked: v.locked, isValid: v.isValid };
  const allowed = input.cells.filter((c) => {
    const owner = model.cellByLineage.get(c.lineageId);
    return owner && owner.rubric === rubric && owner.question.def.shared && !stored[c.lineageId]?.locked;
  });
  for (const c of allowed) merged[c.lineageId] = { value: c.value, locked: false };

  const payload: Record<string, unknown>[] = [];
  const finalValues: Record<string, unknown> = {};
  for (const c of allowed) {
    const { question, cell } = model.cellByLineage.get(c.lineageId)!;
    let value = c.value ?? null;
    if (question.type === "formula" && value !== null) {
      const res = evaluateCell(model, rubric, question, cell, merged, (response.dynamic_context ?? {}) as DynamicCtx, locale);
      if (res.ok) value = { result: res.value, unit: cell.opt?.unit };
      merged[c.lineageId] = { value, locked: false };
    }
    if (cellError(question, cell, value, response.created_at)) {
      return { ok: false, error: question.def.allowBackdating || (question.type !== "date" && question.type !== "datetime") ? "invalid_value" : "backdating",
        details: { question: question.name } };
    }
    const filled = isFilled(question.type, value, cell);
    const isValid = filled && cell.opt?.validation ? checkValidation(question.type, value, cell.opt.validation) : null;
    const firstCell = question.cells[0]?.lineageId === c.lineageId;
    finalValues[c.lineageId] = value;
    payload.push({
      rubric_lineage_id: rubric.def.lineageId, question_lineage_id: question.lineageId, option_lineage_id: c.lineageId,
      option_code: cell.opt?.code ?? null, coord: cell.coord, question_type: question.type, value_type: valueTypeOf(question.type),
      value_json: value, ...typedColumns(question.type, value),
      observation: firstCell ? (question.def.withObservation ? input.observations[question.lineageId] ?? null : stored[c.lineageId]?.observation ?? null) : null,
      is_valid: isValid, lock: false,
      files_added: c.filesAdded?.length ? c.filesAdded : null, files_removed: c.filesRemoved?.length ? c.filesRemoved : null,
      reason: "external_share",
    });
  }
  // Observations seules (questions partagées dont la 1re cellule n'a pas été soumise).
  for (const [qLineage, obs] of Object.entries(input.observations)) {
    const q = model.questionByLineage.get(qLineage);
    const first = q?.question.cells[0];
    if (!q || q.rubric !== rubric || !q.question.def.shared || !q.question.def.withObservation || !first
      || stored[first.lineageId]?.locked || payload.some((p) => p.option_lineage_id === first.lineageId)) continue;
    const value = stored[first.lineageId]?.value ?? null;
    payload.push({
      rubric_lineage_id: rubric.def.lineageId, question_lineage_id: qLineage, option_lineage_id: first.lineageId,
      option_code: first.opt?.code ?? null, coord: first.coord, question_type: q.question.type, value_type: valueTypeOf(q.question.type),
      value_json: value, ...typedColumns(q.question.type, value), observation: obs, is_valid: stored[first.lineageId]?.isValid ?? null,
    });
  }

  const { data: changed, error } = await db.rpc("save_rubric_values", {
    p_response_id: response.id, p_rubric_lineage_id: rubric.def.lineageId, p_values: payload as unknown as Json,
    p_options: {
      provenance: "webapp", change_signature: null, auto_lock: definition.lockResponses, set_redirect: true,
      active_redirect: input.activeRedirect, last_rubric_lineage_id: input.lastRubricLineageId ?? rubric.def.lineageId,
    } as unknown as Json,
  });
  if (error) {
    if (error.message?.includes("response_done")) return { ok: false, error: "response_done" };
    if (error.message?.includes("locked_value")) return { ok: false, error: "forbidden" };
    return { ok: false, error: "unknown" };
  }
  return { ok: true, changed: changed ?? 0, values: finalValues };
}

/** Ne garde, dans un résultat de contrôle, que les questions saisissables par l'externe. */
export function sharedOnly(results: CheckResult[], definition: FormDefinition, items: DynamicItem[]): CheckResult[] {
  const model = buildModel(definition, items);
  return results.map((r) => ({
    ...r, questions: r.questions.filter((q) => model.questionByLineage.get(q.questionLineageId)?.question.def.shared),
  })).map((r) => ({ ...r, valid: r.questions.length === 0 })).filter((r) => !r.valid);
}

/**
 * « Envoyer la réponse » : contrôle des questions partagées. La réponse passe à l'état Terminé si
 * l'ensemble du formulaire est complet ; sinon elle reste En cours (les collaborateurs internes complètent).
 */
export async function sendSharedResponse(data: ShareResponseData, share: ResolvedShare): Promise<{ failed: CheckResult[] }> {
  const { db, response, definition, items, stored } = data;
  const model = buildModel(definition, items);
  const values: ValuesMap = Object.fromEntries(Object.entries(stored).map(([k, v]) => [k, { value: v.value, locked: v.locked }]));
  const all = checkResponse(model, values, response.created_at);
  const failed = sharedOnly(all, definition, items);
  if (failed.length) return { failed };
  const now = new Date().toISOString();
  if (!all.length && response.state !== "done") {
    await db.from("form_responses").update({ state: "done", done_at: now, active_redirect: null }).eq("id", response.id).eq("project_id", share.projectId);
    await db.from("form_response_events").insert({
      response_id: response.id, action: "state_changed", actor_id: null, provenance: "webapp", payload: { state: "done", external: share.email },
    });
  }
  await db.from("form_shares").update({ responded_at: now }).eq("id", share.id);
  return { failed: [] };
}

