"use client";

import type { DialogProps } from "@/components/dialogs/types";
import { ProjectFormDialog } from "./project-dialog";
import { ProjectHistoryDialog } from "./project-history-dialog";
import { ProjectPropertiesDialog } from "./project-properties-dialog";

/** Modales du préfixe « project » : add | edit | history | properties. */
export default function ProjectDialogs(props: DialogProps) {
  const [action, id] = props.segments;
  if (action === "history" && id) return <ProjectHistoryDialog projectId={id} close={props.close} />;
  if (action === "properties" && id) return <ProjectPropertiesDialog projectId={id} close={props.close} />;
  return <ProjectFormDialog {...props} />;
}
