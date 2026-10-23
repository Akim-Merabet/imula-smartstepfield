"use client";

import { useParams } from "next/navigation";
import type { DialogProps } from "@/components/dialogs/types";
import { DocumentDialog } from "./document-dialog";
import { ImportFromLibraryDialog } from "./import-dialog";
import { DocumentPropertiesDialog } from "./properties-dialog";

/** Préfixe « dashboard-documents » : add | edit | properties | import. */
export default function ProjectDocumentDialogs(props: DialogProps) {
  const params = useParams<{ projectId?: string }>();
  const [action, id] = props.segments;
  if (action === "properties" && id) return <DocumentPropertiesDialog documentId={id} close={props.close} />;
  if (action === "import" && params.projectId) return <ImportFromLibraryDialog projectId={params.projectId} close={props.close} />;
  return <DocumentDialog {...props} mode="project" />;
}
