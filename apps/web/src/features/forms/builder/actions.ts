"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Json, TablesInsert } from "@/lib/supabase/database.types";
import { extractReferences, toCanonical, validate, type NumberLocale } from "@/lib/formula/engine";
import { DATE_OPS, NUMBER_OPS, questionTypesFor, QUESTION_ICONS, SIZES } from "../meta";
import { canEditFormContent } from "../permissions";
import { ensureVersion, loadFormStructure } from "../server/structure";
import { cellCount, indexPositions, OPTION_PARAM_FIELDS, optionsOf, questionsOf, rubricsOf, slotsOf, type BOption, type BuilderStructure } from "./model";
import type { QuestionType, RubricType } from "../types";

type Supa = Awaited<ReturnType<typeof createClient>>;
const VALIDATION_OPS_ALL = [...new Set([...NUMBER_OPS, ...DATE_OPS])];

/** Session + droit d'édition du contenu (miroir UI de la RLS can_write_form). */
type Guarded = { supabase: Supa; form: { id: string; project_id: string | null; lock_responses: boolean }; session: NonNullable<Awaited<ReturnType<typeof getSession>>> };
async function guard(formId: string): Promise<Guarded | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthenticated" };
  const supabase = await createClient();
  const { data: form } = await supabase.from("forms")
    .select("id, location, nature, origin, project_id, lock_responses, deleted_at").eq("id", formId).maybeSingle();
  if (!form || form.deleted_at) return { error: "not_found" };
  let role = null;
  if (form.project_id) {
    const { data } = await supabase.from("project_members").select("role")
      .eq("project_id", form.project_id).eq("collaborator_id", session.collaborator.id).maybeSingle();
    role = data?.role ?? null;
  }
  if (!canEditFormContent(form, session.collaborator, role)) return { error: "forbidden" };
  return { supabase, form, session };
}

async function structure(supabase: Supa, formId: string): Promise<BuilderStructure> {
  const s = await loadFormStructure(supabase, formId);
  return s ?? { rubrics: [], questions: [], options: [], slots: [], files: [] };
}

const done = (formId: string) => revalidatePath(`/form/${formId}`);
const reorder = (supabase: Supa, table: string, ids: string[]) => supabase.rpc("form_reorder", { p_table: table, p_ids: ids });
const uuid = () => crypto.randomUUID();

function insertAfter(ids: string[], newId: string, afterId: string | null | undefined) {
  const list = ids.filter((x) => x !== newId);
  const idx = afterId ? list.indexOf(afterId) : -1;
  if (idx < 0) return [...list, newId];
  list.splice(idx + 1, 0, newId);
  return list;
}

async function names() {
  const t = await getTranslations("formBuilder.defaults");
  return {
    rubric: (n: number) => t("rubric", { n }), table: (n: number) => t("table", { n }),
    question: (n: number) => t("question", { n }), column: (n: number) => t("column", { n }), row: (n: number) => t("row", { n }),
    option: (n: number) => t("option", { n }), collaborator: (n: number) => t("collaborator", { n }),
  };
}

type Names = Awaited<ReturnType<typeof names>>;
const questionName = (n: Names, type: RubricType, i: number) => (type === "question" ? n.question(i) : type === "table_column" ? n.column(i) : n.row(i));
/** Libellé d'une cellule de 1re position (axe croisé). */
const crossName = (n: Names, type: RubricType, i: number) => (type === "table_column" ? n.row(i) : type === "table_row" ? n.column(i) : n.option(i));

function blankOption(formId: string, questionId: string, position: number, extra: Partial<TablesInsert<"form_options">> = {}): TablesInsert<"form_options"> {
  const id = uuid();
  return { id, lineage_id: id, form_id: formId, question_id: questionId, position, ...extra };
}
function blankSlot(formId: string, questionId: string, position: number, name: string): TablesInsert<"form_signatory_slots"> {
  const id = uuid();
  return { id, lineage_id: id, form_id: formId, question_id: questionId, position, name };
}
/** Copie des paramètres d'une option (sans identifiants ni valeurs uniques). */
function cloneOption(src: BOption, formId: string, questionId: string, position: number): TablesInsert<"form_options"> {
  const { id: _i, lineage_id: _l, question_id: _q, form_id: _f, position: _p, code: _c, pdf_field_name: _pdf, export_key: _e, ...rest } = src;
  void _i; void _l; void _q; void _f; void _p; void _c; void _pdf; void _e;
  return { ...blankOption(formId, questionId, position), ...rest };
}

