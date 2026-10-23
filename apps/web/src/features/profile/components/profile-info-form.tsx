"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { notify } from "@/components/common/notify";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { updateProfile } from "../actions";
import type { ProfileInput } from "../schema";
import { SignatureInput } from "./signature-input";

const NONE = "__none";

export function ProfileInfoForm({ initial, email, sso, functions }: {
  initial: Omit<ProfileInput, "signature_path"> & { signature_path: string | null };
  email: string | null; sso: string | null;
  functions: { id: string; label: string; color: string }[];
}) {
  const t = useTranslations("profile.info");
  const tg = useTranslations("global");
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!form.first_name.trim()) err.first_name = tg("validators.required");
    if (!form.last_name.trim()) err.last_name = tg("validators.required");
    if (!form.trigram.trim()) err.trigram = tg("validators.required");
    else if (form.trigram.trim().length < 3) err.trigram = t("trigramMin");
    if (!form.signature_path) err.signature = t("signatureRequired");
    setErrors(err);
    if (Object.keys(err).length) return;
    start(async () => {
      const res = await updateProfile({ ...form, signature_path: form.signature_path! });
      if (!res.ok) { notify.error(tg("toast.error")); return; }
      notify.success(tg("toast.saved"));
      router.refresh();
    });
  };

  const text = (key: "first_name" | "last_name" | "trigram" | "complement" | "profession", label: string, opts?: { max?: number; required?: boolean; placeholder?: string; upper?: boolean }) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={`pf-${key}`}>{label}{opts?.required && " *"}</FieldLabel>
      <Input id={`pf-${key}`} value={(form[key] as string | null) ?? ""} maxLength={opts?.max} placeholder={opts?.placeholder}
        aria-invalid={!!errors[key]} onChange={(e) => set(key, opts?.upper ? e.target.value.toUpperCase() : e.target.value)} />
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );

  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-6 overflow-y-auto pb-6">
      <FieldGroup>
        <div className="grid grid-cols-2 gap-4">
          {text("first_name", t("firstName"), { max: 50, required: true })}
          {text("last_name", t("lastName"), { max: 50, required: true })}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {text("trigram", t("trigram"), { max: 10, required: true, upper: true })}
          <Field>
            <FieldLabel>{t("language")}</FieldLabel>
            <Select value={form.language} onValueChange={(v) => set("language", v as "fr" | "en")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>{(["fr", "en"] as const).map((l) => <SelectItem key={l} value={l}>{t(`languages.${l}`)}</SelectItem>)}</SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field><FieldLabel htmlFor="pf-email">{t("email")}</FieldLabel><Input id="pf-email" value={email ?? ""} disabled /></Field>
          <Field><FieldLabel htmlFor="pf-sso">{t("sso")}</FieldLabel><Input id="pf-sso" value={sso ?? ""} disabled /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel>{t("function")}</FieldLabel>
            <Select value={form.function_id ?? NONE} onValueChange={(v) => set("function_id", v === NONE ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NONE}>{t("none")}</SelectItem>
                  {functions.map((f) => (
                    <SelectItem key={f.id} value={f.id}><span className="size-3 rounded-sm" style={{ backgroundColor: f.color }} />{f.label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {text("complement", t("complement"))}
        </div>
        {text("profession", t("profession"), { placeholder: t("professionPlaceholder") })}
        <Field data-invalid={!!errors.signature}>
          <FieldLabel>{t("signature")} *</FieldLabel>
          <SignatureInput value={form.signature_path} onChange={(v) => set("signature_path", v)} clearLabel={t("clearSignature")} invalid={!!errors.signature} />
          <FieldDescription>{t("signatureHelp")}</FieldDescription>
          {errors.signature && <FieldError>{errors.signature}</FieldError>}
        </Field>
      </FieldGroup>
      <div>
        <Button type="submit" disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </div>
    </form>
  );
}
