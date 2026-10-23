/**
 * Modèle d'exécution d'une réponse : structure de version + items ajoutés sur le terrain,
 * positions / coordonnées recalculées, accès aux définitions (gabarits pour les items dynamiques).
 * Logique pure, partagée client / serveur.
 */
import { VALUE_TYPE, coord, type ValueType } from "./meta";
import type {
  DynamicItem, FormDefinition, OptionDef, QuestionDef, QuestionType, RubricDef, SignatorySlotDef,
} from "./types";

/** Cellule de saisie = option, slot signataire ou item dynamique (clé de valeur = lineageId). */
export type RtCell = {
  lineageId: string;
  position: number;
  coord: string;
  opt?: OptionDef;
  slot?: SignatorySlotDef;
  dynamic: boolean;
  dynamicItemId?: string;
};

export type RtQuestion = {
  lineageId: string;
  position: number;
  def: QuestionDef;
  name: string;
  type: QuestionType;
  cells: RtCell[];
  dynamic: boolean;
  dynamicItemId?: string;
};

export type RtRubric = { def: RubricDef; position: number; questions: RtQuestion[] };
export type RtModel = {
  rubrics: RtRubric[];
  cellByLineage: Map<string, { rubric: RtRubric; question: RtQuestion; cell: RtCell }>;
  questionByLineage: Map<string, { rubric: RtRubric; question: RtQuestion }>;
  cellByCoord: Map<string, RtCell>;
};

export function buildModel(def: FormDefinition, items: DynamicItem[]): RtModel {
  const cellByLineage: RtModel["cellByLineage"] = new Map();
  const questionByLineage: RtModel["questionByLineage"] = new Map();
  const cellByCoord = new Map<string, RtCell>();

  const rubrics: RtRubric[] = def.rubrics.map((rd, ri) => {
    const rPos = ri + 1;
    const rItems = items.filter((i) => i.rubricLineageId === rd.lineageId);
    // Définitions de cellules disponibles comme gabarits (statiques puis dynamiques résolus).
    const optTemplates = new Map<string, { opt?: OptionDef; slot?: SignatorySlotDef }>();
    const qTemplates = new Map<string, QuestionDef>();
    for (const q of rd.questions) {
      qTemplates.set(q.lineageId, q);
      for (const o of q.options) optTemplates.set(o.lineageId, { opt: o });
      for (const s of q.signatories) optTemplates.set(s.lineageId, { slot: s });
    }
    const dynQuestions = rItems.filter((i) => i.kind === "question").sort((a, b) => a.position - b.position);
    for (const dq of dynQuestions) {
      const tpl = qTemplates.get(dq.templateLineageId);
      if (tpl) qTemplates.set(dq.lineageId, tpl);
    }
    const dynOptions = rItems.filter((i) => i.kind === "option").sort((a, b) => a.position - b.position);
    // Résolution itérative des gabarits d'options (un item peut dupliquer un item dynamique).
    for (let pass = 0; pass < 3; pass++) {
      for (const d of dynOptions) {
        if (!optTemplates.has(d.lineageId) && optTemplates.has(d.templateLineageId)) optTemplates.set(d.lineageId, optTemplates.get(d.templateLineageId)!);
      }
    }

    const qList: { lineageId: string; def: QuestionDef; name: string; dynamic: boolean; itemId?: string; staticCells: RtCell[] }[] = [
      ...rd.questions.map((q) => ({
        lineageId: q.lineageId, def: q, name: q.name, dynamic: false,
        staticCells: (q.type === "collaborator" ? q.signatories.map((s) => ({ lineageId: s.lineageId, slot: s }))
          : q.options.map((o) => ({ lineageId: o.lineageId, opt: o }))).map((c) => ({ ...c, position: 0, coord: "", dynamic: false })),
      })),
      ...dynQuestions.filter((dq) => qTemplates.has(dq.lineageId)).map((dq) => {
        const tpl = qTemplates.get(dq.lineageId)!;
        return { lineageId: dq.lineageId, def: tpl, name: dq.name ?? tpl.name, dynamic: true, itemId: dq.id, staticCells: [] as RtCell[] };
      }),
    ];

    const questions: RtQuestion[] = qList.map((q, qi) => {
      const qPos = qi + 1;
      const extra: RtCell[] = dynOptions.filter((d) => d.parentLineageId === q.lineageId && optTemplates.has(d.lineageId)).map((d) => ({
        lineageId: d.lineageId, ...optTemplates.get(d.lineageId)!, position: 0, coord: "", dynamic: true, dynamicItemId: d.id,
      }));
      const cells = [...q.staticCells, ...extra].map((c, ci) => ({ ...c, position: ci + 1, coord: coord(rPos, qPos, ci + 1) }));
      return { lineageId: q.lineageId, position: qPos, def: q.def, name: q.name, type: q.def.type, cells, dynamic: q.dynamic, dynamicItemId: q.itemId };
    });
    return { def: rd, position: rPos, questions };
  });

  for (const rubric of rubrics) {
    for (const question of rubric.questions) {
      questionByLineage.set(question.lineageId, { rubric, question });
      for (const cell of question.cells) {
        cellByLineage.set(cell.lineageId, { rubric, question, cell });
        cellByCoord.set(cell.coord, cell);
      }
    }
  }
  return { rubrics, cellByLineage, questionByLineage, cellByCoord };
}

export const valueTypeOf = (t: QuestionType): ValueType => VALUE_TYPE[t];

/** Nombre de lignes / colonnes d'un tableau (toutes les questions ont le même nombre de cellules). */
export function tableSize(r: RtRubric) {
  return Math.max(0, ...r.questions.map((q) => q.cells.length));
}

/** Libellé d'en-tête d'une cellule de tableau (1re question : option_name / name). */
export function cellHeader(r: RtRubric, index: number): string | undefined {
  const first = r.questions[0]?.cells[index];
  return first?.opt?.optionName || first?.opt?.name || first?.slot?.name || undefined;
}
