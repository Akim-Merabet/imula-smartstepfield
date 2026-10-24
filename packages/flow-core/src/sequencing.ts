// Séquencement des étapes (miroir de private.step_sequence_blockers, spec 02 R-SEQ, spec 05 §4.4).
import { type FlowProgressIndex, missingMandatory } from "./progress";
import { on, type PhaseRow, type SequenceRow, type SequencingType, type StepRow } from "./types";

export type SequencingData = {
  phases: PhaseRow[];
  steps: StepRow[];
  sequences: SequenceRow[];
  /** Type de séquence par défaut du compte (accounts.default_sequence_type). */
  defaultType: SequencingType;
  /** Flow déverrouillé (flows.fill_restrictions_skipped) : plus aucune étape bloquée. */
  fillRestrictionsSkipped: boolean;
  /** Étapes déverrouillées une à une (step_fill_unlocks, WebApp). */
  unlockedStepIds?: Set<string>;
};

/**
 * Étapes qui bloquent la saisie de `stepId` : étapes antérieures (phases obligatoires des séquences précédentes,
 * phases précédentes d'une séquence linéaire, étapes précédentes d'une phase linéaire) dont des éléments
 * obligatoires restent à faire. Liste vide = étape saisissable.
 */
export function sequenceBlockers(stepId: string, data: SequencingData, ix: FlowProgressIndex): string[] {
  if (data.fillRestrictionsSkipped || data.unlockedStepIds?.has(stepId)) return [];
  const step = data.steps.find((s) => s.id === stepId);
  if (!step) return [];

  const seqPos = new Map(data.sequences.map((q) => [q.id, q.position]));
  const phases = [...data.phases].sort((a, b) => a.position - b.position);
  // Séquence effective : celle de la phase, sinon celle de la dernière phase précédente qui en a une.
  const eff = new Map<string, number>();
  let running = 0;
  for (const p of phases) {
    running = Math.max(running, p.sequence_id ? seqPos.get(p.sequence_id) ?? 0 : 0);
    eff.set(p.id, running);
  }
  const cur = phases.find((p) => p.id === step.phase_id);
  if (!cur) return [];
  const curEff = eff.get(cur.id) ?? 0;
  const seqType = data.sequences.find((q) => q.position === curEff)?.type ?? data.defaultType;
  const phaseById = new Map(phases.map((p) => [p.id, p]));

  return data.steps
    .filter((st) => {
      const ph = phaseById.get(st.phase_id);
      if (!ph || st.id === step.id || on(st.disabled) || on(ph.disabled)) return false;
      const phEff = eff.get(ph.id) ?? 0;
      const before =
        (phEff < curEff && on(ph.mandatory))
        || (phEff === curEff && ph.id !== cur.id && seqType === "linear" && ph.position < cur.position && on(ph.mandatory))
        || (ph.id === cur.id && cur.sequence_type === "linear" && st.position < step.position);
      return before && missingMandatory(st.id, ix).length > 0;
    })
    .sort((a, b) => (phaseById.get(a.phase_id)!.position - phaseById.get(b.phase_id)!.position) || a.position - b.position)
    .map((st) => st.id);
}