/** Options par défaut d'une nouvelle question selon la nature (rubrique question). */
function defaultCellsCount(type: QuestionType) {
  return type === "unique_choice" || type === "multiple_choices" ? 2 : 1;
}

// =============================================================================================
// RUBRIQUES
// =============================================================================================
export async function addRubric(formId: string, type: RubricType, afterRubricId?: string | null): Promise<ActionResult<{ id: string }>> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { supabase } = g;
  const s = await structure(supabase, formId);
  const n = await names();
  const rubrics = rubricsOf(s);
  const rid = uuid();
  const count = rubrics.filter((r) => (type === "question") === (r.type === "question")).length + 1;
  const { error } = await supabase.from("form_rubrics").insert({
    id: rid, lineage_id: rid, form_id: formId, type, position: rubrics.length + 1,
    name: type === "question" ? n.rubric(count) : n.table(count),
  });
  if (error) return fail(dbError(error));
  const qid = uuid();
  await supabase.from("form_questions").insert({ id: qid, lineage_id: qid, form_id: formId, rubric_id: rid, position: 1, name: questionName(n, type, 1) });
  await supabase.from("form_options").insert(blankOption(formId, qid, 1, type === "question" ? {} : { option_name: crossName(n, type, 1) }));
  if (afterRubricId) await reorder(supabase, "form_rubrics", insertAfter(rubrics.map((r) => r.id), rid, afterRubricId));
  done(formId);
  return ok({ id: rid });
}

const optText = (max = 5000) => z.string().max(max).nullable().transform((v) => (v && v.trim() ? v : null));
const size = z.enum(SIZES as [string, ...string[]]).nullable();

const rubricPatch = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().max(255).nullable().transform((v) => (v && v.trim() ? v : null)),
  additional_comment: optText(), additional_observation: optText(),
  hidden_in_mobile: z.boolean(), hide_in_pdf: z.boolean(), pdf_landscape: z.boolean(), export_images_in_appendix: z.boolean(),
  attachment_width: size, attachment_height: size,
  allow_add_row: z.boolean(), allow_add_column: z.boolean(), first_column_hidden: z.boolean(), import_xlsx_enabled: z.boolean(),
}).partial();

export async function updateRubric(formId: string, rubricId: string, patch: z.input<typeof rubricPatch>): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const parsed = rubricPatch.safeParse(patch);
  if (!parsed.success) return fail(parsed.error.issues.some((i) => i.path[0] === "description") ? "description_too_long" : "invalid");
  const { error } = await g.supabase.from("form_rubrics").update(parsed.data as never).eq("id", rubricId).eq("form_id", formId);
  if (error) return fail(dbError(error));
  done(formId);
  return ok(undefined);
}

export async function deleteRubric(formId: string, rubricId: string): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { error } = await g.supabase.from("form_rubrics").delete().eq("id", rubricId).eq("form_id", formId);
  if (error) return fail(dbError(error));
  const s = await structure(g.supabase, formId);
  await reorder(g.supabase, "form_rubrics", rubricsOf(s).map((r) => r.id));
  done(formId);
  return ok(undefined);
}

export async function reorderRubrics(formId: string, ids: string[]): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { error } = await reorder(g.supabase, "form_rubrics", ids);
  if (error) return fail(dbError(error));
  done(formId);
  return ok(undefined);
}

