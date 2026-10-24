import { buildModel } from "@imula/forms-core/model";
import type { FormDefinition, OptionDef, QuestionDef } from "@imula/forms-core/types";
import { describe, expect, it } from "vitest";

import { bulkFillTargets, defaultReference, lockedChanges, rubricRows, tableItemRows } from "./form-response";

const opt = (lineageId: string, extra: Partial<OptionDef> = {}): OptionDef => ({ id: lineageId, lineageId, position: 1, coord: "", frozen: false, images: [], ...extra });
const question = (lineageId: string, type: QuestionDef["type"], options: OptionDef[], extra: Partial<QuestionDef> = {}): QuestionDef => ({
  id: lineageId, lineageId, position: 1, type, name: lineageId, mandatory: false, withObservation: true, lockable: false,
  allowBackdating: true, shared: false, hideInPdf: false, hideImagesBelowTable: false, unifyCells: false, images: [], options, signatories: [], ...extra,
});
const definition = (lockResponses = false): FormDefinition => ({
  formId: "f", lineageId: "f", versionNo: 1, nature: "generic", name: "F", lockResponses,
  rubrics: [{
    id: "r", lineageId: "r", position: 1, type: "question", name: "R", hiddenInMobile: false, hideInPdf: false, pdfLandscape: false,
    exportImagesInAppendix: false, allowAddRow: false, allowAddColumn: false, firstColumnHidden: false, importXlsxEnabled: false, images: [],
    questions: [
      question("longueur", "value_unit", [opt("l", { unit: "m" })]),
      question("double", "formula", [opt("d", { unit: "m", formula: { canonical: "$$R1Q1O1 * 2", refs: ["l"] } })]),
      question("nom", "short_answer", [opt("n")]),
    ],
  }],
});

function setup(lock = false) {
  const def = definition(lock);
  const model = buildModel(def, []);
  return { loaded: { model, definition: def, dynamicCtx: {}, locale: "fr" as const }, rubric: model.rubrics[0] };
}

describe("référence par défaut (spec 03 §6.2)", () => {
  it("contexte flow et contexte entité", () => {
    const now = new Date(2026, 9, 24);
    expect(defaultReference({ formReference: "FRM", indexLabel: "A", flowRef: "FL1", phaseNumber: "1", stepNumber: "2", count: 1, now, inFlow: true }))
      .toBe("FRM - A - FL1 - P1 - E2 - 24/10/2026 R2");
    expect(defaultReference({ formReference: "FRM", indexLabel: null, count: 0, now, inFlow: false })).toBe("FRM - 24/10/2026 - R1");
  });
});

describe("lignes d'une rubrique", () => {
  it("cellules modifiées, formule recalculée, observation sur la 1re cellule", () => {
    const { loaded, rubric } = setup();
    const rows = rubricRows(loaded, rubric, { l: { value: { value: 3, unit: "m" }, locked: false } }, {}, { longueur: "RAS" }, {});
    const byOpt = Object.fromEntries(rows.map((r) => [r.option_lineage_id, r]));
    expect(Object.keys(byOpt).sort()).toEqual(["d", "l"]);
    expect(JSON.parse(byOpt.d.value_json!)).toEqual({ result: 6, unit: "m" });
    expect(byOpt.l).toMatchObject({ value_number: 3, value_text: "m", observation: "RAS", coord: "R1Q1O1", locked: 0 });
  });

  it("valeur inchangée ignorée, valeur verrouillée non modifiable, verrouillage automatique", () => {
    const { loaded, rubric } = setup(true);
    const base = { n: { value: "A", locked: true } };
    expect(rubricRows(loaded, rubric, { n: { value: "B", locked: true } }, base, {}, {})).toEqual([]);
    const rows = rubricRows(loaded, rubric, { l: { value: { value: 1, unit: "m" }, locked: false } }, {}, {}, {});
    expect(rows.find((r) => r.option_lineage_id === "l")?.locked).toBe(1);
  });
});

describe("valeurs verrouillées", () => {
  it("question verrouillable : verrouillée à la sauvegarde ; modification après déverrouillage détectée", () => {
    const def = definition();
    def.rubrics[0].questions[2] = question("nom", "short_answer", [opt("n")], { lockable: true });
    const model = buildModel(def, []);
    const loaded = { model, definition: def, dynamicCtx: {}, locale: "fr" as const };
    const r = model.rubrics[0];
    const first = rubricRows(loaded, r, { n: { value: "A", locked: false } }, {}, {}, {});
    expect(first.find((x) => x.option_lineage_id === "n")?.locked).toBe(1);
    const base = { n: { value: "A", locked: true } };
    expect(rubricRows(loaded, r, { n: { value: "B", locked: true } }, base, {}, {})).toEqual([]);
    const unlockedRows = rubricRows(loaded, r, { n: { value: "B", locked: true } }, base, {}, {}, new Set(["nom"]));
    expect(unlockedRows.map((x) => x.option_lineage_id)).toEqual(["n"]);
    expect(lockedChanges(unlockedRows, base).length).toBe(1);
  });
});

describe("tableaux", () => {
  const tableDef = (type: "table_row" | "table_column"): FormDefinition => ({
    ...definition(),
    rubrics: [{
      ...definition().rubrics[0], type, allowAddRow: true, allowAddColumn: false,
      questions: [question("q1", "short_answer", [opt("a1"), opt("a2")]), question("q2", "date", [opt("b1"), opt("b2")])],
    }],
  });

  it("tableau par lignes : « Ajouter une ligne » copie la dernière ligne", () => {
    const model = buildModel(tableDef("table_row"), []);
    let n = 0;
    const rows = tableItemRows(model.rubrics[0], "row", [], "resp", () => `id${++n}`)!;
    expect(rows[0]).toMatchObject({ kind: "question", template_lineage_id: "q2", name: "q2 3" });
    expect(rows.slice(1).map((r) => r.template_lineage_id)).toEqual(["b1", "b2"]);
    expect(tableItemRows(model.rubrics[0], "column", [], "resp", () => "x")).toBeNull();
  });

  it("tableau par colonnes : une ligne = une cellule ajoutée à chaque question", () => {
    const model = buildModel(tableDef("table_column"), []);
    const rows = tableItemRows(model.rubrics[0], "row", [], "resp", () => "x")!;
    expect(rows.map((r) => [r.kind, r.parent_lineage_id, r.template_lineage_id])).toEqual([["option", "q1", "a2"], ["option", "q2", "b2"]]);
  });

  it("remplissage en masse : cellules vides et non verrouillées seulement", () => {
    const model = buildModel(tableDef("table_row"), []);
    const q1 = model.rubrics[0].questions[0];
    expect(bulkFillTargets(q1, { a1: { value: "déjà", locked: false } })).toEqual(["a2"]);
    expect(bulkFillTargets(q1, { a2: { value: null, locked: true } })).toEqual(["a1"]);
  });
});
