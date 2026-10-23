"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { notify } from "@/components/common/notify";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { reorganizeFlows } from "../actions";
import { REORGANIZE_FIELDS, type ReorganizeField } from "../meta";
import { StatusSelect, type StatusOption } from "./status-select";

type Opt = { value: string; label: string };

/** « Réorganiser les flows » : changer un champ pour les flows sélectionnés (§2.7). */
export function ReorganizeDialog({ open, onOpenChange, projectId, flowIds, options, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; projectId: string; flowIds: string[];
  options: { categories: Opt[]; statuses: StatusOption[]; members: Opt[]; tablets: Opt[] }; onDone: () => void;
}) {
  const t = useTranslations("flows.reorganize");
  const tg = useTranslations("global");
  const router = useRouter();
  const [field, setField] = useState<ReorganizeField>("category");
  const [value, setValue] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const isDate = field.endsWith("Start") || field.endsWith("End");
  const list: Opt[] = field === "category" ? options.categories
    : field === "reporter" || field === "assignee" ? options.members
    : field.startsWith("tablet") ? options.tablets : [];
  const valueLabel = field === "status" ? options.statuses.find((s) => s.id === value)?.name
    : isDate ? value : list.find((o) => o.value === value)?.label;

  const submit = () => start(async () => {
    const res = await reorganizeFlows(projectId, flowIds, field, value || null);
    if (!res.ok) { notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error")); return; }
    notify.success(t("success", { count: res.data.count }));
    setConfirming(false); onOpenChange(false); onDone(); router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setConfirming(false); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle", { count: flowIds.length })}</DialogDescription>
        </DialogHeader>
        {confirming ? (
          <Alert><AlertDescription>{t("confirm", { type: t(`fields.${field}`), name: valueLabel ?? tg("none"), count: flowIds.length })}</AlertDescription></Alert>
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel>{t("field")}</FieldLabel>
              <Select value={field} onValueChange={(v) => { setField(v as ReorganizeField); setValue(""); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{REORGANIZE_FIELDS.map((f) => <SelectItem key={f} value={f}>{t(`fields.${f}`)}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{t("value")}</FieldLabel>
              {field === "status" ? <StatusSelect statuses={options.statuses} value={value || null} onChange={setValue} />
                : isDate ? <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
                : (
                  <Select value={value || undefined} onValueChange={setValue}>
                    <SelectTrigger className="w-full"><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
                    <SelectContent><SelectGroup>{list.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                )}
            </Field>
          </FieldGroup>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => (confirming ? setConfirming(false) : onOpenChange(false))}>{tg("actions.cancel")}</Button>
          {confirming
            ? <Button onClick={submit} disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.confirm")}</Button>
            : <Button onClick={() => setConfirming(true)} disabled={field === "status" && !value}>{tg("actions.validate")}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