/** Copie d'une rubrique (nouveaux lineage_id), insérée après la source. Les attributs d'objet ne sont pas dupliqués. */
export async function duplicateRubric(formId: string, rubricId: string): Promise<ActionResult<{ id: string }>> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { supabase } = g;
  const s = await structure(supabase, formId);
  const src = s.rubrics.find((r) => r.id === rubricId);
  if (!src) return fail("not_found");
  const t = await getTranslations("formBuilder");
  const rid = uuid();
  const { id: _i, lineage_id: _l, position: _p, ...rest } = src;
  void _i; void _l; void _p;
  const { error } = await supabase.from("form_rubrics").insert({
    ...rest, id: rid, lineage_id: rid, position: s.rubrics.length + 1, name: t("defaults.copyOf", { name: src.name }).slice(0, 255),
  });
  if (error) return fail(dbError(error));
  const qMap = new Map<string, string>();
  const questions = questionsOf(s, rubricId).filter((q) => !q.object_attribute_id);
  const qRows = questions.map((q, i) => {
    const nid = uuid(); qMap.set(q.id, nid);
    const { id: _a, lineage_id: _b, rubric_id: _c, position: _d, ...r } = q;
    void _a; void _b; void _c; void _d;
    return { ...r, id: nid, lineage_id: nid, rubric_id: rid, position: i + 1 };
  });
  if (qRows.length) await supabase.from("form_questions").insert(qRows);
  const oRows = questions.flatMap((q) => optionsOf(s, q.id).map((o) => {
    const row = cloneOption(o, formId, qMap.get(q.id)!, o.position);
    if (row.redirect_rubric_id === rubricId) row.redirect_rubric_id = rid;
    if (row.redirect_question_id && qMap.has(row.redirect_question_id)) row.redirect_question_id = qMap.get(row.redirect_question_id)!;
    return { ...row, name: o.name, option_name: o.option_name };
  }));
  if (oRows.length) await supabase.from("form_options").insert(oRows);
  const sRows = questions.flatMap((q) => slotsOf(s, q.id).map((sl) => {
    const { id: _a, lineage_id: _b, question_id: _c, pdf_field_name: _d, ...r } = sl;
    void _a; void _b; void _c; void _d;
    const nid = uuid();
    return { ...r, id: nid, lineage_id: nid, question_id: qMap.get(q.id)! };
  }));
  if (sRows.length) await supabase.from("form_signatory_slots").insert(sRows);
  await reorder(supabase, "form_rubrics", insertAfter(rubricsOf(s).map((r) => r.id), rid, rubricId));
  done(formId);
  return ok({ id: rid });
}

// =============================================================================================
// QUESTIONS
// =============================================================================================
export async function addQuestion(formId: string, rubricId: string, afterQuestionId?: string | null): Promise<ActionResult<{ id: string }>> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { supabase } = g;
  const s = await structure(supabase, formId);
  const rubric = s.rubrics.find((r) => r.id === rubricId);
  if (!rubric) return fail("not_found");
  const n = await names();
  const questions = questionsOf(s, rubricId);
  const qid = uuid();
  if (rubric.type === "question") {
    const { error } = await supabase.from("form_questions").insert({
      id: qid, lineage_id: qid, form_id: formId, rubric_id: rubricId, position: questions.length + 1, name: n.question(questions.length + 1),
    });
    if (error) return fail(dbError(error));
    await supabase.from("form_options").insert(blankOption(formId, qid, 1));
  } else {
    // Tableau : nouvelle ligne/colonne du type de la précédente, avec le même nombre de cellules.
    const template = questions.find((q) => q.id === afterQuestionId) ?? questions[questions.length - 1];
    const { id: _a, lineage_id: _b, position: _c, name: _d, ...rest } = template;
    void _a; void _b; void _c; void _d;
    const { error } = await supabase.from("form_questions").insert({
      ...rest, id: qid, lineage_id: qid, position: questions.length + 1, name: questionName(n, rubric.type, questions.length + 1),
    });
    if (error) return fail(dbError(error));
    if (template.type === "collaborator") {
      const slots = slotsOf(s, template.id);
      await supabase.from("form_signatory_slots").insert(slots.map((sl, i) => ({ ...blankSlot(formId, qid, i + 1, sl.name ?? n.collaborator(i + 1)), disable_signature: sl.disable_signature })));
    } else {
      const opts = optionsOf(s, template.id);
      await supabase.from("form_options").insert(opts.map((o, i) => ({ ...cloneOption(o, formId, qid, i + 1), option_name: null, name: null })));
    }
  }
  await reorder(supabase, "form_questions", insertAfter(questions.map((q) => q.id), qid, afterQuestionId));
  done(formId);
  return ok({ id: qid });
}

const questionPatch = z.object({
  name: z.string().trim().min(1).max(500),
  description: optText(), additional_comment: optText(), additional_observation: optText(),
  mandatory: z.boolean(), with_observation: z.boolean(), lockable: z.boolean(), allow_backdating: z.boolean(),
  shared: z.boolean(), hide_in_pdf: z.boolean(), hide_images_below_table: z.boolean(),
  photo_size: size,
  background_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
  icon: z.enum(QUESTION_ICONS as unknown as [string, ...string[]]).nullable(),
}).partial();

