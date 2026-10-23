"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { Tables } from "@/lib/supabase/database.types";
import { createAccount, updateGeneralAccount } from "../actions/account";
import type { GeneralAccountInput } from "../schema";
import { useRun } from "./use-run";

const INDEX_FORMATS = ["alpha", "numeric", "numeric_zero", "numeric_all_zero", "numeric_all_zero_start_zero", "numeric_decimal", "numeric_decimal_start_zero"] as const;
const LANGS = ["none", "fr", "en", "de", "it"] as const;

/** Administration plateforme › Général › Compte (spec 01 §6.2) : comptes + configuration modules / documents. */
export function GeneralAccountForm({ accounts, account }: { accounts: { id: string; name: string }[]; account: Tables<"accounts"> }) {
  const t = useTranslations("settings.generalAccount");
  const tg = useTranslations("global");
  const router = useRouter();
  const run = useRun();
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [form, setForm] = useState<GeneralAccountInput>({
    pgac_enabled: account.pgac_enabled, pgac_subcontractors: account.pgac_subcontractors.join("__"),
    file_module_enabled: account.file_module_enabled, freeze_signature_date: account.freeze_signature_date,
    local_form_creation: account.local_form_creation, auto_lock_form_responses: account.auto_lock_form_responses,
    hide_multi_pr_titles: account.hide_multi_pr_titles, default_sequence_type: account.default_sequence_type as "linear" | "parallel",
    default_phase_type: account.default_phase_type as "linear" | "parallel", doc_language_1: account.doc_language_1,
    doc_language_2: account.doc_language_2, doc_index_format: account.doc_index_format, doc_watermark: account.doc_watermark ?? "",
    time_zone: account.time_zone,
  });
  const set = <K extends keyof GeneralAccountInput>(k: K, v: GeneralAccountInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const sw = (k: "pgac_enabled" | "file_module_enabled" | "freeze_signature_date" | "local_form_creation" | "auto_lock_form_responses" | "hide_multi_pr_titles") => (
    <Field orientation="horizontal">
      <Switch id={`ga-${k}`} checked={!!form[k]} onCheckedChange={(v) => set(k, v)} />
      <FieldLabel htmlFor={`ga-${k}`}>{t(`fields.${k}`)}</FieldLabel>
    </Field>
  );
  const select = <K extends "default_sequence_type" | "default_phase_type" | "doc_language_1" | "doc_language_2" | "doc_index_format">(
    k: K, values: readonly string[], labelPrefix: string) => (
    <Field>
      <FieldLabel>{t(`fields.${k}` as never)}</FieldLabel>
      <Select value={form[k] as string} onValueChange={(v) => set(k, v as GeneralAccountInput[K])}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>{values.map((v) => <SelectItem key={v} value={v}>{t(`${labelPrefix}.${v}` as never)}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
    </Field>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-card p-6">
      <FieldGroup className="max-w-4xl">
        <FieldSet>
          <FieldLegend>{t("sections.accounts")}</FieldLegend>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>{t("fields.account")}</FieldLabel>
              <Select value={account.id} onValueChange={(v) => router.push(`?account=${v}`)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="ga-new">{t("fields.newAccount")}</FieldLabel>
              <div className="flex gap-2">
                <Input id="ga-new" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Button variant="secondary" disabled={newName.trim().length < 3 || pending}
                  onClick={() => startTransition(async () => { if (await run(() => createAccount(newName), t("accountCreated"))) setNewName(""); })}>
                  <PlusIcon data-icon="inline-start" />{tg("actions.add")}
                </Button>
              </div>
            </Field>
          </div>
        </FieldSet>
        <FieldSet>
          <FieldLegend>{t("sections.modules")}</FieldLegend>
          {sw("pgac_enabled")}
          {form.pgac_enabled && (
            <Field>
              <FieldLabel htmlFor="ga-sub">{t("fields.pgac_subcontractors")}</FieldLabel>
              <Input id="ga-sub" value={form.pgac_subcontractors ?? ""} placeholder="A__B__C" onChange={(e) => set("pgac_subcontractors", e.target.value)} />
              <FieldDescription>{t("subcontractorsHelp")}</FieldDescription>
            </Field>
          )}
          {sw("file_module_enabled")}
          {sw("freeze_signature_date")}
          {sw("local_form_creation")}
          {sw("auto_lock_form_responses")}
          {sw("hide_multi_pr_titles")}
          <div className="grid grid-cols-2 gap-4">
            {select("default_sequence_type", ["linear", "parallel"], "sequencing")}
            {select("default_phase_type", ["linear", "parallel"], "sequencing")}
          </div>
        </FieldSet>
        <FieldSet>
          <FieldLegend>{t("sections.documents")}</FieldLegend>
          <div className="grid grid-cols-2 gap-4">
            {select("doc_language_1", LANGS, "languages")}
            {select("doc_language_2", LANGS, "languages")}
            {select("doc_index_format", INDEX_FORMATS, "indexFormats")}
            <Field>
              <FieldLabel htmlFor="ga-wm">{t("fields.doc_watermark")}</FieldLabel>
              <Input id="ga-wm" value={form.doc_watermark ?? ""} onChange={(e) => set("doc_watermark", e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ga-tz">{t("fields.time_zone")} *</FieldLabel>
              <Input id="ga-tz" value={form.time_zone} onChange={(e) => set("time_zone", e.target.value)} />
            </Field>
          </div>
        </FieldSet>
        <div className="flex justify-end">
          <Button disabled={pending || !form.time_zone.trim()} onClick={() => startTransition(async () => { await run(() => updateGeneralAccount(account.id, form)); })}>
            {pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}
          </Button>
        </div>
      </FieldGroup>
    </div>
  );
}
