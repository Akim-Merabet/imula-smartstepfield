"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeftRightIcon } from "lucide-react";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { saveCompany } from "../actions/clients";
import { useDirtyGuard } from "../components/dirty-guard";
import { useRun } from "../components/use-run";
import { useSiblings } from "../components/use-siblings";
import type { CompanyInput } from "../schema";

const EMPTY: CompanyInput = { name: "", activity_area: "", comment: "" };

/** ?dialog=company/add · company/edit/<id> — spec 01 §6.4. */
export default function CompanyDialog({ segments, close }: DialogProps) {
  const t = useTranslations("settings.companies");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const run = useRun();
  const [action, id] = segments;
  const isEdit = action === "edit" && !!id;
  const [form, setForm] = useState<CompanyInput>(EMPTY);
  const [initial, setInitial] = useState<CompanyInput>(EMPTY);
  const [isParent, setIsParent] = useState(false);
  const [loaded, setLoaded] = useState(!isEdit);
  const [error, setError] = useState<string | null>(null);
  const [createAnother, setCreateAnother] = useState(false);
  const [pending, startTransition] = useTransition();
  const { requestClose, dialog: guard } = useDirtyGuard(JSON.stringify(form) !== JSON.stringify(initial), close);
  const siblings = useSiblings(async () => {
    const { data } = await createClient().from("companies").select("id").order("is_parent_company", { ascending: false }).order("name");
    return (data ?? []).map((r) => r.id);
  }, isEdit ? id : null);

  useEffect(() => {
    if (!isEdit) return;
    createClient().from("companies").select("*").eq("id", id).single().then(({ data }) => {
      if (!data) return;
      const v = { name: data.name, activity_area: data.activity_area ?? "", comment: data.comment ?? "" };
      setForm(v); setInitial(v); setIsParent(data.is_parent_company); setLoaded(true);
    });
  }, [id, isEdit]);

  const submit = () => {
    if (!form.name.trim()) { setError(tg("validators.required")); return; }
    setError(null);
    startTransition(async () => {
      const done = await run(() => saveCompany(isEdit ? id : null, form), isEdit ? undefined : t("created"));
      if (!done) return;
      if (!isEdit && createAnother) { setForm(EMPTY); return; }
      close();
    });
  };

  return (
    <ModalShell onClose={requestClose} size="sm" icon={<EntityIcon kind="settings" icon={ArrowLeftRightIcon} size="md" />}
      title={isEdit ? t("editTitle", { name: initial.name }) : t("createTitle")}
      onPrevious={siblings.previous ? () => dialog.replace(`company/edit/${siblings.previous}`) : undefined}
      onNext={siblings.next ? () => dialog.replace(`company/edit/${siblings.next}`) : undefined}
      footer={<>
        {!isEdit && <label className="mr-auto flex items-center gap-2 text-sm"><Checkbox checked={createAnother} onCheckedChange={(v) => setCreateAnother(!!v)} />{t("createAnother")}</label>}
        <Button variant="secondary" onClick={requestClose}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !loaded}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </>}>
      {!loaded ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <FieldGroup>
          {isParent && <Badge variant="secondary" className="w-fit">{t("parent")}</Badge>}
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="co-name">{t("fields.name")} *</FieldLabel>
            <Input id="co-name" value={form.name} aria-invalid={!!error} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="co-area">{t("fields.activityArea")}</FieldLabel>
            <Input id="co-area" value={form.activity_area ?? ""} onChange={(e) => setForm((f) => ({ ...f, activity_area: e.target.value }))} />
          </Field>
          <Field>
            <FieldLabel htmlFor="co-comment">{t("fields.comment")}</FieldLabel>
            <Textarea id="co-comment" value={form.comment ?? ""} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} />
          </Field>
        </FieldGroup>
      )}
      {guard}
    </ModalShell>
  );
}
