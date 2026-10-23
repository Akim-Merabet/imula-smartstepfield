"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { notify } from "@/components/common/notify";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { setFlowStatus } from "../actions";
import { StatusSelect, type StatusOption } from "./status-select";

/** Popover « Changement de statut » (Statut + Commentaire) — R-STAT-4. */
export function StatusPopover({ flowId, currentId, statuses, children, disabled }: {
  flowId: string; currentId: string | null; statuses: StatusOption[]; children: ReactNode; disabled?: boolean;
}) {
  const t = useTranslations("flows");
  const tg = useTranslations("global");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentId);
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();

  if (disabled) return <>{children}</>;

  const save = () => start(async () => {
    if (!value || value === currentId) { setOpen(false); return; }
    const res = await setFlowStatus(flowId, value, comment || null);
    if (!res.ok) { notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error")); return; }
    notify.success(tg("toast.saved"));
    setOpen(false); setComment("");
    router.refresh();
  });

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setValue(currentId); }}>
      <PopoverTrigger asChild>
        <button type="button" className="rounded px-1 py-0.5 text-left hover:bg-accent" onClick={(e) => e.stopPropagation()}>{children}</button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start" onClick={(e) => e.stopPropagation()}>
        <FieldGroup>
          <div className="font-medium">{t("statusPopover.title")}</div>
          <Field>
            <FieldLabel>{t("statusPopover.status")}</FieldLabel>
            <StatusSelect statuses={statuses} value={value} onChange={setValue} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`status-comment-${flowId}`}>{t("statusPopover.comment")}</FieldLabel>
            <Textarea id={`status-comment-${flowId}`} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>{tg("actions.cancel")}</Button>
            <Button size="sm" onClick={save} disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
          </div>
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
}
