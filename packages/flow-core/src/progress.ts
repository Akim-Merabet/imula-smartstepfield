// Avancement d'un flow calculé à partir de ses lignes (WebApp ou base locale de l'app terrain) :
// éléments obligatoires manquants (miroir de private.step_missing_mandatory), compteurs et pastilles (spec 05 §4.2).
import { expectedNatures } from "./natures";
import {
  type BlockRow, type Bool, type DsiConfig, on, type SignatureNature, type SignatureState, type StepRow, type SupervisionFlow,
} from "./types";

export type FlowProgressData = {
  flow: SupervisionFlow;
  blocks: BlockRow[];
  dsiConfigs: DsiConfig[];
  signatures: { block_id: string | null; nature: SignatureNature | string; state: SignatureState | string; disabled: Bool }[];
  multiPrItems: { id: string; block_id: string; disabled: Bool; custom_status_id: string | null }[];
  multiPrSignatures: { item_id: string }[];
  formLinks: { id: string; block_id: string | null; enabled: Bool; mandatory: Bool }[];
  responses: { block_link_id: string | null; deleted_at?: string | null }[];
};

export type MandatoryKind = "dsi" | "multi_pr" | "form";

export type StepCounters = {
  expectedSignatureCount: number;
  doneSignatureCount: number;
  pendingSignatureCount: number;
  multiPrStatusDoneCount: number;
  mandatoryFormCount: number;
  mandatoryFormWithResponseCount: number;
};

/** Index pour évaluer toutes les étapes d'un flow sans parcours répétés. */
export type FlowProgressIndex = ReturnType<typeof indexProgress>;

export function indexProgress(data: FlowProgressData) {
  const group = <T, K>(rows: T[], key: (r: T) => K) => {
    const m = new Map<K, T[]>();
    for (const r of rows) {
      const k = key(r);
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    return m;
  };
  return {
    flow: data.flow,
    blocksByStep: group(data.blocks.filter((b) => on(b.enabled)), (b) => b.step_id),
    dsiByBlock: new Map(data.dsiConfigs.map((c) => [c.block_id, c])),
    signaturesByBlock: group(data.signatures.filter((s) => !on(s.disabled)), (s) => s.block_id),
    itemsByBlock: group(data.multiPrItems.filter((i) => !on(i.disabled)), (i) => i.block_id),
    signedItems: new Set(data.multiPrSignatures.map((s) => s.item_id)),
    linksByBlock: group(data.formLinks.filter((l) => on(l.enabled)), (l) => l.block_id),
    answeredLinks: new Set(data.responses.filter((r) => !r.deleted_at).map((r) => r.block_link_id)),
  };
}

/** Éléments obligatoires non satisfaits d'une étape (même règle que le serveur). */
export function missingMandatory(stepId: string, ix: FlowProgressIndex): MandatoryKind[] {
  const out: MandatoryKind[] = [];
  for (const b of ix.blocksByStep.get(stepId) ?? []) {
    if (b.type === "dsi") {
      const config = ix.dsiByBlock.get(b.id);
      if (config?.signatories_status !== "required") continue;
      const done = new Set((ix.signaturesByBlock.get(b.id) ?? [])
        .filter((s) => s.state === "signed" || s.state === "not_possible").map((s) => s.nature));
      if (expectedNatures(config, ix.flow).some((n) => !done.has(n))) out.push("dsi");
    } else if (b.type === "multi_pr") {
      const items = ix.itemsByBlock.get(b.id) ?? [];
      if ((on(b.multi_pr_requires_status) && items.some((i) => !i.custom_status_id))
        || (on(b.multi_pr_requires_signature) && items.some((i) => !ix.signedItems.has(i.id)))) out.push("multi_pr");
    } else if (b.type === "form") {
      if ((ix.linksByBlock.get(b.id) ?? []).some((l) => on(l.mandatory) && !ix.answeredLinks.has(l.id))) out.push("form");
    }
  }
  return out;
}

export function stepCounters(stepId: string, ix: FlowProgressIndex): StepCounters {
  const c: StepCounters = {
    expectedSignatureCount: 0, doneSignatureCount: 0, pendingSignatureCount: 0,
    multiPrStatusDoneCount: 0, mandatoryFormCount: 0, mandatoryFormWithResponseCount: 0,
  };
  for (const b of ix.blocksByStep.get(stepId) ?? []) {
    if (b.type === "dsi") {
      c.expectedSignatureCount += expectedNatures(ix.dsiByBlock.get(b.id), ix.flow).length;
      for (const s of ix.signaturesByBlock.get(b.id) ?? []) {
        if (s.state === "signed" || s.state === "not_possible") c.doneSignatureCount += 1;
        else if (s.state === "waiting") c.pendingSignatureCount += 1;
      }
    } else if (b.type === "multi_pr") {
      c.multiPrStatusDoneCount += (ix.itemsByBlock.get(b.id) ?? []).filter((i) => i.custom_status_id).length;
    } else if (b.type === "form") {
      for (const l of ix.linksByBlock.get(b.id) ?? []) {
        if (!on(l.mandatory)) continue;
        c.mandatoryFormCount += 1;
        if (ix.answeredLinks.has(l.id)) c.mandatoryFormWithResponseCount += 1;
      }
    }
  }
  return c;
}

/** Une étape ne contenant que des textes « document » (non affichés sur mobile) est vide : ignorée par la navigation. */
export function isStepEmpty(stepId: string, ix: FlowProgressIndex): boolean {
  return !(ix.blocksByStep.get(stepId) ?? []).some((b) => !(b.type === "txt" && b.txt_visibility === "document"));
}

export type Chip = "none" | "disabled" | "not_opened" | "blue" | "orange" | "green";

/**
 * Pastille d'étape (spec 05 §4.2, décision du 2026-10-24) : transparente si « WebApp uniquement », grise barrée si
 * désactivée, verte si validée, grise tant que jamais ouverte, bleue si rien n'est réalisé, orange sinon.
 */
export function stepChip(step: StepRow, counters: StepCounters): Chip {
  if (on(step.read_only_on_mobile_app)) return "none";
  if (on(step.disabled)) return "disabled";
  if (step.validated_at) return "green";
  if (!step.first_opened_at) return "not_opened";
  const touched = counters.doneSignatureCount + counters.mandatoryFormWithResponseCount
    + counters.multiPrStatusDoneCount + counters.pendingSignatureCount;
  return touched === 0 ? "blue" : "orange";
}

/** Pastille de phase : couleur commune de ses étapes colorées, orange si mélange. */
export function phaseChip(phase: { disabled: Bool; read_only_on_mobile_app?: Bool }, stepChips: Chip[]): Chip {
  if (on(phase.read_only_on_mobile_app)) return "none";
  const colored = stepChips.filter((c) => c !== "none" && c !== "disabled");
  if (on(phase.disabled) || !colored.length) return "disabled";
  return colored.every((c) => c === colored[0]) ? colored[0] : "orange";
}