export async function updateQuestion(formId: string, questionId: string, patch: z.input<typeof questionPatch>): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const parsed = questionPatch.safeParse(patch);
  if (!parsed.success) return fail("invalid");
  const { error } = await g.supabase.from("form_questions").update(parsed.data as never).eq("id", questionId).eq("form_id", formId);
  if (error) return fail(dbError(error));
  done(formId);
  return ok(undefined);
}

/** Change la nature d'une question : les options/signataires sont recréés (perte de données). */
export async function changeQuestionType(formId: string, questionId: string, type: QuestionType): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { supabase } = g;
  const s = await structure(supabase, formId);
  const q = s.questions.find((x) => x.id === questionId);
  const rubric = q && s.rubrics.find((r) => r.id === q.rubric_id);
  if (!q || !rubric) return fail("not_found");
  if (!questionTypesFor(rubric.type).includes(type)) return fail("type_not_allowed");
  const n = await names();
  const cells = rubric.type === "question" ? defaultCellsCount(type) : Math.max(1, cellCount(s, q));
  const oldOptions = optionsOf(s, q.id);
  await supabase.from("form_options").delete().eq("question_id", q.id);
  await supabase.from("form_signatory_slots").delete().eq("question_id", q.id);
  const { error } = await supabase.from("form_questions").update({
    type, mandatory: type === "text_editor" ? false : q.mandatory,
    allow_backdating: type === "date" || type === "datetime" ? q.allow_backdating : false,
    unify_cells: rubric.type === "question" ? false : q.unify_cells,
  }).eq("id", q.id);
  if (error) return fail(dbError(error));
  if (type === "collaborator") {
    await supabase.from("form_signatory_slots").insert(Array.from({ length: cells }, (_, i) => blankSlot(formId, q.id, i + 1, n.collaborator(i + 1))));
  } else {
    await supabase.from("form_options").insert(Array.from({ length: cells }, (_, i) => blankOption(formId, q.id, i + 1, {
      option_name: rubric.type !== "question" ? oldOptions[i]?.option_name ?? null : null,
      name: rubric.type === "question" && (type === "unique_choice" || type === "multiple_choices" || type === "multiple_answers") ? n.option(i + 1) : null,
    })));
  }
  done(formId);
  return ok(undefined);
}

export async function deleteQuestion(formId: string, questionId: string): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { supabase } = g;
  const s = await structure(supabase, formId);
  const q = s.questions.find((x) => x.id === questionId);
  if (!q) return fail("not_found");
  const rubric = s.rubrics.find((r) => r.id === q.rubric_id)!;
  const siblings = questionsOf(s, q.rubric_id);
  if (siblings.length <= 1) return fail(rubric.type === "question" ? "last_question" : rubric.type === "table_column" ? "last_column" : "last_row");
  const { error } = await supabase.from("form_questions").delete().eq("id", questionId);
  if (error) return fail(dbError(error));
  await reorder(supabase, "form_questions", siblings.filter((x) => x.id !== questionId).map((x) => x.id));
  done(formId);
  return ok(undefined);
}

export async function duplicateQuestion(formId: string, questionId: string): Promise<ActionResult<{ id: string }>> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { supabase } = g;
  const s = await structure(supabase, formId);
  const q = s.questions.find((x) => x.id === questionId);
  if (!q) return fail("not_found");
  const t = await getTranslations("formBuilder");
  const siblings = questionsOf(s, q.rubric_id);
  const qid = uuid();
  const { id: _a, lineage_id: _b, position: _c, object_attribute_id: _d, ...rest } = q;
  void _a; void _b; void _c; void _d;
  const { error } = await supabase.from("form_questions").insert({
    ...rest, id: qid, lineage_id: qid, position: siblings.length + 1, name: t("defaults.copyOf", { name: q.name }).slice(0, 500),
  });
  if (error) return fail(dbError(error));
  const opts = optionsOf(s, q.id);
  if (opts.length) await supabase.from("form_options").insert(opts.map((o) => ({ ...cloneOption(o, formId, qid, o.position), name: o.name, option_name: null })));
  const slots = slotsOf(s, q.id);
  if (slots.length) {
    await supabase.from("form_signatory_slots").insert(slots.map((sl) => ({
      ...blankSlot(formId, qid, sl.position, sl.name ?? ""), description: sl.description, disable_signature: sl.disable_signature,
      xls_export: sl.xls_export, xls_label: sl.xls_label,
    })));
  }
  await reorder(supabase, "form_questions", insertAfter(siblings.map((x) => x.id), qid, questionId));
  done(formId);
  return ok({ id: qid });
}

