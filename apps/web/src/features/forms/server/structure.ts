import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/lib/supabase/database.types";
import { coord } from "../meta";
import type {
  AlertDef, FileRef, FormDefinition, OptionDef, PrefillDef, QuestionDef, RubricDef, SignatorySlotDef, ValidationDef,
} from "../types";

type DB = SupabaseClient<Database>;
export type FormRow = Tables<"forms">;
export type RubricRow = Tables<"form_rubrics">;
export type QuestionRow = Tables<"form_questions">;
export type OptionRow = Tables<"form_options">;
export type SlotRow = Tables<"form_signatory_slots">;
export type FileRow = Tables<"form_files">;

export type FormStructure = {
  form: FormRow;
  rubrics: RubricRow[];
  questions: QuestionRow[];
  options: OptionRow[];
  slots: SlotRow[];
  files: FileRow[];
};

const byPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

/** Charge toute la structure relationnelle d'un formulaire (triée par positions). */
export async function loadFormStructure(supabase: DB, formId: string): Promise<FormStructure | null> {
  const { data: form } = await supabase.from("forms").select("*").eq("id", formId).maybeSingle();
  if (!form) return null;
  const [rubrics, questions, options, slots, files] = await Promise.all([
    supabase.from("form_rubrics").select("*").eq("form_id", formId).order("position"),
    supabase.from("form_questions").select("*").eq("form_id", formId).order("position"),
    supabase.from("form_options").select("*").eq("form_id", formId).order("position"),
    supabase.from("form_signatory_slots").select("*").eq("form_id", formId).order("position"),
    supabase.from("form_files").select("*").eq("form_id", formId).order("position"),
  ]);
  return {
    form,
    rubrics: (rubrics.data ?? []).sort(byPos),
    questions: (questions.data ?? []).sort(byPos),
    options: (options.data ?? []).sort(byPos),
    slots: (slots.data ?? []).sort(byPos),
    files: files.data ?? [],
  };
}

const u = <T,>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);
const filesOf = (files: FileRow[], ownerId: string): FileRef[] =>
  files.filter((f) => f.owner_id === ownerId).sort(byPos).map((f) => ({ fileId: f.storage_path, name: u(f.name), position: f.position }));

/** Sérialise la structure relationnelle en `FormDefinition` (spec 03 §11). */
export function buildDefinition(s: FormStructure, versionNo: number, family?: FormDefinition["family"]): FormDefinition {
  const rubricLineage = new Map(s.rubrics.map((r) => [r.id, r.lineage_id]));
  const questionLineage = new Map(s.questions.map((q) => [q.id, q.lineage_id]));
  const pdf = (s.form.pdf_template ?? null) as { enabled?: boolean; file_id?: string; page_number_x?: number; page_number_y?: number } | null;
  const rubrics: RubricDef[] = s.rubrics.map((r, ri) => {
    const rPos = ri + 1;
    const questions: QuestionDef[] = s.questions.filter((q) => q.rubric_id === r.id).map((q, qi) => {
      const qPos = qi + 1;
      const options: OptionDef[] = s.options.filter((o) => o.question_id === q.id).map((o, oi) => ({
        id: o.id, lineageId: o.lineage_id, position: oi + 1, coord: coord(rPos, qPos, oi + 1),
        code: u(o.code), name: u(o.name), optionName: u(o.option_name), description: u(o.description), placeholder: u(o.placeholder),
        choices: o.choices?.length ? o.choices : undefined, unit: u(o.unit), valueHint: u(o.value_hint),
        formula: o.formula ? { canonical: o.formula, refs: o.formula_refs ?? [] } : undefined,
        frozen: o.frozen,
        prefill: (o.prefill ?? undefined) as PrefillDef | undefined,
        validation: (o.validation ?? undefined) as ValidationDef | undefined,
        alert: (o.alert ?? undefined) as AlertDef | undefined,
        redirect: o.redirect_rubric_id && rubricLineage.get(o.redirect_rubric_id)
          ? { rubricLineageId: rubricLineage.get(o.redirect_rubric_id)!, questionLineageId: o.redirect_question_id ? questionLineage.get(o.redirect_question_id) : undefined }
          : undefined,
        exportKey: u(o.export_key), pdfFieldName: u(o.pdf_field_name),
        xls: o.xls_export ? { enabled: true, label: u(o.xls_label) } : undefined,
        photoSize: u(o.photo_size), images: filesOf(s.files, o.id),
      }));
      const signatories: SignatorySlotDef[] = s.slots.filter((sl) => sl.question_id === q.id).map((sl, si) => ({
        id: sl.id, lineageId: sl.lineage_id, position: si + 1, coord: coord(rPos, qPos, si + 1),
        name: u(sl.name), description: u(sl.description), disableSignature: sl.disable_signature,
        pdfFieldName: u(sl.pdf_field_name), xls: sl.xls_export ? { enabled: true, label: u(sl.xls_label) } : undefined,
      }));
      return {
        id: q.id, lineageId: q.lineage_id, position: qPos, type: q.type, name: q.name,
        description: u(q.description), additionalComment: u(q.additional_comment), additionalObservation: u(q.additional_observation),
        mandatory: q.mandatory, withObservation: q.with_observation, lockable: q.lockable, allowBackdating: q.allow_backdating,
        shared: q.shared, hideInPdf: q.hide_in_pdf, hideImagesBelowTable: q.hide_images_below_table, unifyCells: q.unify_cells,
        photoSize: u(q.photo_size), backgroundColor: u(q.background_color), icon: u(q.icon), objectAttributeId: u(q.object_attribute_id),
        images: filesOf(s.files, q.id), options: q.type === "collaborator" ? [] : options, signatories: q.type === "collaborator" ? signatories : [],
      };
    });
    return {
      id: r.id, lineageId: r.lineage_id, position: rPos, type: r.type, name: r.name,
      description: u(r.description), additionalComment: u(r.additional_comment), additionalObservation: u(r.additional_observation),
      hiddenInMobile: r.hidden_in_mobile, hideInPdf: r.hide_in_pdf, pdfLandscape: r.pdf_landscape,
      exportImagesInAppendix: r.export_images_in_appendix, allowAddRow: r.allow_add_row, allowAddColumn: r.allow_add_column,
      firstColumnHidden: r.first_column_hidden, importXlsxEnabled: r.import_xlsx_enabled,
      images: filesOf(s.files, r.id), questions,
    };
  });
  return {
    formId: s.form.id, lineageId: s.form.lineage_id, versionNo, nature: s.form.nature, name: s.form.name,
    reference: u(s.form.reference), indexLabel: u(s.form.index_label),
    additionalComment: u(s.form.additional_comment), additionalObservation: u(s.form.additional_observation),
    lockResponses: s.form.lock_responses, family,
    pdf: pdf?.enabled ? { templateFileId: pdf.file_id, pageNumberX: pdf.page_number_x, pageNumberY: pdf.page_number_y } : undefined,
    rubrics,
  };
}

