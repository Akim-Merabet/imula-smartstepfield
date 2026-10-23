"use client";

import type { DialogProps } from "@/components/dialogs/types";
import { CollaboratorDialog } from "./collaborator-dialog";
import { CollaboratorPropertiesDialog } from "./collaborator-properties-dialog";

/** Modales du préfixe « user » : add | edit | convert | properties. */
export default function UserDialogs({ segments, close }: DialogProps) {
  const [action, id] = segments;
  if (action === "properties" && id) return <CollaboratorPropertiesDialog id={id} close={close} />;
  return <CollaboratorDialog kind="user" segments={segments} close={close} />;
}