export async function reorderQuestions(formId: string, rubricId: string, ids: string[]): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const s = await structure(g.supabase, formId);
  const current = new Set(questionsOf(s, rubricId).map((q) => q.id));
  if (ids.length !== current.size || ids.some((id) => !current.has(id))) return fail("invalid");
  const { error } = await reorder(g.supabase, "form_questions", ids);
  if (error) return fail(dbError(error));
  done(formId);
  return ok(undefined);
}

/** Déplace une question vers une autre rubrique question (interdit vers/depuis un tableau). */
export async function moveQuestion(formId: string, questionId: string, targetRubricId: string, beforeQuestionId: string | null): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { supabase } = g;
  const s = await structure(supabase, formId);
  const q = s.questions.find((x) => x.id === questionId);
  const source = q && s.rubrics.find((r) => r.id === q.rubric_id);
  const target = s.rubrics.find((r) => r.id === targetRubricId);
  if (!q || !source || !target) return fail("not_found");
  if (target.type !== "question" || source.type !== "question") return fail("table_target");
  const targetIds = questionsOf(s, targetRubricId).map((x) => x.id).filter((x) => x !== questionId);
  if (source.id !== target.id) {
    const sourceIds = questionsOf(s, source.id).map((x) => x.id).filter((x) => x !== questionId);
    if (sourceIds.length === 0) return fail("last_question");
    const maxPos = Math.max(0, ...questionsOf(s, targetRubricId).map((x) => x.position));
    const { error } = await supabase.from("form_questions").update({ rubric_id: targetRubricId, position: maxPos + 1 }).eq("id", questionId);
    if (error) return fail(dbError(error));
    await reorder(supabase, "form_questions", sourceIds);
  }
  const idx = beforeQuestionId ? targetIds.indexOf(beforeQuestionId) : -1;
  const ordered = idx < 0 ? [...targetIds, questionId] : [...targetIds.slice(0, idx), questionId, ...targetIds.slice(idx)];
  await reorder(supabase, "form_questions", ordered);
  done(formId);
  return ok(undefined);
}

/** Unifier / diviser les cellules : les paramètres de la 1re cellule sont appliqués aux autres. */
export async function setUnifyCells(formId: string, questionId: string, unify: boolean): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { supabase } = g;
  const s = await structure(supabase, formId);
  const opts = s.options.filter((o) => o.question_id === questionId).sort((a, b) => a.position - b.position);
  if (opts.length > 1) {
    const r = await applyParams(supabase, s, opts[0], opts.slice(1));
    if (r) return fail(r);
  }
  const { error } = await supabase.from("form_questions").update({ unify_cells: unify }).eq("id", questionId).eq("form_id", formId);
  if (error) return fail(dbError(error));
  done(formId);
  return ok(undefined);
}

/** « Paramétrer en masse » : copie le paramétrage d'une option sur toutes les options de la question. */
export async function applyGenericParams(formId: string, questionId: string, sourceOptionId: string): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const s = await structure(g.supabase, formId);
  const opts = s.options.filter((o) => o.question_id === questionId);
  const src = opts.find((o) => o.id === sourceOptionId);
  if (!src) return fail("not_found");
  const r = await applyParams(g.supabase, s, src, opts.filter((o) => o.id !== src.id));
  if (r) return fail(r);
  done(formId);
  return ok(undefined);
}

async function applyParams(supabase: Supa, s: BuilderStructure, src: BOption, targets: BOption[]): Promise<string | null> {
  const patch = Object.fromEntries(OPTION_PARAM_FIELDS.map((k) => [k, src[k]])) as Partial<BOption>;
  const idx = indexPositions(s);
  for (const o of targets) {
    const row = { ...patch };
    // Les références relatives (OJ…) se recalculent par cellule.
    if (src.formula) row.formula_refs = refsFor(src.formula, idx, idx.positionOf.get(o.id));
    const { error } = await supabase.from("form_options").update(row as never).eq("id", o.id);
    if (error) return dbError(error);
  }
  return null;
}

function refsFor(canonical: string, idx: ReturnType<typeof indexPositions>, pos?: { r: number; q: number; o: number }) {
  return extractReferences(canonical, pos).map((p) => idx.lineageAt.get(`${p.r}.${p.q}.${p.o}`)).filter((x): x is string => !!x);
}

