"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { VenetianMaskIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { updateExternalUser } from "../actions";
import { useErrorMessage } from "../components/action-runner";
import type { ExternalUserInput } from "../schema";

/** ?dialog=external-user/edit/<id> — édition d'un utilisateur externe (spec 01 §4.7). */
export default function ExternalUserDialog({ segments, close }: DialogProps) {
  const t = useTranslations("collaborators");
  const tg = useTranslations("global");
  const router = useRouter();
  const message = useErrorMessage();
  const id = segments[1];
  const [form, setForm] = useState<ExternalUserInput | null>(null);
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!id) return;
    createClient().from("external_users").select("*").eq("id", id).single().then(({ data }) => {
      if (!data) return;
      setEmail(data.email);
      setForm({ first_name: data.first_name, last_name: data.last_name, company_name: data.company_name, profession: data.profession });
    });
  }, [id]);

  const submit = () => {
    if (!form || !id) return;
    const e: Record<string, string> = {};
    (["first_name", "last_name", "company_name", "profession"] as const).forEach((k) => { if (!form[k].trim()) e[k] = tg("validators.required"); });
    if (form.first_name.length > 50) e.first_name = tg("validators.maxLength", { max: 50 });
    if (form.last_name.length > 50) e.last_name = tg("validators.maxLength", { max: 50 });
    setErrors(e);
    if (Object.keys(e).length) return;
    start(async () => {
      const res = await updateExternalUser(id, form);
      if (!res.ok) { notify.error(message(res.error)); return; }
      notify.success(tg("toast.saved"));
      router.refresh();
      close();
    });
  };

  const field = (k: keyof ExternalUserInput, label: string) => (
    <Field data-invalid={!!errors[k]}>
      <FieldLabel htmlFor={`e-${k}`}>{label} *</FieldLabel>
      <Input id={`e-${k}`} value={form?.[k] ?? ""} aria-invalid={!!errors[k]} onChange={(ev) => setForm((f) => (f ? { ...f, [k]: ev.target.value } : f))} />
      {errors[k] && <FieldError>{errors[k]}</FieldError>}
    </Field>
  );

  return (
    <ModalShell onClose={close} size="md" icon={<EntityIcon kind="contributors" icon={VenetianMaskIcon} size="md" />}
      title={t("external.editTitle", { name: form ? `${form.first_name} ${form.last_name}` : "" })}
      footer={<>
        <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !form}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </>}>
      {!form ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            {field("first_name", t("dialog.firstName"))}
            {field("last_name", t("dialog.lastName"))}
          </div>
          <Field>
            <FieldLabel htmlFor="e-email">{t("dialog.email")}</FieldLabel>
            <Input id="e-email" value={email} disabled />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            {field("company_name", t("external.company"))}
            {field("profession", t("external.profession"))}
          </div>
        </FieldGroup>
      )}
    </ModalShell>
  );
}