export type VersionRow = Pick<Tables<"form_versions">, "id" | "version_no" | "structure_rev" | "structure" | "form_id">;

/**
 * Renvoie la version figée correspondant à la structure courante ; publie une nouvelle
 * `form_versions` si `structure_rev` a changé depuis la dernière publication.
 */
export async function ensureVersion(supabase: DB, formId: string, collaboratorId: string | null): Promise<VersionRow | null> {
  const { data: form } = await supabase.from("forms")
    .select("id, structure_rev, current_version_id, index_label, reference, sourced_from_form_id, location, family_id")
    .eq("id", formId).maybeSingle();
  if (!form) return null;
  const { data: existing } = await supabase.from("form_versions").select("id, version_no, structure_rev, structure, form_id")
    .eq("form_id", formId).eq("structure_rev", form.structure_rev).order("version_no", { ascending: false }).limit(1).maybeSingle();
  if (existing) {
    if (form.current_version_id !== existing.id) await supabase.from("forms").update({ current_version_id: existing.id }).eq("id", formId);
    return existing;
  }
  const structure = await loadFormStructure(supabase, formId);
  if (!structure) return null;
  let family: FormDefinition["family"];
  if (form.family_id) {
    const { data: fam } = await supabase.from("label_families").select("id, short_name, long_name, color").eq("id", form.family_id).maybeSingle();
    if (fam) family = { id: fam.id, shortName: fam.short_name, longName: u(fam.long_name), color: fam.color };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last } = await supabase.from("form_versions").select("version_no").eq("form_id", formId)
      .order("version_no", { ascending: false }).limit(1).maybeSingle();
    const versionNo = (last?.version_no ?? 0) + 1;
    const definition = buildDefinition(structure, versionNo, family);
    const { data, error } = await supabase.from("form_versions").insert({
      form_id: formId, version_no: versionNo, structure_rev: structure.form.structure_rev,
      index_label: form.index_label, reference: form.reference,
      library_form_id: form.location === "library" ? form.id : form.sourced_from_form_id,
      structure: definition as unknown as Json, created_by: collaboratorId,
    }).select("id, version_no, structure_rev, structure, form_id").single();
    if (data) {
      // Mise à jour best-effort (un opérateur n'a pas le droit d'écrire le formulaire).
      await supabase.from("forms").update({ current_version_id: data.id }).eq("id", formId);
      return data;
    }
    if (error?.code !== "23505") return null;
  }
  return null;
}

