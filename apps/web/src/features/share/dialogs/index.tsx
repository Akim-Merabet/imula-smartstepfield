"use client";

import type { DialogProps } from "@/components/dialogs/types";
import { ShareDialog } from "./share-dialog";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Modales du préfixe « share » : form/<formId> | response/<responseId> | document/<documentId>. */
export default function ShareDialogs({ segments, close }: DialogProps) {
  const [kind, id] = segments;
  if (!id || !UUID.test(id)) return null;
  if (kind === "form") return <ShareDialog key={id} target={{ kind: "form", formId: id }} close={close} />;
  if (kind === "response") return <ShareDialog key={id} target={{ kind: "response", responseId: id }} close={close} />;
  if (kind === "document") return <ShareDialog key={id} target={{ kind: "document", documentId: id }} close={close} />;
  return null;
}
