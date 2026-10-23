"use client";

import type { DialogProps } from "@/components/dialogs/types";
import { ProjectFormDialog } from "./project-dialog";
import { ProjectDuplicateDialog } from "./project-duplicate-dialog";
import { ProjectHistoryDialog } from "./project-history-dialog";
import { ProjectPrepareDialog } from "./project-prepare-dialog";
import { ProjectPropertiesDialog } from "./project-properties-dialog";

/** Modales du préfixe « project » : add | add-sub-folder | edit | history | properties | duplicate | prepare. */
export default function ProjectDialogs(props: DialogProps) {
  const [action, id] = props.segments;
  if (action === "history" && id) return <ProjectHistoryDialog projectId={id} close={props.close} />;
  if (action === "properties" && id) return <ProjectPropertiesDialog projectId={id} close={props.close} />;
  if (action === "duplicate" && id) return <ProjectDuplicateDialog projectId={id} close={props.close} />;
  if (action === "prepare" && id) return <ProjectPrepareDialog projectId={id} close={props.close} />;
  return <ProjectFormDialog {...props} />;
}