/**
 * Copie relationnelle de la structure d'un formulaire vers un autre (import, mise à jour, copie locale, duplication).
 * `keepLineage` : import / mise à jour (mêmes lineage_id) ; sinon nouveaux lineage_id (copie indépendante).
 */
export async function copyStructure(supabase: DB, source: FormStructure, targetFormId: string, keepLineage: boolean,
  opts: { skipObjectAttributes?: boolean } = {}): Promise<string | null> {
  const newId = () => crypto.randomUUID();
  const rubricIds = new Map<string, string>();
  const questionIds = new Map<string, string>();
  const optionIds = new Map<string, string>();
  const slotIds = new Map<string, string>();
  const lineage = new Map<string, string>();
  const lin = (old: string) => {
    if (keepLineage) return old;
    if (!lineage.has(old)) lineage.set(old, newId());
    return lineage.get(old)!;
  };

  const questions = opts.skipObjectAttributes ? source.questions.filter((q) => !q.object_attribute_id) : source.questions;
  const keptQuestionIds = new Set(questions.map((q) => q.id));

  const rubrics = source.rubrics.map(({ id, form_id, lineage_id, ...rest }) => {
    void form_id;
    const nid = newId(); rubricIds.set(id, nid);
    return { ...rest, id: nid, form_id: targetFormId, lineage_id: lin(lineage_id) };
  });
  const qRows = questions.map(({ id, form_id, rubric_id, lineage_id, ...rest }) => {
    void form_id;
    const nid = newId(); questionIds.set(id, nid);
    return { ...rest, id: nid, form_id: targetFormId, rubric_id: rubricIds.get(rubric_id)!, lineage_id: lin(lineage_id) };
  });
  // Renumérote les positions des questions si des questions ont été écartées.
  if (opts.skipObjectAttributes) {
    const perRubric = new Map<string, number>();
    for (const q of qRows.sort((a, b) => a.position - b.position)) {
      const n = (perRubric.get(q.rubric_id) ?? 0) + 1; perRubric.set(q.rubric_id, n); q.position = n;
    }
  }
  const oRows = source.options.filter((o) => keptQuestionIds.has(o.question_id)).map(({ id, form_id, question_id, lineage_id, ...rest }) => {
    void form_id;
    const nid = newId(); optionIds.set(id, nid);
    return {
      ...rest, id: nid, form_id: targetFormId, question_id: questionIds.get(question_id)!, lineage_id: lin(lineage_id),
      redirect_rubric_id: rest.redirect_rubric_id ? rubricIds.get(rest.redirect_rubric_id) ?? null : null,
      redirect_question_id: rest.redirect_question_id ? questionIds.get(rest.redirect_question_id) ?? null : null,
      formula_refs: (rest.formula_refs ?? []).map((r) => lin(r)),
    };
  });
  const sRows = source.slots.filter((s) => keptQuestionIds.has(s.question_id)).map(({ id, form_id, question_id, lineage_id, ...rest }) => {
    void form_id;
    const nid = newId(); slotIds.set(id, nid);
    return { ...rest, id: nid, form_id: targetFormId, question_id: questionIds.get(question_id)!, lineage_id: lin(lineage_id) };
  });
  const owner = (kind: string, id: string) =>
    kind === "rubric" ? rubricIds.get(id) : kind === "question" ? questionIds.get(id) : optionIds.get(id) ?? slotIds.get(id);
  const fRows = source.files.map(({ id, form_id, owner_id, owner_kind, ...rest }) => {
    void id; void form_id;
    return { ...rest, owner_kind, owner_id: owner(owner_kind, owner_id) ?? "", form_id: targetFormId };
  }).filter((f) => f.owner_id);

  const steps: [string, Record<string, unknown>[]][] = [
    ["form_rubrics", rubrics], ["form_questions", qRows], ["form_options", oRows], ["form_signatory_slots", sRows], ["form_files", fRows],
  ];
  for (const [table, rows] of steps) {
    if (!rows.length) continue;
    const { error } = await supabase.from(table as "form_rubrics").insert(rows as never);
    if (error) return error.code ?? "unknown";
  }
  return null;
}

/** Supprime toute la structure d'un formulaire (avant réimport « Mettre à jour »). */
export async function clearStructure(supabase: DB, formId: string) {
  await supabase.from("form_files").delete().eq("form_id", formId);
  const { error } = await supabase.from("form_rubrics").delete().eq("form_id", formId);
  return error;
}
