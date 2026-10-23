"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { WorkflowIcon } from "lucide-react";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { saveCustomField } from "../actions/custom-fields";
import { useDirtyGuard } from "../components/dirty-guard";
import { FamilySelect } from "../components/family-select";
import { useRun } from "../components/use-run";
import { useSiblings } from "../components/use-siblings";
import {
  CHOICES_SEPARATOR, FIELD_NATURES, fieldFamilyNature, fieldRules, fieldTypesFor, type CustomFieldType, type FieldNature,
} from "../meta";
import type { CustomFieldInput } from "../schema";

type Form = Omit<CustomFieldInput, "choices"> & { choicesText: string };

/** ?dialog=custom-field/add/<nature> · custom-field/edit/<id> — spec 01 §6.8. */
export default function CustomFieldDialog({ segments, close }: DialogProps) {
  const t = useTranslations("settings.customFields");
  const tn = useTranslations("settings.fieldNatures");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const run = useRun();
  const isEdit = segments[0] === "edit";
  const id = isEdit ? segments[1] : null;
  const addNature = (FIELD_NATURES as readonly string[]).includes(segments[1]) ? (segments[1] as FieldNature) : "project";
  const empty: Form = {
    nature: addNature, type: "text", name: "", link_type: "default", label_family_id: null, choicesText: "", default_value: "",
    placeholder: "", tooltip: "", description: "", required: false, read_only: false, pdf_field_name: "", variable_name: "",
    text_display: "", display_in_flow_card: false, display_in_flow_banner: false, display_on_flow_opening: false,
  };
  const [form, setForm] = useState<Form>(empty);
  const [initial, setInitial] = useState<Form>(empty);
  const [loaded, setLoaded] = useState(!isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createAnother, setCreateAnother] = useState(false);
  const [pending, startTransition] = useTransition();
  const { requestClose, dialog: guard } = useDirtyGuard(JSON.stringify(form) !== JSON.stringify(initial), close);
  const nature = form.nature as FieldNature;
  const type = form.type as CustomFieldType;
  const r = fieldRules(type, nature);

  useEffect(() => {
    if (!id) return;
    createClient().from("custom_fields").select("*").eq("id", id).single().then(({ data }) => {
      if (!data) return;
      const s = (v: string | null) => v ?? "";
      const v: Form = {
        nature: data.nature as FieldNature, type: data.type, name: data.name, link_type: data.link_type as Form["link_type"],
        label_family_id: data.label_family_id, choicesText: data.choices.join(CHOICES_SEPARATOR), default_value: s(data.default_value),
        placeholder: s(data.placeholder), tooltip: s(data.tooltip), description: s(data.description), required: data.required,
        read_only: data.read_only, pdf_field_name: s(data.pdf_field_name), variable_name: s(data.variable_name),
        text_display: s(data.text_display), display_in_flow_card: data.display_in_flow_card,
        display_in_flow_banner: data.display_in_flow_banner, display_on_flow_opening: data.display_on_flow_opening,
      };
      setForm(v); setInitial(v); setLoaded(true);
    });
  }, [id]);

  const siblings = useSiblings(async () => {
    if (!id) return [];
    const supabase = createClient();
    const { data: self } = await supabase.from("custom_fields").select("nature").eq("id", id).single();
    if (!self) return [];
    const { data } = await supabase.from("custom_fields").select("id").eq("nature", self.nature).is("deleted_at", null).order("sort_order").order("name");
    return (data ?? []).map((x) => x.id);
  }, id, [id]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const choices = form.choicesText.split(CHOICES_SEPARATOR).map((c) => c.trim()).filter(Boolean);

  const submit = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 3) e.name = tg("validators.minLength", { min: 3 });
    if (form.link_type !== "default" && !form.label_family_id) e.label_family_id = tg("validators.required");
    if (r.choices && choices.length === 0) e.choices = tg("validators.required");
    if (r.choices && new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) e.choices = t("errors.duplicateChoice");
    if (r.variable && form.variable_name && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(form.variable_name)) e.variable_name = t("errors.variablePattern");
    setErrors(e);
    if (Object.keys(e).length) return;
    const { choicesText, ...rest } = form;
    void choicesText;
    startTransition(async () => {
      const done = await run(() => saveCustomField(id, { ...rest, choices }), isEdit ? undefined : t("created"));
      if (!done) return;
      if (!isEdit && createAnother) { setForm({ ...empty, nature, type }); return; }
      close();
    });
  };

  const text = (key: "placeholder" | "tooltip" | "pdf_field_name" | "variable_name" | "text_display", help?: string) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={`cf-${key}`}>{t(`fields.${key}`)}</FieldLabel>
      <Input id={`cf-${key}`} value={(form[key] as string) ?? ""} aria-invalid={!!errors[key]} onChange={(ev) => set(key, ev.target.value)} />
      {help && <FieldDescription>{help}</FieldDescription>}
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );
  const sw = (key: "required" | "read_only" | "display_in_flow_card" | "display_in_flow_banner" | "display_on_flow_opening") => (
    <Field orientation="horizontal">
      <Switch id={`cf-${key}`} checked={!!form[key]} onCheckedChange={(v) => set(key, v)} />
      <FieldLabel htmlFor={`cf-${key}`}>{t(`fields.${key}`)}</FieldLabel>
    </Field>
  );
  const defaultInput = () => {
    const value = form.default_value ?? "";
    if (type === "boolean") {
      return (
        <Field orientation="horizontal">
          <Switch id="cf-default" checked={value === "true"} onCheckedChange={(v) => set("default_value", v ? "true" : "false")} />
          <FieldLabel htmlFor="cf-default">{t("fields.default_value")}</FieldLabel>
        </Field>
      );
    }
    const inputType = type === "date" ? "date" : type === "datetime" ? "datetime-local" : type === "integer" || type === "double" ? "number" : "text";
    return (
      <Field>
        <FieldLabel htmlFor="cf-default">{t("fields.default_value")}</FieldLabel>
        {type === "textarea"
          ? <Textarea id="cf-default" value={value} onChange={(ev) => set("default_value", ev.target.value)} />
          : <Input id="cf-default" type={inputType} step={type === "integer" ? 1 : "any"} value={value} onChange={(ev) => set("default_value", ev.target.value)} />}
      </Field>
    );
  };

  return (
    <ModalShell onClose={requestClose} size="md" icon={<EntityIcon kind="settings" icon={WorkflowIcon} size="md" />}
      title={isEdit ? t("editTitle", { name: initial.name }) : t("createTitle", { nature: tn(nature) })}
      subtitle={tn(nature)}
      onPrevious={siblings.previous ? () => dialog.replace(`custom-field/edit/${siblings.previous}`) : undefined}
      onNext={siblings.next ? () => dialog.replace(`custom-field/edit/${siblings.next}`) : undefined}
      footer={<>
        {!isEdit && <label className="mr-auto flex items-center gap-2 text-sm"><Checkbox checked={createAnother} onCheckedChange={(v) => setCreateAnother(!!v)} />{t("createAnother")}</label>}
        <Button variant="secondary" onClick={requestClose}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !loaded}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </>}>
      {!loaded ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>{t("fields.type")} *</FieldLabel>
              <Select value={type} disabled={isEdit} onValueChange={(v) => set("type", v as CustomFieldType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{fieldTypesFor(nature).map((ty) => <SelectItem key={ty} value={ty}>{t(`types.${ty}`)}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              {isEdit && <FieldDescription>{t("frozen")}</FieldDescription>}
            </Field>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="cf-name">{t("fields.name")} *</FieldLabel>
              <Input id="cf-name" value={form.name} aria-invalid={!!errors.name} onChange={(ev) => set("name", ev.target.value)} />
              {errors.name && <FieldError>{errors.name}</FieldError>}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>{t("fields.link_type")} *</FieldLabel>
              <Select value={form.link_type} disabled={isEdit} onValueChange={(v) => setForm((f) => ({ ...f, link_type: v as Form["link_type"], label_family_id: null }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {(["default", "entity_family_parent", "entity_family"] as const).map((l) => <SelectItem key={l} value={l}>{t(`links.${l}`)}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
              <FieldDescription>{t("linkHelp")}</FieldDescription>
            </Field>
            {form.link_type !== "default" && (
              <Field data-invalid={!!errors.label_family_id}>
                <FieldLabel>{t(form.link_type === "entity_family_parent" ? "fields.familyParent" : "fields.familyChild")} *</FieldLabel>
                <FamilySelect nature={fieldFamilyNature(nature)} relative={form.link_type === "entity_family_parent" ? "parent" : "child"}
                  disabled={isEdit} value={form.label_family_id} onChange={(v) => set("label_family_id", v)} invalid={!!errors.label_family_id} />
                {errors.label_family_id && <FieldError>{errors.label_family_id}</FieldError>}
              </Field>
            )}
          </div>
          {r.choices && (
            <Field data-invalid={!!errors.choices}>
              <FieldLabel htmlFor="cf-choices">{t("fields.choices")} *</FieldLabel>
              <Input id="cf-choices" value={form.choicesText} placeholder="A__B__C" aria-invalid={!!errors.choices} onChange={(ev) => set("choicesText", ev.target.value)} />
              <FieldDescription>{t("choicesHelp", { count: choices.length })}</FieldDescription>
              {errors.choices && <FieldError>{errors.choices}</FieldError>}
            </Field>
          )}
          {r.defaultValue && defaultInput()}
          <div className="grid grid-cols-2 gap-4">
            {r.placeholder && text("placeholder")}
            {text("tooltip")}
          </div>
          <Field>
            <FieldLabel htmlFor="cf-description">{t("fields.description")}</FieldLabel>
            <Textarea id="cf-description" value={form.description ?? ""} onChange={(ev) => set("description", ev.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            {r.pdfField && text("pdf_field_name")}
            {r.variable && text("variable_name", t("variableHelp"))}
            {r.textDisplay && text("text_display", t("textDisplayHelp"))}
          </div>
          <FieldSet>
            <FieldLegend variant="label">{t("options")}</FieldLegend>
            {r.required && sw("required")}
            {r.readOnly && sw("read_only")}
            {r.flowDisplay && <>{sw("display_in_flow_card")}{sw("display_in_flow_banner")}{sw("display_on_flow_opening")}</>}
          </FieldSet>
        </FieldGroup>
      )}
      {guard}
    </ModalShell>
  );
}
