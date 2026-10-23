"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { Tables } from "@/lib/supabase/database.types";
import { updateAccount } from "../actions/account";
import type { AccountInput } from "../schema";
import { useRun } from "./use-run";

const REQUIRED = ["name", "address_line_1", "postal_code", "city"] as const;

/** Paramètres › Compte (spec 01 §6.1). */
export function AccountForm({ account, organization, canEdit }: {
  account: Tables<"accounts">; organization: { id: string; name: string; subdomain: string | null }; canEdit: boolean;
}) {
  const t = useTranslations("settings.account");
  const tg = useTranslations("global");
  const run = useRun();
  const [pending, startTransition] = useTransition();
  const s = (v: string | null) => v ?? "";
  const [form, setForm] = useState<AccountInput>({
    name: account.name, full_name: s(account.full_name), address_line_1: s(account.address_line_1),
    address_line_2: s(account.address_line_2), postal_code: s(account.postal_code), city: s(account.city),
    country: s(account.country), phone: s(account.phone), fax: s(account.fax), contact_email: s(account.contact_email),
    website: s(account.website),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const e: Record<string, string> = {};
    for (const k of REQUIRED) if (!String(form[k] ?? "").trim()) e[k] = tg("validators.required");
    if (form.contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.contact_email)) e.contact_email = tg("validators.email");
    setErrors(e);
    if (Object.keys(e).length) return;
    startTransition(async () => { await run(() => updateAccount(form)); });
  };

  const field = (key: keyof AccountInput, required = false) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={`acc-${key}`}>{t(`fields.${key}` as never)}{required && " *"}</FieldLabel>
      <Input id={`acc-${key}`} value={(form[key] as string) ?? ""} disabled={!canEdit} aria-invalid={!!errors[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );

  const readOnly = (label: string, value: string) => (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input value={value} disabled readOnly />
    </Field>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-card p-6">
      <FieldGroup className="max-w-4xl">
        <FieldSet>
          <FieldLegend>{t("sections.identity")}</FieldLegend>
          <div className="grid grid-cols-2 gap-4">
            {field("name", true)}
            {field("full_name")}
            {readOnly(t("fields.organization"), organization.name)}
            {readOnly(t("fields.subdomain"), organization.subdomain ?? "—")}
          </div>
          {readOnly(t("fields.organizationId"), organization.id)}
        </FieldSet>
        <FieldSet>
          <FieldLegend>{t("sections.address")}</FieldLegend>
          <div className="grid grid-cols-2 gap-4">
            {field("address_line_1", true)}
            {field("address_line_2")}
            {field("postal_code", true)}
            {field("city", true)}
            {field("country")}
          </div>
        </FieldSet>
        <FieldSet>
          <FieldLegend>{t("sections.contact")}</FieldLegend>
          <div className="grid grid-cols-2 gap-4">
            {field("phone")}
            {field("fax")}
            {field("contact_email")}
            {field("website")}
          </div>
        </FieldSet>
        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={submit} disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
          </div>
        )}
      </FieldGroup>
    </div>
  );
}
