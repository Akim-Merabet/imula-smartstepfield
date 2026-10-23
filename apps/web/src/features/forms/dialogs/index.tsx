"use client";

import { useParams } from "next/navigation";
import type { DialogProps } from "@/components/dialogs/types";
import { LinkFormDialog, LinkResponsesDialog, LinkSettingsDialog } from "../block/block-dialogs";
import { FormInfoDialog } from "./form-info-dialog";
import { ImportFormsDialog, ReplyDialog } from "./import-reply-dialogs";
import { DuplicateFormDialog, FormHistoryDialog, FormPropertiesDialog, ResponseHistoryDialog } from "./simple-dialogs";

/**
 * Modales du préfixe « form-lib » :
 * add | edit/<id>/<onglet> | duplicate/<id> | properties/<id> | history/<id> | import/<projectId>
 * | response-history/<responseId> | reply/<formId>[/<blockLinkId>] | link/<blockId> | link-settings/<linkId> | link-responses/<linkId>
 */
export default function FormDialogs(props: DialogProps) {
  const params = useParams<{ projectId?: string }>();
  const [action, id, extra] = props.segments;
  const { close } = props;
  if (action === "duplicate" && id) return <DuplicateFormDialog formId={id} close={close} />;
  if (action === "properties" && id) return <FormPropertiesDialog formId={id} close={close} />;
  if (action === "history" && id) return <FormHistoryDialog formId={id} close={close} />;
  if (action === "response-history" && id) return <ResponseHistoryDialog responseId={id} close={close} />;
  if (action === "import" && id) return <ImportFormsDialog projectId={id} close={close} />;
  if (action === "reply" && id && params.projectId) return <ReplyDialog projectId={params.projectId} formId={id} blockLinkId={extra} close={close} />;
  if (action === "link" && id) return <LinkFormDialog blockId={id} close={close} />;
  if (action === "link-settings" && id) return <LinkSettingsDialog linkId={id} close={close} />;
  if (action === "link-responses" && id) return <LinkResponsesDialog linkId={id} close={close} />;
  if (action === "add" || action === "edit") return <FormInfoDialog {...props} />;
  return null;
}
