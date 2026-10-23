/**
 * Modèle client/serveur du builder : lignes relationnelles + helpers de positions (RxQyOz).
 * Aucun import serveur : utilisable dans les composants clients et les server actions.
 */
import type { Tables } from "@/lib/supabase/database.types";

export type BRubric = Tables<"form_rubrics">;
export type BQuestion = Tables<"form_questions">;
export type BOption = Tables<"form_options">;
export type BSlot = Tables<"form_signatory_slots">;
export type BFile = Tables<"form_files">;
export type BForm = Tables<"forms">;

export type BuilderStructure = {
  rubrics: BRubric[];
  questions: BQuestion[];
  options: BOption[];
  slots: BSlot[];
  files: BFile[];
};

const byPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

export function rubricsOf(s: BuilderStructure) {
  return [...s.rubrics].sort(byPos);
}
export function questionsOf(s: BuilderStructure, rubricId: string) {
  return s.questions.filter((q) => q.rubric_id === rubricId).sort(byPos);
}
export function optionsOf(s: BuilderStructure, questionId: string) {
  return s.options.filter((o) => o.question_id === questionId).sort(byPos);
}
export function slotsOf(s: BuilderStructure, questionId: string) {
  return s.slots.filter((o) => o.question_id === questionId).sort(byPos);
}
/** Nombre de cellules (options ou signataires) d'une question. */
export function cellCount(s: BuilderStructure, q: BQuestion) {
  return q.type === "collaborator" ? slotsOf(s, q.id).length : optionsOf(s, q.id).length;
}

export type PositionIndex = {
  /** "r.q.o" → lineage_id de l'option (ou du signataire). */
  lineageAt: Map<string, string>;
  /** id d'option/signataire → position {r,q,o}. */
  positionOf: Map<string, { r: number; q: number; o: number }>;
  rubricPos: Map<string, number>;
  questionPos: Map<string, number>;
};

/** Positions 1-based dans l'ordre d'affichage (identifiants RxQyOz). */
export function indexPositions(s: BuilderStructure): PositionIndex {
  const lineageAt = new Map<string, string>();
  const positionOf = new Map<string, { r: number; q: number; o: number }>();
  const rubricPos = new Map<string, number>();
  const questionPos = new Map<string, number>();
  rubricsOf(s).forEach((r, ri) => {
    rubricPos.set(r.id, ri + 1);
    questionsOf(s, r.id).forEach((q, qi) => {
      questionPos.set(q.id, qi + 1);
      const cells: { id: string; lineage_id: string }[] = q.type === "collaborator" ? slotsOf(s, q.id) : optionsOf(s, q.id);
      cells.forEach((o, oi) => {
        const pos = { r: ri + 1, q: qi + 1, o: oi + 1 };
        lineageAt.set(`${pos.r}.${pos.q}.${pos.o}`, o.lineage_id);
        positionOf.set(o.id, pos);
      });
    });
  });
  return { lineageAt, positionOf, rubricPos, questionPos };
}

export const coordLabel = (p: { r: number; q: number; o: number }) => `R${p.r}Q${p.q}O${p.o}`;

/** Champs de paramétrage d'option copiés par « Paramétrer en masse » / unification. */
export const OPTION_PARAM_FIELDS = [
  "description", "placeholder", "choices", "unit", "value_hint", "formula", "formula_refs", "frozen", "prefill", "validation",
  "alert", "redirect_rubric_id", "redirect_question_id", "xls_export", "photo_size",
] as const;
