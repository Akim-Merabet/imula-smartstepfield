"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { notify } from "@/components/common/notify";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { saveContributor } from "../public-actions";
import { publicErrorKey } from "./errors";

type Values = { firstName: string; lastName: string; company: string; job: string };
const FIELDS = [
  { key: "firstName", max: 50, auto: "given-name" },
  { key: "lastName", max: 50, auto: "family-name" },
  { key: "company", max: 255, auto: "organization" },
  { key: "job", max: 255, auto: "organization-title" },
] as const;

/** Informations contributeur (spec 03 §9.2 étape 3) : Prénom, Nom, E-mail (lecture), Entreprise, Fonction. */
export function ContributorForm({ token, email, initial }: { token: string; email: string; initial: Values }) {
  const t = useTranslations("share.public.contributor");
  const te = useTranslations("share.public.errors");
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [pending, start] = useTransition();
  const invalid = (k: keyof Values) => submitted && !values[k].trim();

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => {
      e.preventDefault();
      setSubmitted(true);
      if (FIELDS.some((f) => !values[f.key].trim())) return;
      start(async () => {
        const res = await saveContributor(token, values);
        if (!res.ok) {
          if (res.error === "unauthenticated") { router.refresh(); return; }
          notify.error(te(publicErrorKey(res.error)));
          return;
        }
        router.replace(res.data.next);
      });
    }}>
      <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.slice(0, 2).map((f) => (
          <Field key={f.key} data-invalid={invalid(f.key)}>
            <FieldLabel htmlFor={`c-${f.key}`}>{t(f.key)} *</FieldLabel>
            <Input id={`c-${f.key}`} autoComplete={f.auto} maxLength={f.max} value={values[f.key]} aria-invalid={invalid(f.key)}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
            {invalid(f.key) && <FieldError>{t("required")}</FieldError>}
          </Field>
        ))}
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="c-email">{t("email")}</FieldLabel>
          <Input id="c-email" value={email} readOnly disabled />
        </Field>
        {FIELDS.slice(2).map((f) => (
          <Field key={f.key} data-invalid={invalid(f.key)}>
            <FieldLabel htmlFor={`c-${f.key}`}>{t(f.key)} *</FieldLabel>
            <Input id={`c-${f.key}`} autoComplete={f.auto} maxLength={f.max} value={values[f.key]} aria-invalid={invalid(f.key)}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
            {invalid(f.key) && <FieldError>{t("required")}</FieldError>}
          </Field>
        ))}
      </FieldGroup>
      <Button type="submit" className="self-start" disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{t("submit")}</Button>
    </form>
  );
}