// =============================================================================================
// OPTIONS / CELLULES
// =============================================================================================
/** Ajoute une option (rubrique question) ou un signataire (question « collaborateur »). */
export async function addOption(formId: string, questionId: string): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { supabase } = g;
  const s = await structure(supabase, formId);
  const q = s.questions.find((x) => x.id === questionId);
  if (!q) return fail("not_found");
  const n = await names();
  if (q.type === "collaborator") {
    const count = slotsOf(s, q.id).length;
    const { error } = await supabase.from("form_signatory_slots").insert(blankSlot(formId, q.id, count + 1, n.collaborator(count + 1)));
    if (error) return fail(dbError(error));
  } else {
    const opts = optionsOf(s, q.id);
    const last = opts[opts.length - 1];
    const row = last && q.type === "value_unit" ? { ...cloneOption(last, formId, q.id, opts.length + 1), name: null } : blankOption(formId, q.id, opts.length + 1);
    if (q.type !== "value_unit") row.name = n.option(opts.length + 1);
    const { error } = await supabase.from("form_options").insert(row);
    if (error) return fail(dbError(error));
  }
  done(formId);
  return ok(undefined);
}

const prefillSchema = z.object({ mode: z.enum(["static", "dynamic"]), value: z.unknown().optional(), variable: z.string().optional() }).nullable();
const validationSchema = z.object({
  op: z.enum(VALIDATION_OPS_ALL as [string, ...string[]]), min: z.string().optional(), max: z.string().optional(),
  message: z.string().max(500).optional(), block: z.boolean(),
}).nullable();
const alertSchema = z.object({ type: z.enum(["error", "warning", "info", "trace"]), text: z.string().max(1000) }).nullable();

const optionPatch = z.object({
  name: optText(500), option_name: optText(500), description: optText(), placeholder: optText(500),
  choices: z.array(z.string().trim().min(1)).max(500),
  unit: z.string().max(20).nullable().transform((v) => (v && v.trim() ? v : null)),
  value_hint: optText(500),
  frozen: z.boolean(), prefill: prefillSchema, validation: validationSchema, alert: alertSchema,
  redirect_rubric_id: z.uuid().nullable(), redirect_question_id: z.uuid().nullable(),
  export_key: z.string().nullable().transform((v) => (v ? v : null)),
  pdf_field_name: optText(255), xls_export: z.boolean(), xls_label: optText(255),
  photo_size: size, code: z.string().trim().max(64).nullable().transform((v) => (v ? v : null)),
}).partial();

/**
 * Met à jour une option. `formula` est fournie au format utilisateur (`locale`) : validée puis stockée
 * en forme canonique avec `formula_refs` (lineage_id des options référencées).
 * Cellules unifiées : le paramétrage est propagé à toutes les cellules de la question.
 */
export async function updateOption(formId: string, optionId: string, patch: z.input<typeof optionPatch> & { formula?: string | null },
  locale: NumberLocale = "fr"): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { supabase } = g;
  const { formula, ...rest } = patch;
  const parsed = optionPatch.safeParse(rest);
  if (!parsed.success) return fail(parsed.error.issues.some((i) => i.path[0] === "unit") ? "unit_too_long" : "invalid");
  const row: Record<string, unknown> = { ...parsed.data };
  if (row.prefill !== undefined) row.prefill = row.prefill as Json;
  const s = await structure(supabase, formId);
  const option = s.options.find((o) => o.id === optionId);
  if (!option) return fail("not_found");
  const idx = indexPositions(s);
  if (formula !== undefined) {
    if (!formula || !formula.trim()) { row.formula = null; row.formula_refs = []; }
    else {
      const pos = idx.positionOf.get(optionId);
      const err = validate(formula, locale, { ctx: pos, exists: (p) => idx.lineageAt.has(`${p.r}.${p.q}.${p.o}`) });
      if (err) return fail(`formula_${err}`);
      const canonical = toCanonical(formula, locale);
      row.formula = canonical;
      row.formula_refs = refsFor(canonical, idx, pos);
    }
  }
  if (parsed.data.redirect_rubric_id === null) row.redirect_question_id = null;
  const { error } = await supabase.from("form_options").update(row as never).eq("id", optionId).eq("form_id", formId);
  if (error) {
    if (error.code === "23505") {
      const m = error.message ?? "";
      return fail(m.includes("pdf") ? "pdf_duplicate" : m.includes("export") ? "export_duplicate" : m.includes("code") ? "code_duplicate" : "duplicate");
    }
    return fail(dbError(error));
  }
  // Propagation aux cellules unifiées (tableau).
  const q = s.questions.find((x) => x.id === option.question_id);
  const rubric = q && s.rubrics.find((r) => r.id === q.rubric_id);
  if (q?.unify_cells && rubric && rubric.type !== "question") {
    const shared = Object.fromEntries(Object.entries(row).filter(([k]) => (OPTION_PARAM_FIELDS as readonly string[]).includes(k)));
    if (Object.keys(shared).length) {
      for (const o of optionsOf(s, q.id).filter((x) => x.id !== optionId)) {
        const r2 = { ...shared };
        if (typeof row.formula === "string") r2.formula_refs = refsFor(row.formula, idx, idx.positionOf.get(o.id));
        await supabase.from("form_options").update(r2 as never).eq("id", o.id);
      }
    }
  }
  done(formId);
  return ok(undefined);
}

