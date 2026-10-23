"use client";

import type { DialogProps } from "@/components/dialogs/types";
import { DocumentDialog } from "./document-dialog";
import { DocumentPropertiesDialog } from "./properties-dialog";

/** Préfixe « library-documents » : add | edit | properties. */
export default function LibraryDocumentDialogs(props: DialogProps) {
  const [action, id] = props.segments;
  if (action === "properties" && id) return <DocumentPropertiesDialog documentId={id} close={props.close} />;
  return <DocumentDialog {...props} mode="library" />;
}
