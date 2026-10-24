// Modèle de l'écran d'exécution (spec 05 §4) : lignes du flow lues dans la base locale, calculs partagés avec la
// WebApp (@imula/flow-core). Sans dépendance React : testable sur une base synchronisée.
import {
  type Chip, type FlowProgressData, indexProgress, isStepEmpty, type MandatoryKind, missingMandatory, numberItems, on,
  phaseChip, sequenceBlockers, type SequencingType, stepChip, stepCounters,
} from "@imula/flow-core";

import { named, type Query } from "./sql";

export type ExecFlow = FlowProgressData["flow"] & {
  id: string; project_id: string; flow_type: string; name: string; ref_int: string | null; ref_ext: string | null;
  fill_restrictions_skipped: number | null; status_name: string | null; status_color: string | null; default_sequence_type: string | null;
};
export type ExecPhase = {
  id: string; position: number; sequence_id: string | null; sequence_type: string | null; mandatory: number; disabled: number;
  read_only_on_mobile_app: number; custom_number: string | null; exclude_numbering: number; name: string;
  description: string | null; additional_comment: string | null; disabled_comment: string | null;
};
export type ExecStep = {
  id: string; phase_id: string; position: number; disabled: number; read_only_on_mobile_app: number;
  custom_number: string | null; exclude_numbering: number; name: string; description: string | null;
  additional_comment: string | null; disabled_comment: string | null; validated_at: string | null; first_opened_at: string | null;
};
export type ExecBlock = {
  id: string; step_id: string; flow_id: string; type: string; enabled: number; state: string | null; txt_visibility: string | null;
  content_html: string | null; content_json: string | null; multi_pr_requires_status: number; multi_pr_requires_signature: number;
  multi_pr_title_hidden: number;
};

export type ExecutionRows = {
  flow: ExecFlow[];
  phases: ExecPhase[];
  steps: ExecStep[];
  sequences: { id: string; position: number; type: string | null }[];
  blocks: ExecBlock[];
  dsiConfigs: FlowProgressData["dsiConfigs"];
  signatures: FlowProgressData["signatures"];
  multiPrItems: FlowProgressData["multiPrItems"];
  multiPrSignatures: FlowProgressData["multiPrSignatures"];
  formLinks: FlowProgressData["formLinks"];
  responses: FlowProgressData["responses"];
  /** Étapes déverrouillées une à une sur la WebApp (step_fill_unlocks). */
  stepUnlocks: { step_id: string }[];
};

/** Requêtes nommées de l'écran d'exécution, une par jeu de lignes. */
export function executionQueries(flowId: string): Record<keyof ExecutionRows, Query> {
  const p = { flow: flowId };
  return {
    flow: named(`select f.*, s.name as status_name, s.color as status_color, a.default_sequence_type
                   from flows f left join custom_statuses s on s.id = f.custom_status_id
                   left join accounts a on a.id = f.account_id where f.id = :flow`, p),
    phases: named("select * from phases where flow_id = :flow order by position", p),
    steps: named("select * from steps where flow_id = :flow order by position", p),
    sequences: named("select id, position, type from sequences where flow_id = :flow order by position", p),
    blocks: named("select * from blocks where flow_id = :flow", p),
    dsiConfigs: named("select * from block_dsi_configs where flow_id = :flow", p),
    signatures: named("select block_id, nature, state, disabled from signatures where flow_id = :flow", p),
    multiPrItems: named("select id, block_id, disabled, custom_status_id from block_multi_pr_items where flow_id = :flow", p),
    multiPrSignatures: named("select item_id from block_multi_pr_signatures where flow_id = :flow", p),
    formLinks: named("select id, block_id, enabled, mandatory from form_block_links where flow_id = :flow", p),
    responses: named("select block_link_id, deleted_at from form_responses where flow_id = :flow", p),
    stepUnlocks: named("select step_id from step_fill_unlocks where flow_id = :flow", p),
  };
}

export type StepView = ExecStep & {
  number: string;
  chip: Chip;
  empty: boolean;
  blockers: string[];
  missing: MandatoryKind[];
};
export type PhaseView = ExecPhase & { number: string; chip: Chip; steps: StepView[] };

export type ExecutionModel = {
  flow: ExecFlow;
  phases: PhaseView[];
  /** Étapes navigables, dans l'ordre (les étapes vides sont ignorées, spec 05 §4.1). */
  order: StepView[];
  stepById: Map<string, StepView>;
  /** Validation d'étape possible pour ce type de flow (pas de validation pour un flow générique ou sans phase). */
  validationEnabled: boolean;
};

export function buildExecutionModel(rows: ExecutionRows): ExecutionModel | null {
  const flow = rows.flow[0];
  if (!flow) return null;
  const ix = indexProgress({
    flow, blocks: rows.blocks, dsiConfigs: rows.dsiConfigs, signatures: rows.signatures, multiPrItems: rows.multiPrItems,
    multiPrSignatures: rows.multiPrSignatures, formLinks: rows.formLinks, responses: rows.responses,
  });
  const sequencing = {
    phases: rows.phases, steps: rows.steps, sequences: rows.sequences,
    defaultType: (flow.default_sequence_type ?? "linear") as SequencingType,
    fillRestrictionsSkipped: on(flow.fill_restrictions_skipped),
    unlockedStepIds: new Set(rows.stepUnlocks.map((u) => u.step_id)),
  };
  const phaseNumbers = numberItems(rows.phases, "");
  const phases: PhaseView[] = rows.phases.map((ph) => {
    const own = rows.steps.filter((s) => s.phase_id === ph.id);
    const stepNumbers = numberItems(own, "");
    const steps = own.map((s): StepView => ({
      ...s,
      number: stepNumbers.get(s.id)!,
      chip: stepChip(s, stepCounters(s.id, ix)),
      empty: isStepEmpty(s.id, ix),
      blockers: sequenceBlockers(s.id, sequencing, ix),
      missing: missingMandatory(s.id, ix),
    }));
    return { ...ph, number: phaseNumbers.get(ph.id)!, steps, chip: phaseChip(ph, steps.map((s) => s.chip)) };
  });
  const order = phases.flatMap((ph) => ph.steps.filter((s) => !s.empty));
  return {
    flow,
    phases,
    order,
    stepById: new Map(order.map((s) => [s.id, s])),
    validationEnabled: flow.flow_type !== "generic" && phases.length > 0,
  };
}

/** Message de validation refusée, par priorité (spec 05 §4.3). */
export function validationMessageKey(missing: MandatoryKind[]):
  "execution.requiredStatusesMsg" | "execution.requiredSignatureAndFormMsg" | "execution.requiredFormMsg" | "execution.requiredSignatureMsg" | null {
  if (missing.includes("multi_pr")) return "execution.requiredStatusesMsg";
  if (missing.includes("form") && missing.includes("dsi")) return "execution.requiredSignatureAndFormMsg";
  if (missing.includes("form")) return "execution.requiredFormMsg";
  if (missing.includes("dsi")) return "execution.requiredSignatureMsg";
  return null;
}
