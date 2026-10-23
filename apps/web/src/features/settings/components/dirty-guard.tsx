"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/common/type-to-confirm";

/** Garde « modifications non sauvegardées » à la fermeture d'une modale (spec 01 §0). */
export function useDirtyGuard(dirty: boolean, close: () => void) {
  const tg = useTranslations("global");
  const [asking, setAsking] = useState(false);
  const requestClose = useCallback(() => { if (dirty) setAsking(true); else close(); }, [dirty, close]);
  const dialog = (
    <ConfirmDialog open={asking} onOpenChange={setAsking} destructive={false}
      title={tg("confirm.unsavedTitle")} description={tg("confirm.unsavedText")}
      confirmLabel={tg("actions.close")} onConfirm={close} />
  );
  return { requestClose, dialog };
}
