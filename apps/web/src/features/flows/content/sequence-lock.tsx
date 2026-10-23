"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LockIcon, LockOpenIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { unlockStepFill } from "../sequence-actions";
import { contentError } from "./errors";

/** Étape bloquée par le séquencement (R-SEQ-1/2) ; déverrouillage tracé réservé expert / responsable (R-SEQ-3). */
export function SequenceLockAlert({ stepId, steps, canUnlock }: { stepId: string; steps: string[]; canUnlock: boolean }) {
  const t = useTranslations("flowContent");
  const tg = useTranslations("global");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const unlock = () => start(async () => {
    const res = await unlockStepFill(stepId, reason || null);
    if (!res.ok) { notify.error(contentError(t, tg, res.error)); return; }
    notify.success(t("sequence.unlocked"));
    setOpen(false);
    router.refresh();
  });

  return (
    <>
      <Alert className="mx-6 mt-3 w-auto border-warning/50 bg-warning-bg">
        <LockIcon />
        <AlertTitle>{t("sequence.lockedTitle")}</AlertTitle>
        <AlertDescription>
          <span>{t("sequence.lockedInfo")}</span>
          <ul className="list-disc pl-4">{steps.map((s) => <li key={s}>{s}</li>)}</ul>
          {canUnlock && (
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => setOpen(true)}>
              <LockOpenIcon data-icon="inline-start" />{t("sequence.unlock")}
            </Button>
          )}
        </AlertDescription>
      </Alert>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sequence.unlock")}</DialogTitle>
            <DialogDescription>{t("sequence.unlockInfo")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="unlock-reason">{t("sequence.unlockReason")}</FieldLabel>
              <Textarea id="unlock-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>{tg("actions.cancel")}</Button>
            <Button onClick={unlock} disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{t("sequence.unlock")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