export async function deleteOption(formId: string, optionId: string): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { supabase } = g;
  const s = await structure(supabase, formId);
  const o = s.options.find((x) => x.id === optionId);
  if (!o) return fail("not_found");
  const siblings = optionsOf(s, o.question_id);
  if (siblings.length <= 1) return fail("last_option");
  const { error } = await supabase.from("form_options").delete().eq("id", optionId);
  if (error) return fail(dbError(error));
  await reorder(supabase, "form_options", siblings.filter((x) => x.id !== optionId).map((x) => x.id));
  done(formId);
  return ok(undefined);
}

export async function duplicateOption(formId: string, optionId: string): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { supabase } = g;
  const s = await structure(supabase, formId);
  const o = s.options.find((x) => x.id === optionId);
  if (!o) return fail("not_found");
  const siblings = optionsOf(s, o.question_id);
  const row = { ...cloneOption(o, formId, o.question_id, siblings.length + 1), name: o.name, option_name: o.option_name };
  const { error } = await supabase.from("form_options").insert(row);
  if (error) return fail(dbError(error));
  await reorder(supabase, "form_options", insertAfter(siblings.map((x) => x.id), row.id!, optionId));
  done(formId);
  return ok(undefined);
}

export async function reorderOptions(formId: string, questionId: string, ids: string[], table: "form_options" | "form_signatory_slots" = "form_options"): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const s = await structure(g.supabase, formId);
  const current = new Set((table === "form_options" ? optionsOf(s, questionId) : slotsOf(s, questionId)).map((x) => x.id));
  if (ids.length !== current.size || ids.some((id) => !current.has(id))) return fail("invalid");
  const { error } = await reorder(g.supabase, table, ids);
  if (error) return fail(dbError(error));
  done(formId);
  return ok(undefined);
}

/** Tableau : ajoute une cellule à chaque question (ligne d'un tableau par colonnes / colonne d'un tableau par lignes). */
export async function addTableCell(formId: string, rubricId: string, afterPosition?: number | null, duplicate = false): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { supabase } = g;
  const s = await structure(supabase, formId);
  const rubric = s.rubrics.find((r) => r.id === rubricId);
  if (!rubric || rubric.type === "question") return fail("not_found");
  const n = await names();
  const questions = questionsOf(s, rubricId);
  const count = Math.max(0, ...questions.map((q) => cellCount(s, q)));
  if (duplicate && afterPosition && afterPosition >= count) return fail("last_cell");
  for (const [qi, q] of questions.entries()) {
    if (q.type === "collaborator") {
      const slots = slotsOf(s, q.id);
      const src = slots[(afterPosition ?? slots.length) - 1];
      const row = { ...blankSlot(formId, q.id, slots.length + 1, n.collaborator(slots.length + 1)), disable_signature: src?.disable_signature ?? false };
      await supabase.from("form_signatory_slots").insert(row);
      if (afterPosition) await reorder(supabase, "form_signatory_slots", insertAfter(slots.map((x) => x.id), row.id!, slots[afterPosition - 1]?.id));
      continue;
    }
    const opts = optionsOf(s, q.id);
    const src = opts[(afterPosition ?? opts.length) - 1];
    const row = src && (duplicate || q.unify_cells) ? cloneOption(src, formId, q.id, opts.length + 1) : blankOption(formId, q.id, opts.length + 1);
    row.option_name = qi === 0 ? (duplicate && src?.option_name ? src.option_name : crossName(n, rubric.type, opts.length + 1)) : null;
    if (!duplicate && src && !q.unify_cells) row.choices = src.choices;
    const { error } = await supabase.from("form_options").insert(row);
    if (error) return fail(dbError(error));
    if (afterPosition) await reorder(supabase, "form_options", insertAfter(opts.map((x) => x.id), row.id!, opts[afterPosition - 1]?.id));
  }
  done(formId);
  return ok(undefined);
}

