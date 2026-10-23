"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { KeyRoundIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import { createApiClient, updateApiClient, type IssuedCredentials } from "../actions";
import { SecretReveal } from "../components/secret-reveal";
import { useApiErrorMessage } from "../components/use-error-message";
import { API_KEY_TYPES, SERVICE_CLASSES, type ApiKeyType, type ServiceClass } from "../meta";

type Form = { name: string; key_type: ApiKeyType; account_id: string | null; service_class: ServiceClass; expires_at: string; active: boolean };

/** ?dialog=api-key/add · api-key/edit/<id> — création (avec affichage unique du secret) et édition d'une clé API v2. */
export default function ApiKeyDialog({ segments, close }: DialogProps) {
  const t = useTranslations("apiAccess");
  const tg = useTranslations("global");
  const router = useRouter();
  const message = useApiErrorMessage();
  const [action, id] = segments;
  const isEdit = action === "edit" && !!id;
  const [form, setForm] = useState<Form>({ name: "", key_type: "account", account_id: null, service_class: "L1", expires_at: "", active: true });
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [loaded, setLoaded] = useState(!isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    supabase.from("accounts").select("id, name").order("name").then(({ data }) => {
      setAccounts(data ?? []);
      if (!isEdit && data?.length === 1) setForm((f) => ({ ...f, account_id: f.account_id ?? data[0].id }));
    });
    if (!isEdit) return;
    supabase.from("api_clients").select("name, key_type, account_id, service_class, expires_at, active").eq("id", id).single().then(({ data }) => {
      if (data) {
        setForm({
          name: data.name, key_type: data.key_type, account_id: data.account_id, service_class: data.service_class, active: data.active,
          expires_at: data.expires_at ? new Date(data.expires_at).toLocaleDateString("sv-SE") : "",
        });
      }
      setLoaded(true);
    });
  }, [isEdit, id]);

  const finish = () => {
    router.refresh();
    close();
  };

  const submit = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 3 || form.name.trim().length > 100) e.name = t("errors.nameLength");
    if (form.key_type === "account" && !form.account_id) e.account_id = t("errors.account_required");
    if (form.expires_at && new Date(`${form.expires_at}T23:59:59`) <= new Date()) e.expires_at = t("errors.expiry_past");
    setErrors(e);
    if (Object.keys(e).length) return;
    const input = { ...form, account_id: form.key_type === "account" ? form.account_id : null, expires_at: form.expires_at || null };
    start(async () => {
      if (isEdit) {
        const res = await updateApiClient(id, input);
        if (!res.ok) { notify.error(message(res.error)); return; }
        notify.success(t("toast.saved"));
        finish();
        return;
      }
      const res = await createApiClient(input);
      if (!res.ok) { notify.error(message(res.error)); return; }
      notify.success(t("toast.created"));
      setIssued(res.data);
    });
  };

  const icon = <EntityIcon kind="contributors" icon={KeyRoundIcon} size="md" />;

  if (issued) {
    return (
      <ModalShell size="md" onClose={finish} icon={icon} title={t("secret.title", { name: form.name })}
        footer={<Button onClick={finish}>{t("secret.done")}</Button>}>
        <SecretReveal clientId={issued.clientId} clientSecret={issued.clientSecret} />
      </ModalShell>
    );
  }

  return (
    <ModalShell size="md" onClose={close} icon={icon}
      title={isEdit ? t("dialog.editTitle", { name: form.name }) : t("dialog.createTitle")}
      footer={<>
        <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !loaded}>
          {pending && <Spinner data-icon="inline-start" />}{isEdit ? tg("actions.save") : t("dialog.create")}
        </Button>
      </>}>
      {!loaded ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <FieldGroup>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="api-name">{t("dialog.name")} *</FieldLabel>
            <Input id="api-name" value={form.name} maxLength={100} aria-invalid={!!errors.name}
              onChange={(ev) => setForm((f) => ({ ...f, name: ev.target.value }))} />
            <FieldDescription>{t("dialog.nameHelp")}</FieldDescription>
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="api-type">{t("dialog.keyType")} *</FieldLabel>
            <Select value={form.key_type} disabled={isEdit} onValueChange={(v) => setForm((f) => ({ ...f, key_type: v as ApiKeyType }))}>
              <SelectTrigger id="api-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {API_KEY_TYPES.map((k) => <SelectItem key={k} value={k}>{t(`keyType.${k}`)}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>{t(`keyTypeHelp.${form.key_type}`)}{isEdit ? ` ${t("dialog.frozen")}` : ""}</FieldDescription>
          </Field>
          {form.key_type === "account" && (
            <Field data-invalid={!!errors.account_id}>
              <FieldLabel htmlFor="api-account">{t("dialog.account")} *</FieldLabel>
              <Select value={form.account_id ?? ""} disabled={isEdit} onValueChange={(v) => setForm((f) => ({ ...f, account_id: v }))}>
                <SelectTrigger id="api-account" aria-invalid={!!errors.account_id}><SelectValue placeholder={t("dialog.accountPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {errors.account_id && <FieldError>{errors.account_id}</FieldError>}
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="api-class">{t("dialog.class")} *</FieldLabel>
            <Select value={form.service_class} onValueChange={(v) => setForm((f) => ({ ...f, service_class: v as ServiceClass }))}>
              <SelectTrigger id="api-class"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {SERVICE_CLASSES.map((c) => <SelectItem key={c} value={c}>{t(`class.${c}`)}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>{t(`classHelp.${form.service_class}`)}</FieldDescription>
          </Field>
          <Field data-invalid={!!errors.expires_at}>
            <FieldLabel htmlFor="api-expiry">{t("dialog.expiresAt")}</FieldLabel>
            <Input id="api-expiry" type="date" value={form.expires_at} aria-invalid={!!errors.expires_at}
              onChange={(ev) => setForm((f) => ({ ...f, expires_at: ev.target.value }))} />
            <FieldDescription>{t("dialog.expiresAtHelp")}</FieldDescription>
            {errors.expires_at && <FieldError>{errors.expires_at}</FieldError>}
          </Field>
          <Field orientation="horizontal">
            <Switch id="api-active" checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
            <FieldContent>
              <FieldLabel htmlFor="api-active">{t("dialog.active")}</FieldLabel>
              <FieldDescription>{t("dialog.activeHelp")}</FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      )}
    </ModalShell>
  );
}
