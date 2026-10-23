"use client";

import type { DialogProps } from "@/components/dialogs/types";
import { PhaseDialog } from "./phase-dialog";
import { StepDialog } from "./step-dialog";

/** Modales du préfixe « flow-content » : phase-add/<flowId> | phase-edit/<phaseId> | step-add/<phaseId> | step-edit/<stepId>. */
export default function FlowContentDialogs({ segments, close }: DialogProps) {
  const [action, id, tab = "general-tab"] = segments;
  if (!id) return null;
  if (action === "phase-add" || action === "phase-edit") return <PhaseDialog mode={action === "phase-add" ? "add" : "edit"} id={id} tab={tab} close={close} />;
  if (action === "step-add" || action === "step-edit") return <StepDialog mode={action === "step-add" ? "add" : "edit"} id={id} tab={tab} close={close} />;
  return null;
}
