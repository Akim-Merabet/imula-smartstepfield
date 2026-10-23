"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FolderOpenIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { CustomFieldsEditor, type CustomFieldDef, type CustomFieldValues } from "@/components/custom-fields/custom-fields-editor";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { createProject, updateProject } from "../actions";
import { CREATABLE_PROJECT_TYPES, type ProjectType } from "../meta";
import type { ProjectInput } from "../schema";

type Option = { id: string; label: string; color?: string };
type Options = { clients: Option[]; families: Option[]; statuses: Option[]; fields: (CustomFieldDef & { link_type: string; label_family_id: string | null })[] };

const EMPTY: ProjectInput = {
  type: "project", designation: "", client_id: "", family_id: "", custom_status_id: null, status_comment: "",
  business_ref: "", location_label: "", description: "", is_contractual: false, contract_ref: "", internal_command: "",
  external_command: "", market_number: "", technical_deal: "", keywords: "", business_domain: "", national_program: "",
  complement_ref_1: "", complement_ref_2: "", export_language_1: "none", export_language_2: "none",
  is_intern_supervised: false, supervision_intern_1: "", supervision_intern_2: "", supervision_intern_3: "",
  is_supervised: false, supervision_1: "", supervision_2: "", supervision_3: "", custom_fields: {},
};

const CONTRACT_FIELDS = [
  ["contract_ref", "contractRef"], ["internal_command", "internalCommand"], ["external_command", "externalCommand"],
  ["market_number", "marketNumber"], ["technical_deal", "technicalDeal"], ["keywords", "keywords"],
  ["business_domain", "businessDomain"], ["national_program", "nationalProgram"],
  ["complement_ref_1", "complementRef1"], ["complement_ref_2", "complementRef2"],
] as const;

function toInput(p: Tables<"projects">, values: CustomFieldValues): ProjectInput {
  const s = (v: string | null) => v ?? "";
  return {
    type: p.type, designation: p.designation, client_id: p.client_id, family_id: p.family_id,
    custom_status_id: p.custom_status_id, status_comment: "", business_ref: s(p.business_ref), location_label: s(p.location_label),
    description: s(p.description), is_contractual: p.is_contractual, contract_ref: s(p.contract_ref),
    internal_command: s(p.internal_command), external_command: s(p.external_command), market_number: s(p.market_number),
    technical_deal: s(p.technical_deal), keywords: s(p.keywords), business_domain: s(p.business_domain),
    national_program: s(p.national_program), complement_ref_1: s(p.complement_ref_1), complement_ref_2: s(p.complement_ref_2),
    export_language_1: p.export_language_1, export_language_2: p.export_language_2,
    is_intern_supervised: p.is_intern_supervised, supervision_intern_1: s(p.supervision_intern_1),
    supervision_intern_2: s(p.supervision_intern_2), supervision_intern_3: s(p.supervision_intern_3),
    is_supervised: p.is_supervised, supervision_1: s(p.supervision_1), supervision_2: s(p.supervision_2),
    supervision_3: s(p.supervision_3), custom_fields: values,
  };
}

