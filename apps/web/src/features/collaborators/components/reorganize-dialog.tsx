"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { notify } from "@/components/common/notify";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { reorganizeCollaborators } from "../actions";
import { REORGANIZE_CATEGORIES, familyLabel, type CollaboratorKind, type ReorganizeCategory } from "../meta";
import type { CollaboratorOptions } from "../queries";
import { useErrorMessage } from "./action-runner";

/** Modification en masse (spec 01 §4.4) : « Changer le ou la [catégorie] à [valeur] sur N éléments ». */
export function ReorganizeDialog({ open, onOpenChange, kind, ids, options }: {
  open: boolean; onOpenChange: (o: boolean) => void; kind: CollaboratorKind; ids: string[]; options: CollaboratorOptions;
}) {
  const t = useTranslations("collaborators");
  const tg = useTranslations("global");
  const router = useRouter();
  const message = useErrorMessage();
  const [category, setCategory] = useState<ReorganizeCategory>("hierarchy");
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const categories = REORGANIZE_CATEGORIES.filter((c) => c !== "authority" || kind === "user");

  const values: { id: string; label: string }[] = category === "authority"
    ? (["simple", "normal", "advanced"] as const).map((a) => ({ id: a, label: t(`authority.${a}`) }))
    : ({ hierarchy: options.hierarchies, function: options.functions, group: options.groups, legal: options.legals, contract: options.contracts }[category])
      .map((f) => ({ id: f.id, label: familyLabel(f) }));

  const submit = () => start(async () => {
    const res = await reorganizeCollaborators(kind, ids, category, value);
    if (!res.ok) { notify.error(message(res.error)); return; }
    notify.success(t("toast.reorganized", res.data));
    onOpenChange(false);
    setValue("");
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reorganize.title")}</DialogTitle>
          <DialogDescription>{t("reorganize.on", { count: ids.length })}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>{t("reorganize.sentence")}</FieldLabel>
            <Select value={category} onValueChange={(v) => { setCategory(v as ReorganizeCategory); setValue(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                {categories.map((c) => <SelectItem key={c} value={c}>{t(`reorganize.category.${c}`)}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{t("reorganize.to")}</FieldLabel>
            <Select value={value || undefined} onValueChange={setValue}>
              <SelectTrigger><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
              <SelectContent><SelectGroup>
                {values.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
          </Field>
          <Alert><AlertDescription>{t("reorganize.excluded")}</AlertDescription></Alert>
        </FieldGroup>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{tg("actions.cancel")}</Button>
          <Button disabled={!value || pending} onClick={submit}>{pending && <Spinner data-icon="inline-start" />}{t("reorganize.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
