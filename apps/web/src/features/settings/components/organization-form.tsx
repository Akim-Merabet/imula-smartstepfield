"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { Tables } from "@/lib/supabase/database.types";
import { updateOrganization } from "../actions/account";
import type { OrganizationInput } from "../schema";
import { useRun } from "./use-run";

/** Administration plateforme › Général › Organisation (spec 01 §6.3). */
export function OrganizationForm({ organization }: { organization: Tables<"organizations"> }) {
  const t = useTranslations("settings.organization");
  const tg = useTranslations("global");
  const run = useRun();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<OrganizationInput>({
    allowed_download_response: organization.allowed_download_response,
    block_form_response_edition: organization.block_form_response_edition,
    diagram_enabled: organization.diagram_enabled,
    link_expiration_days: organization.link_expiration_days,
    links_form_attributes_enabled: organization.links_form_attributes_enabled,
    local_form_allowed: organization.local_form_allowed,
    number_format: organization.number_format,
    rubric_permissions_enabled: organization.rubric_permissions_enabled,
    support_chat_enabled: organization.support_chat_enabled,
  });
  const set = <K extends keyof OrganizationInput>(k: K, v: OrganizationInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const days = form.link_expiration_days;
  const invalidDays = !Number.isInteger(days) || days < 1 || days > 90;

  const sw = (k: "block_form_response_edition" | "diagram_enabled" | "links_form_attributes_enabled" | "local_form_allowed" | "rubric_permissions_enabled" | "support_chat_enabled", disabled = false, help?: string) => (
    <Field orientation="horizontal">
      <Switch id={`org-${k}`} checked={!!form[k]} disabled={disabled} onCheckedChange={(v) => set(k, v)} />
      <div className="flex flex-col gap-0.5">
        <FieldLabel htmlFor={`org-${k}`}>{t(`fields.${k}`)}</FieldLabel>
        {help && <FieldDescription>{help}</FieldDescription>}
      </div>
    </Field>
  );

  const submit = () => startTransition(async () => {
    const reload = form.support_chat_enabled !== organization.support_chat_enabled;
    const done = await run(() => updateOrganization(form));
    if (done && reload) window.location.reload();
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-card p-6">
      <FieldGroup className="max-w-3xl">
        <FieldSet>
          <FieldLegend>{t("sections.mobile")}</FieldLegend>
          <Field>
            <FieldLabel htmlFor="org-download">{t("fields.allowed_download_response")}</FieldLabel>
            <Input id="org-download" type="number" min={0} className="w-40" value={form.allowed_download_response ?? ""}
              onChange={(e) => set("allowed_download_response", e.target.value === "" ? null : Number(e.target.value))} />
          </Field>
          {sw("block_form_response_edition")}
        </FieldSet>
        <FieldSet>
          <FieldLegend>{t("sections.features")}</FieldLegend>
          {sw("diagram_enabled")}
          {sw("links_form_attributes_enabled")}
          {sw("local_form_allowed", organization.local_form_allowed, t("localFormIrreversible"))}
          {sw("rubric_permissions_enabled")}
          {sw("support_chat_enabled", false, t("supportChatHelp"))}
        </FieldSet>
        <FieldSet>
          <FieldLegend>{t("sections.sharing")}</FieldLegend>
          <Field data-invalid={invalidDays}>
            <FieldLabel htmlFor="org-days">{t("fields.link_expiration_days")}</FieldLabel>
            <Input id="org-days" type="number" min={1} max={90} className="w-40" value={days} aria-invalid={invalidDays}
              onChange={(e) => set("link_expiration_days", Number(e.target.value))} />
            <FieldDescription>{t("daysHelp")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>{t("fields.number_format")}</FieldLabel>
            <Select value={form.number_format} onValueChange={(v) => set("number_format", v as "fr" | "en")}>
              <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="fr">{t("numberFormats.fr")}</SelectItem>
                <SelectItem value="en">{t("numberFormats.en")}</SelectItem>
              </SelectGroup></SelectContent>
            </Select>
          </Field>
        </FieldSet>
        <Alert><AlertDescription>{t("pdfTranslationsUnavailable")}</AlertDescription></Alert>
        <div className="flex justify-end">
          <Button onClick={submit} disabled={pending || invalidDays}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
        </div>
      </FieldGroup>
    </div>
  );
}
