"use client";

import type { DialogProps } from "@/components/dialogs/types";
import { FlowFormDialog } from "./flow-dialog";
import { FlowDuplicateDialog } from "./flow-duplicate-dialog";
import { FlowHistoryDialog } from "./flow-history-dialog";
import { FlowPropertiesDialog } from "./flow-properties-dialog";

/** Modales du préfixe « flow » : add | edit | properties | history | duplicate. */
export default function FlowDialogs(props: DialogProps) {
  const [action, id, tab] = props.segments;
  if (action === "properties" && id) return <FlowPropertiesDialog flowId={id} close={props.close} />;
  if (action === "history" && id) return <FlowHistoryDialog flowId={id} tab={tab ?? "events-tab"} close={props.close} />;
  if (action === "duplicate" && id) return <FlowDuplicateDialog flowId={id} close={props.close} />;
  return <FlowFormDialog {...props} />;
}
