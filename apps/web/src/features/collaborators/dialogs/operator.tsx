"use client";

import type { DialogProps } from "@/components/dialogs/types";
import { CollaboratorDialog } from "./collaborator-dialog";
import { CollaboratorPropertiesDialog } from "./collaborator-properties-dialog";

/** Modales du préfixe « operator » : add | edit | properties. */
export default function OperatorDialogs({ segments, close }: DialogProps) {
  const [action, id] = segments;
  if (action === "properties" && id) return <CollaboratorPropertiesDialog id={id} close={close} />;
  return <CollaboratorDialog kind="operator" segments={segments} close={close} />;
}
