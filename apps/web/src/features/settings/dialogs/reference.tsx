"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ToolboxIcon } from "lucide-react";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createClient } from "@/lib/supabase/client";
import { saveReference } from "../actions/references";
import { useDirtyGuard } from "../components/dirty-guard";
import { FamilySelect } from "../components/family-select";
import { useRun } from "../components/use-run";
import {
  NOMENCLATURE_VARIABLES, REFERENCE_NATURES, referenceFamilyNature, referenceFields, referenceLinkTypes, type LinkType, type ReferenceNature,
} from "../meta";
import type { ReferenceInput } from "../schema";

const EMPTY: ReferenceInput = {
  nature: "project", field: "ref_int", link_type: "default", label_family_id: null, nomenclature: "{counter}",
  counter_type: "global", counter_format: 4, start_value: 1,
};

/** ?dialog=reference/add · reference/edit/<id> — spec 01 §6.9. */
export default function ReferenceDialog({ segments, close }: DialogProps) {
  const t = useTranslations("settings.references");
  const tn = useTranslations("settings.referenceNatures");
  const tg = useTranslations("global");
  const run = useRun();
  const isEdit = segments[0] === "edit";
  const id = isEdit ? segments[1] : null;
  const [form, setForm] = useState<ReferenceInput>(EMPTY);
  const [initial, setInitial] = useState<ReferenceInput>(EMPTY);
  const [loaded, setLoaded] = useState(!isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const { requestClose, dialog: guard } = useDirtyGuard(JSON.stringify(form) !== JSON.stringify(initial), close);
  const nature = form.nature as ReferenceNature;
  const link = form.link_type as LinkType;

  useEffect(() => {
    if (!id) return;
    createClient().from("reference_rules").select("*").eq("id", id).single().then(({ data }) => {
      if (!data) return;
      const v: ReferenceInput = {
        nature: data.nature as ReferenceNature, field: data.field, link_type: data.link_type, label_family_id: data.label_family_id,
        nomenclature: data.nomenclature, counter_type: data.counter_type, counter_format: data.counter_format, start_value: data.start_value,
      };
      setForm(v); setInitial(v); setLoaded(true);
    });
  }, [id]);

  const set = <K extends keyof ReferenceInput>(key: K, value: ReferenceInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const relative = link === "entity_family_parent" || link === "entity_parent_family_parent" ? "parent" : "child";

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.nomenclature.includes("{counter}")) e.nomenclature = t("errors.nomenclature");
    if (link !== "default" && !form.label_family_id) e.label_family_id = tg("validators.required");
    setErrors(e);
    if (Object.keys(e).length) return;
    startTransition(async () => {
      if (await run(() => saveReference(id, form), isEdit ? undefined : t("created"))) close();
    });
  };

  return (
    <ModalShell onClose={requestClose} size="md" icon={<EntityIcon kind="settings" icon={ToolboxIcon} size="md" />}
      title={isEdit ? t("editTitle") : t("createTitle")}
      footer={<>
        <Button variant="secondary" onClick={requestClose}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !loaded}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </>}>
      {!loaded ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>{t("columns.nature")} *</FieldLabel>
              <Select value={nature} disabled={isEdit} onValueChange={(v) => setForm((f) => ({
                ...f, nature: v as ReferenceNature, field: referenceFields(v as ReferenceNature)[0], link_type: "default", label_family_id: null,
              }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{REFERENCE_NATURES.map((n) => <SelectItem key={n} value={n}>{tn(n)}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{t("columns.field")} *</FieldLabel>
              <Select value={form.field} disabled={isEdit} onValueChange={(v) => set("field", v as ReferenceInput["field"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {referenceFields(nature).map((f) => <SelectItem key={f} value={f}>{t(`fieldsByNature.${nature}.${f}` as never)}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>{t("columns.link")} *</FieldLabel>
              <Select value={link} disabled={isEdit} onValueChange={(v) => setForm((f) => ({ ...f, link_type: v as LinkType, label_family_id: null }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{referenceLinkTypes(nature).map((l) => <SelectItem key={l} value={l}>{t(`links.${l}`)}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
            {link !== "default" && (
              <Field data-invalid={!!errors.label_family_id}>
                <FieldLabel>{t(relative === "parent" ? "familyParent" : "familyChild")} *</FieldLabel>
                <FamilySelect nature={referenceFamilyNature(nature, link)} relative={relative} disabled={isEdit}
                  value={form.label_family_id} onChange={(v) => set("label_family_id", v)} invalid={!!errors.label_family_id} />
                {errors.label_family_id && <FieldError>{errors.label_family_id}</FieldError>}
              </Field>
            )}
          </div>
          {isEdit && <FieldDescription>{t("frozen")}</FieldDescription>}
          <Field data-invalid={!!errors.nomenclature}>
            <FieldLabel htmlFor="ref-nom">{t("columns.nomenclature")} *</FieldLabel>
            <Input id="ref-nom" value={form.nomenclature} aria-invalid={!!errors.nomenclature} className="font-mono" onChange={(e) => set("nomenclature", e.target.value)} />
            <FieldDescription>{t("nomenclatureHelp", { variables: NOMENCLATURE_VARIABLES.join(", ") })}</FieldDescription>
            {errors.nomenclature && <FieldError>{errors.nomenclature}</FieldError>}
          </Field>
          <Field>
            <FieldLabel>{t("fields.counterType")}</FieldLabel>
            <ToggleGroup type="single" variant="outline" value={form.counter_type} disabled={isEdit} className="justify-start"
              onValueChange={(v) => v && set("counter_type", v as "global" | "local")}>
              <ToggleGroupItem value="global" className="px-3">{t("counterTypes.global")}</ToggleGroupItem>
              <ToggleGroupItem value="local" className="px-3">{t("counterTypes.local")}</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>{t(`counterHelp.${form.counter_type}`)}</FieldDescription>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="ref-format">{t("fields.counterFormat")} *</FieldLabel>
              <Input id="ref-format" type="number" min={4} max={8} value={form.counter_format}
                onChange={(e) => set("counter_format", Math.min(8, Math.max(4, Number(e.target.value) || 4)))} />
              <FieldDescription>{t("formatPreview", { value: String(form.start_value ?? 1).padStart(form.counter_format, "0") })}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="ref-start">{t("fields.startValue")}</FieldLabel>
              <Input id="ref-start" type="number" min={0} value={form.start_value ?? 1} onChange={(e) => set("start_value", Math.max(0, Number(e.target.value) || 0))} />
            </Field>
          </div>
        </FieldGroup>
      )}
      {guard}
    </ModalShell>
  );
}
