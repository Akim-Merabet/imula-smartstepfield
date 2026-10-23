"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { FlagIcon } from "lucide-react";
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
import { saveStatus } from "../actions/statuses";
import { ColorField } from "../components/color-field";
import { useDirtyGuard } from "../components/dirty-guard";
import { FamilySelect } from "../components/family-select";
import { useRun } from "../components/use-run";
import { useSiblings } from "../components/use-siblings";
import { STATUS_CATEGORIES, STATUS_NATURES, statusFamilyNature, statusLinkTypes, statusRules, type LinkType, type StatusNature } from "../meta";
import type { StatusInput } from "../schema";

/** ?dialog=status/add/<nature> · status/edit/<id> — spec 01 §6.7. */
export default function StatusDialog({ segments, close }: DialogProps) {
  const t = useTranslations("settings.statuses");
  const tn = useTranslations("settings.statusNatures");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const run = useRun();
  const isEdit = segments[0] === "edit";
  const id = isEdit ? segments[1] : null;
  const addNature = (STATUS_NATURES as readonly string[]).includes(segments[1]) ? (segments[1] as StatusNature) : "flow";
  const empty: StatusInput = {
    nature: addNature, name: "", description: "", color: "#2563eb", category: "todo", link_type: "default", label_family_id: null,
    is_default: false, downloadable: false, importable: false, exportable: false, hide_entity: false,
  };
  const [form, setForm] = useState<StatusInput>(empty);
  const [initial, setInitial] = useState<StatusInput>(empty);
  const [loaded, setLoaded] = useState(!isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createAnother, setCreateAnother] = useState(false);
  const [pending, startTransition] = useTransition();
  const { requestClose, dialog: guard } = useDirtyGuard(JSON.stringify(form) !== JSON.stringify(initial), close);
  const nature = form.nature as StatusNature;
  const rules = statusRules(nature);
  const links = statusLinkTypes(nature);

  useEffect(() => {
    if (!id) return;
    createClient().from("custom_statuses").select("*").eq("id", id).single().then(({ data }) => {
      if (!data) return;
      const v: StatusInput = {
        nature: data.nature as StatusNature, name: data.name, description: data.description ?? "", color: data.color, category: data.category,
        link_type: data.link_type, label_family_id: data.label_family_id, is_default: data.is_default, downloadable: data.downloadable,
        importable: data.importable, exportable: data.exportable, hide_entity: data.hide_entity,
      };
      setForm(v); setInitial(v); setLoaded(true);
    });
  }, [id]);

  const siblings = useSiblings(async () => {
    if (!id) return [];
    const supabase = createClient();
    const { data: self } = await supabase.from("custom_statuses").select("nature").eq("id", id).single();
    if (!self) return [];
    const { data } = await supabase.from("custom_statuses").select("id").eq("nature", self.nature).order("sort_order").order("name");
    return (data ?? []).map((r) => r.id);
  }, id, [id]);

  const set = <K extends keyof StatusInput>(key: K, value: StatusInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 3) e.name = tg("validators.minLength", { min: 3 });
    if (form.description && form.description.trim().length > 0 && form.description.trim().length < 3) e.description = tg("validators.minLength", { min: 3 });
    if (form.link_type !== "default" && !form.label_family_id) e.label_family_id = tg("validators.required");
    setErrors(e);
    if (Object.keys(e).length) return;
    startTransition(async () => {
      const done = await run(() => saveStatus(id, form), isEdit ? undefined : t("created"));
      if (!done) return;
      if (!isEdit && createAnother) { setForm({ ...empty, nature }); return; }
      close();
    });
  };

  const sw = (key: "is_default" | "downloadable" | "importable" | "exportable" | "hide_entity", label: string, disabled = false) => (
    <Field orientation="horizontal">
      <Switch id={`st-${key}`} checked={!!form[key]} disabled={disabled} onCheckedChange={(v) => set(key, v)} />
      <FieldLabel htmlFor={`st-${key}`}>{label}</FieldLabel>
    </Field>
  );
  const linkRelative = (l: LinkType) => (l === "entity_family_parent" || l === "entity_parent_family_parent" ? "parent" : "child");

  return (
    <ModalShell onClose={requestClose} size="md" icon={<EntityIcon kind="settings" icon={FlagIcon} size="md" />}
      title={isEdit ? t("editTitle", { name: initial.name }) : t("createTitle", { nature: tn(nature) })}
      subtitle={tn(nature)}
      onPrevious={siblings.previous ? () => dialog.replace(`status/edit/${siblings.previous}`) : undefined}
      onNext={siblings.next ? () => dialog.replace(`status/edit/${siblings.next}`) : undefined}
      footer={<>
        {!isEdit && <label className="mr-auto flex items-center gap-2 text-sm"><Checkbox checked={createAnother} onCheckedChange={(v) => setCreateAnother(!!v)} />{t("createAnother")}</label>}
        <Button variant="secondary" onClick={requestClose}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !loaded}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </>}>
      {!loaded ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <FieldGroup>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="st-name">{t("fields.name")} *</FieldLabel>
            <Input id="st-name" value={form.name} aria-invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>
          <Field data-invalid={!!errors.description}>
            <FieldLabel htmlFor="st-desc">{t("fields.description")}</FieldLabel>
            <Textarea id="st-desc" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
            <FieldDescription>{t("descriptionHelp")}</FieldDescription>
            {errors.description && <FieldError>{errors.description}</FieldError>}
          </Field>
          <ColorField label={t("fields.color")} value={form.color} onChange={(v) => set("color", v)} />
          {rules.category && (
            <Field>
              <FieldLabel>{t("fields.category")} *</FieldLabel>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as StatusInput["category"], hide_entity: v === "done" ? f.hide_entity : false }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{STATUS_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`categories.${c}`)}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
          )}
          {rules.family && (
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>{t("fields.linkType")} *</FieldLabel>
                <Select value={form.link_type} disabled={isEdit} onValueChange={(v) => setForm((f) => ({ ...f, link_type: v as LinkType, label_family_id: null }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>{links.map((l) => <SelectItem key={l} value={l}>{t(`links.${nature === "technical_object" ? `object_${l}` : l}` as never)}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
                {isEdit && <FieldDescription>{t("frozen")}</FieldDescription>}
              </Field>
              {form.link_type !== "default" && (
                <Field data-invalid={!!errors.label_family_id}>
                  <FieldLabel>{t(linkRelative(form.link_type as LinkType) === "parent" ? "fields.familyParent" : "fields.familyChild")} *</FieldLabel>
                  <FamilySelect nature={statusFamilyNature(nature)} relative={linkRelative(form.link_type as LinkType)} disabled={isEdit}
                    value={form.label_family_id} onChange={(v) => set("label_family_id", v)} invalid={!!errors.label_family_id} />
                  {errors.label_family_id && <FieldError>{errors.label_family_id}</FieldError>}
                </Field>
              )}
            </div>
          )}
          {(rules.isDefault || rules.downloadable || rules.importable || rules.exportable || rules.hideEntity) && (
            <FieldSet>
              <FieldLegend variant="label">{t("options")}</FieldLegend>
              {rules.isDefault && sw("is_default", t("fields.isDefault"), isEdit && initial.is_default)}
              {rules.downloadable && sw("downloadable", t("fields.downloadable"))}
              {rules.importable && sw("importable", t("fields.importable"))}
              {rules.exportable && sw("exportable", t("fields.exportable"))}
              {rules.hideEntity && sw("hide_entity", t(nature === "flow" ? "fields.hideFlow" : "fields.hideEntity"), form.category !== "done")}
            </FieldSet>
          )}
          {nature === "multi_pr" && <FieldDescription>{t("noOptions")}</FieldDescription>}
        </FieldGroup>
      )}
      {guard}
    </ModalShell>
  );
}