/** ?dialog=project/add/general-tab · ?dialog=project/edit/<id>/<onglet> */
export function ProjectFormDialog({ segments, close }: DialogProps) {
  const t = useTranslations("projects");
  const tg = useTranslations("global");
  const router = useRouter();
  const dialog = useDialog();
  const [action, idOrTab, maybeTab] = segments;
  const isEdit = action === "edit";
  const projectId = isEdit ? idOrTab : null;
  const tab = (isEdit ? maybeTab : idOrTab) ?? "general-tab";

  const [options, setOptions] = useState<Options | null>(null);
  const [form, setForm] = useState<ProjectInput>(EMPTY);
  const [initialStatus, setInitialStatus] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createAnother, setCreateAnother] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const [clients, families, statuses, fields] = await Promise.all([
        supabase.from("clients").select("id, name").order("name"),
        supabase.from("label_families").select("id, short_name, long_name, color, parent_id")
          .eq("kind", "family").eq("nature", "project").eq("relative_nature", "child").eq("active", true).is("deleted_at", null)
          .order("priority").order("short_name"),
        supabase.from("custom_statuses").select("id, name, color, is_default").eq("nature", "project").eq("active", true).order("sort_order"),
        supabase.from("custom_fields").select("id, name, type, choices, placeholder, tooltip, description, required, read_only, default_value, link_type, label_family_id")
          .eq("nature", "project").eq("active", true).is("deleted_at", null).order("sort_order"),
      ]);
      if (!active) return;
      setOptions({
        clients: (clients.data ?? []).map((c) => ({ id: c.id, label: c.name })),
        families: (families.data ?? []).map((f) => ({ id: f.id, label: f.long_name ? `${f.short_name} - ${f.long_name}` : f.short_name, color: f.color })),
        statuses: (statuses.data ?? []).map((s) => ({ id: s.id, label: s.name, color: s.color })),
        fields: fields.data ?? [],
      });
      if (!isEdit) {
        const def = statuses.data?.find((s) => s.is_default);
        setForm((f) => ({ ...f, custom_status_id: def?.id ?? null }));
        return;
      }
      const [{ data: project }, { data: values }] = await Promise.all([
        supabase.from("projects").select("*").eq("id", projectId!).single(),
        supabase.from("custom_field_values").select("custom_field_id, value_text, value_json").eq("object_id", projectId!),
      ]);
      if (!active || !project) return;
      const cf: CustomFieldValues = {};
      for (const v of values ?? []) cf[v.custom_field_id] = Array.isArray(v.value_json) ? (v.value_json as string[]) : v.value_text;
      setForm(toInput(project, cf));
      setInitialStatus(project.custom_status_id);
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [isEdit, projectId]);

  const fields = useMemo(() => (options?.fields ?? []).filter((f) =>
    f.link_type === "default" || f.label_family_id === form.family_id), [options, form.family_id]);

  const set = <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const goTab = (id: string) => dialog.replace(isEdit ? `project/edit/${projectId}/${id}` : `project/add/${id}`);

  const validate = () => {
    const e: Record<string, string> = {};
    if ((form.designation ?? "").trim().length < 3) e.designation = tg("validators.minLength", { min: 3 });
    if (!form.client_id) e.client_id = tg("validators.required");
    if (!form.family_id) e.family_id = tg("validators.required");
    if (form.is_intern_supervised && !form.supervision_intern_1) e.supervision_intern_1 = tg("validators.required");
    if (form.is_supervised && !form.supervision_1) e.supervision_1 = tg("validators.required");
    setErrors(e);
    if (e.designation || e.client_id || e.family_id) goTab("general-tab");
    else if (e.supervision_intern_1 || e.supervision_1) goTab("options-tab");
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    startTransition(async () => {
      const result = isEdit ? await updateProject(projectId!, form) : await createProject(form);
      if (!result.ok) {
        notify.error(result.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error"));
        return;
      }
      notify.success(isEdit ? tg("toast.saved") : t("dialog.created"));
      router.refresh();
      if (!isEdit && createAnother) { setForm({ ...EMPTY, custom_status_id: form.custom_status_id }); return; }
      close();
    });
  };

  const tabs = [
    { id: "general-tab", label: t("dialog.tabs.general") },
    ...(isEdit ? [{ id: "attribute-tab", label: t("dialog.tabs.attributes") }, { id: "options-tab", label: t("dialog.tabs.options") }] : []),
  ];

  const text = (key: keyof ProjectInput, label: string, extra?: { placeholder?: string }) => (
    <Field data-invalid={!!errors[key as string]}>
      <FieldLabel htmlFor={`p-${key}`}>{label}</FieldLabel>
      <Input id={`p-${key}`} value={(form[key] as string) ?? ""} placeholder={extra?.placeholder}
        aria-invalid={!!errors[key as string]} onChange={(e) => set(key, e.target.value as never)} />
      {errors[key as string] && <FieldError>{errors[key as string]}</FieldError>}
    </Field>
  );

  const select = (key: "client_id" | "family_id" | "custom_status_id", label: string, items: Option[], disabled?: boolean, help?: string) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel>{label}{key !== "custom_status_id" && " *"}</FieldLabel>
      <Select value={(form[key] as string) || undefined} onValueChange={(v) => set(key, v)} disabled={disabled}>
        <SelectTrigger aria-invalid={!!errors[key]}><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.color && <span className="size-3 rounded-sm" style={{ backgroundColor: o.color }} />}{o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {help && <FieldDescription>{help}</FieldDescription>}
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );

  const languages = ["none", "fr", "en", "de", "it"] as const;

  return (
    <ModalShell
      onClose={close}
      icon={<EntityIcon kind={(form.type as ProjectType) ?? "project"} icon={FolderOpenIcon} size="md" />}
      title={isEdit ? t("dialog.editTitle", { type: form.type, name: form.designation }) : t("dialog.createTitle")}
      tabs={tabs}
      activeTab={tab}
      onTabChange={goTab}
      footer={
        <>
          {!isEdit && (
            <label className="mr-auto flex items-center gap-2 text-sm">
              <Checkbox checked={createAnother} onCheckedChange={(v) => setCreateAnother(!!v)} />{t("dialog.createAnother")}
            </label>
          )}
          <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
          <Button onClick={submit} disabled={pending || !loaded}>
            {pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}
          </Button>
        </>
      }>
      {!options || !loaded ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : tab === "attribute-tab" ? (
        <CustomFieldsEditor fields={fields} values={(form.custom_fields ?? {}) as CustomFieldValues}
          onChange={(v) => set("custom_fields", v)} emptyLabel={t("dialog.noAttributes")} />
      ) : tab === "options-tab" ? (
        <FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            {(["export_language_1", "export_language_2"] as const).map((key, i) => (
              <Field key={key}>
                <FieldLabel>{t(i === 0 ? "dialog.language1" : "dialog.language2")}</FieldLabel>
                <Select value={form[key]} disabled={isEdit} onValueChange={(v) => set(key, v as never)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>{languages.map((l) => <SelectItem key={l} value={l}>{t(`languages.${l}`)}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
                {isEdit && <FieldDescription>{t("dialog.languageLocked")}</FieldDescription>}
              </Field>
            ))}
          </div>
          {([["is_intern_supervised", "supervision_intern_", "internSupervision", "internSupervisor"],
             ["is_supervised", "supervision_", "externSupervision", "externSupervisor"]] as const).map(([flag, prefix, toggleKey, labelKey]) => (
            <FieldSet key={flag}>
              <Field orientation="horizontal">
                <Switch id={flag} checked={!!form[flag]} onCheckedChange={(v) => set(flag, v)} />
                <FieldLabel htmlFor={flag}>{t(`dialog.${toggleKey}`)}</FieldLabel>
              </Field>
              {form[flag] && (
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map((n) => (
                    <div key={n}>{text(`${prefix}${n}` as keyof ProjectInput, `${t(`dialog.${labelKey}`, { n })}${n === 1 ? " *" : ""}`)}</div>
                  ))}
                </div>
              )}
            </FieldSet>
          ))}
          {isEdit && <Alert><AlertDescription>{t("dialog.supervisionWarning")}</AlertDescription></Alert>}
        </FieldGroup>
      ) : (
        <FieldGroup>
          {isEdit && <Alert><AlertDescription>{t("dialog.editWarning")}</AlertDescription></Alert>}
          <Field>
            <FieldLabel>{t("dialog.type")} *</FieldLabel>
            <ToggleGroup type="single" variant="outline" value={form.type} disabled={isEdit}
              onValueChange={(v) => v && set("type", v as ProjectType)} className="justify-start">
              {CREATABLE_PROJECT_TYPES.map((type) => (
                <ToggleGroupItem key={type} value={type} className="px-3">{t(`types.${type}`)}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          {text("designation", `${t("dialog.designation")} *`, { placeholder: t("dialog.designationPlaceholder") })}
          <div className="grid grid-cols-2 gap-4">
            {select("client_id", t("dialog.client"), options.clients, isEdit, t("dialog.clientHelp"))}
            {select("family_id", t("dialog.family"), options.families, false, t("dialog.familyHelp"))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {select("custom_status_id", t("dialog.status"), options.statuses)}
            {text("business_ref", t("dialog.reference"))}
          </div>
          {isEdit && form.custom_status_id !== initialStatus && (
            <Field>
              <FieldLabel htmlFor="status_comment">{t("dialog.statusComment")}</FieldLabel>
              <Textarea id="status_comment" value={form.status_comment ?? ""} onChange={(e) => set("status_comment", e.target.value)} />
            </Field>
          )}
          {text("location_label", t("dialog.location"))}
          <Field>
            <FieldLabel htmlFor="description">{t("dialog.description")}</FieldLabel>
            <Textarea id="description" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field orientation="horizontal">
            <Switch id="is_contractual" checked={!!form.is_contractual} onCheckedChange={(v) => set("is_contractual", v)} />
            <FieldLabel htmlFor="is_contractual">{t("dialog.contractToggle")}</FieldLabel>
          </Field>
          {form.is_contractual && (
            <div className="grid grid-cols-2 gap-4">
              {CONTRACT_FIELDS.map(([key, label]) => <div key={key}>{text(key, t(`dialog.${label}`))}</div>)}
            </div>
          )}
        </FieldGroup>
      )}
    </ModalShell>
  );
}
