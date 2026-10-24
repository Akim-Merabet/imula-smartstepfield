import { describe, expect, it } from "vitest";
import {
  expectedNatures, indexProgress, isStepEmpty, missingMandatory, numberItems, phaseChip, sequenceBlockers, stepChip,
  stepCounters, type FlowProgressData, type SequencingData,
} from "./index";

const flow = {
  simplified_signature_mode: 0,
  supervision_intern_1: 0, supervision_intern_2: 0, supervision_intern_3: 0,
  supervision_extern_1: 0, supervision_extern_2: 0, supervision_extern_3: 0,
  internal_supervisor_name_1: null, internal_supervisor_name_2: null, internal_supervisor_name_3: null,
  external_supervisor_name_1: null, external_supervisor_name_2: null, external_supervisor_name_3: null,
};
const dsi = (block_id: string, extra = {}) => ({
  block_id, signatories_status: "required", technical_control: 1,
  breakpoint_int_1: 0, breakpoint_int_2: 0, breakpoint_int_3: 0, convocation_int_1: 0, convocation_int_2: 0, convocation_int_3: 0,
  breakpoint_ext_1: 0, breakpoint_ext_2: 0, breakpoint_ext_3: 0, convocation_ext_1: 0, convocation_ext_2: 0, convocation_ext_3: 0,
  ...extra,
});

function data(over: Partial<FlowProgressData> = {}): FlowProgressData {
  return {
    flow,
    blocks: [
      { id: "b1", step_id: "s1", type: "dsi", enabled: 1 },
      { id: "b2", step_id: "s2", type: "form", enabled: 1 },
      { id: "b3", step_id: "s3", type: "txt", enabled: 1, txt_visibility: "document" },
    ],
    dsiConfigs: [dsi("b1")],
    signatures: [],
    multiPrItems: [],
    multiPrSignatures: [],
    formLinks: [{ id: "l1", block_id: "b2", enabled: 1, mandatory: 1 }],
    responses: [],
    ...over,
  };
}

const phase = (id: string, position: number, extra = {}) => ({
  id, position, sequence_id: null, sequence_type: "linear", mandatory: 1, disabled: 0, custom_number: null, exclude_numbering: 0, ...extra,
});
const step = (id: string, phase_id: string, position: number, extra = {}) => ({
  id, phase_id, position, disabled: 0, custom_number: null, exclude_numbering: 0, ...extra,
});

describe("natures attendues", () => {
  it("SQLite (0/1) : R + CT, pas de surveillance en mode simplifié", () => {
    expect(expectedNatures(dsi("b", { breakpoint_int_1: 1 }), flow)).toEqual(["realisation", "tech_control", "breakpoint_int_1"]);
    expect(expectedNatures(dsi("b", { breakpoint_int_1: 1 }), { ...flow, simplified_signature_mode: 1 })).toEqual(["realisation", "tech_control"]);
    expect(expectedNatures({ ...dsi("b"), signatories_status: "disabled" }, flow)).toEqual([]);
  });
});

describe("obligatoires, compteurs, pastilles", () => {
  it("détecte les signatures et formulaires manquants", () => {
    const ix = indexProgress(data());
    expect(missingMandatory("s1", ix)).toEqual(["dsi"]);
    expect(missingMandatory("s2", ix)).toEqual(["form"]);
    const done = indexProgress(data({
      signatures: [
        { block_id: "b1", nature: "realisation", state: "signed", disabled: 0 },
        { block_id: "b1", nature: "tech_control", state: "not_possible", disabled: 0 },
      ],
      responses: [{ block_link_id: "l1", deleted_at: null }],
    }));
    expect(missingMandatory("s1", done)).toEqual([]);
    expect(missingMandatory("s2", done)).toEqual([]);
    expect(stepCounters("s1", done)).toMatchObject({ expectedSignatureCount: 2, doneSignatureCount: 2 });
  });

  it("étape vide = uniquement des textes « document »", () => {
    const ix = indexProgress(data());
    expect(isStepEmpty("s3", ix)).toBe(true);
    expect(isStepEmpty("s1", ix)).toBe(false);
  });

  it("pastilles d'étape et de phase", () => {
    const zero = stepCounters("none", indexProgress(data()));
    expect(stepChip(step("a", "p", 1, { read_only_on_mobile_app: 1 }), zero)).toBe("none");
    expect(stepChip(step("a", "p", 1, { disabled: 1 }), zero)).toBe("disabled");
    expect(stepChip(step("a", "p", 1, { validated_at: "2026-01-01" }), zero)).toBe("green");
    expect(stepChip(step("a", "p", 1), zero)).toBe("not_opened");
    expect(stepChip(step("a", "p", 1, { first_opened_at: "x" }), zero)).toBe("blue");
    expect(stepChip(step("a", "p", 1, { first_opened_at: "x" }), { ...zero, pendingSignatureCount: 1 })).toBe("orange");
    expect(phaseChip({ disabled: 0 }, ["green", "green", "none"])).toBe("green");
    expect(phaseChip({ disabled: 0 }, ["green", "blue"])).toBe("orange");
    expect(phaseChip({ disabled: 0 }, ["disabled"])).toBe("disabled");
  });
});

describe("séquencement (miroir de step_sequence_blockers)", () => {
  const seq = (over: Partial<SequencingData> = {}): SequencingData => ({
    phases: [phase("p1", 1), phase("p2", 2)],
    steps: [step("s1", "p1", 1), step("s2", "p2", 1), step("s3", "p2", 2)],
    sequences: [],
    defaultType: "linear",
    fillRestrictionsSkipped: false,
    ...over,
  });

  it("séquence linéaire : une phase obligatoire précédente incomplète bloque", () => {
    const ix = indexProgress(data());
    expect(sequenceBlockers("s2", seq(), ix)).toEqual(["s1"]);
    expect(sequenceBlockers("s3", seq(), ix)).toEqual(["s1", "s2"]);
  });

  it("phase optionnelle, séquence parallèle, flow déverrouillé", () => {
    const ix = indexProgress(data());
    expect(sequenceBlockers("s2", seq({ phases: [phase("p1", 1, { mandatory: 0 }), phase("p2", 2)] }), ix)).toEqual([]);
    expect(sequenceBlockers("s2", seq({ defaultType: "parallel" }), ix)).toEqual([]);
    expect(sequenceBlockers("s3", seq({ fillRestrictionsSkipped: true }), ix)).toEqual([]);
  });

  it("séquences successives : la séquence précédente doit être complète", () => {
    const ix = indexProgress(data());
    const s = seq({
      defaultType: "parallel",
      sequences: [{ id: "q1", position: 1, type: "parallel" }, { id: "q2", position: 2, type: "parallel" }],
      phases: [phase("p1", 1, { sequence_id: "q1", sequence_type: "parallel" }), phase("p2", 2, { sequence_id: "q2", sequence_type: "parallel" })],
    });
    expect(sequenceBlockers("s2", s, ix)).toEqual(["s1"]);
  });
});

describe("numérotation", () => {
  it("ignore les éléments exclus et garde les numéros personnalisés", () => {
    const m = numberItems([
      { id: "a", custom_number: null, exclude_numbering: 0 },
      { id: "b", custom_number: null, exclude_numbering: 1 },
      { id: "c", custom_number: "X", exclude_numbering: 0 },
      { id: "d", custom_number: null, exclude_numbering: 0 },
    ], "P");
    expect([...m.values()]).toEqual(["P1", "—", "X", "P3"]);
  });
});