/** Tableau : supprime la cellule n° `position` de chaque question. */
export async function deleteTableCell(formId: string, rubricId: string, position: number): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { supabase } = g;
  const s = await structure(supabase, formId);
  const rubric = s.rubrics.find((r) => r.id === rubricId);
  if (!rubric || rubric.type === "question") return fail("not_found");
  const questions = questionsOf(s, rubricId);
  if (Math.max(...questions.map((q) => cellCount(s, q))) <= 1) return fail(rubric.type === "table_column" ? "last_row" : "last_column");
  for (const q of questions) {
    const table = q.type === "collaborator" ? "form_signatory_slots" : "form_options";
    const cells = q.type === "collaborator" ? slotsOf(s, q.id) : optionsOf(s, q.id);
    const target = cells[position - 1];
    if (!target) continue;
    await supabase.from(table).delete().eq("id", target.id);
    await reorder(supabase, table, cells.filter((c) => c.id !== target.id).map((c) => c.id));
  }
  done(formId);
  return ok(undefined);
}

// =============================================================================================
// SIGNATAIRES
// =============================================================================================
const slotPatch = z.object({
  name: optText(255), description: optText(), disable_signature: z.boolean(), pdf_field_name: optText(255),
  xls_export: z.boolean(), xls_label: optText(255),
}).partial();

export async function updateSlot(formId: string, slotId: string, patch: z.input<typeof slotPatch>): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const parsed = slotPatch.safeParse(patch);
  if (!parsed.success) return fail("invalid");
  const { error } = await g.supabase.from("form_signatory_slots").update(parsed.data as never).eq("id", slotId).eq("form_id", formId);
  if (error) return fail(dbError(error));
  done(formId);
  return ok(undefined);
}

export async function deleteSlot(formId: string, slotId: string): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { supabase } = g;
  const s = await structure(supabase, formId);
  const sl = s.slots.find((x) => x.id === slotId);
  if (!sl) return fail("not_found");
  const siblings = slotsOf(s, sl.question_id);
  if (siblings.length <= 1) return fail("last_option");
  await supabase.from("form_signatory_slots").delete().eq("id", slotId);
  await reorder(supabase, "form_signatory_slots", siblings.filter((x) => x.id !== slotId).map((x) => x.id));
  done(formId);
  return ok(undefined);
}

// =============================================================================================
// FICHIERS (images du builder) — l'upload Storage est fait côté client (chemin forms/<formId>/…)
// =============================================================================================
export async function addFormFile(formId: string, ownerKind: "rubric" | "question" | "option", ownerId: string, storagePath: string, name: string): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  if (!storagePath.startsWith(`forms/${formId}/`)) return fail("invalid");
  const { count } = await g.supabase.from("form_files").select("id", { count: "exact", head: true }).eq("owner_id", ownerId);
  const { error } = await g.supabase.from("form_files").insert({ form_id: formId, owner_kind: ownerKind, owner_id: ownerId, storage_path: storagePath, name, position: (count ?? 0) + 1 });
  if (error) return fail(dbError(error));
  done(formId);
  return ok(undefined);
}

export async function deleteFormFile(formId: string, fileId: string): Promise<ActionResult> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const { data } = await g.supabase.from("form_files").select("storage_path").eq("id", fileId).eq("form_id", formId).maybeSingle();
  if (!data) return fail("not_found");
  await g.supabase.from("form_files").delete().eq("id", fileId);
  await g.supabase.storage.from("form-files").remove([data.storage_path]);
  done(formId);
  return ok(undefined);
}

// =============================================================================================
// VERSION
// =============================================================================================
/** Publie une version figée (`form_versions.structure`) si la structure a changé. */
export async function publishFormVersion(formId: string): Promise<ActionResult<{ versionNo: number }>> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error);
  const v = await ensureVersion(g.supabase, formId, g.session.collaborator.id);
  if (!v) return fail("version");
  done(formId);
  return ok({ versionNo: v.version_no });
}
