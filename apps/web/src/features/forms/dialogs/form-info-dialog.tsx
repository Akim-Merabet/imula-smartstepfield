"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardListIcon, FileUpIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";
import { createLibraryForm, updateFormInfo } from "../actions";
import { useActionError } from "../components/form-chips";
import { FORM_FILES_BUCKET } from "../meta";
import { creatableNatures } from "../permissions";
import type { FormInfoInput } from "../schema";

type Opt = { id: string; label: string; color?: string };
type Options = { families: Opt[]; statuses: (Opt & { is_default: boolean })[]; companies: Opt[]; accounts: Opt[]; objectFamilies: Opt[] };
type HideKey = "control_doc" | "forms_doc" | "multi_instr_doc" | "instr_doc";

const EMPTY: FormInfoInput = {
  nature: "generic", name: "", description: "", reference: "", index_label: "", family_id: "", account_id: null, company_ids: [],
  custom_status_id: null, status_change_comment: "", additional_comment: "", additional_observation: "", lock_responses: false,
  object_attributes_link: "disabled", object_family_id: null, pdf_template: { enabled: false },
  hide_in_exports: { control_doc: false, forms_doc: false, multi_instr_doc: false, instr_doc: false },
};

/** ?dialog=form-lib/add/general-tab · ?dialog=form-lib/edit/<id>/<general-tab|options-tab> */
export function FormInfoDialog({ segments, close }: DialogProps) {
  const t = useTranslations("forms.dialog");
  const tf = useTranslations("forms");
  const tg = useTranslations("global");
  const router = useRouter();
  const dialog = useDialog();
  const errorText = useActionError();
  const [action, idOrTab, maybeTab] = segments;
  const isEdit = action === "edit";
  const formId = isEdit ? idOrTab : null;
  const tab = (isEdit ? maybeTab : idOrTab) ?? "general-tab";

  const [options, setOptions] = useState<Options | null>(null);
  const [natures, setNatures] = useState<("model" | "generic")[]>([]);
  const [form, setForm] = useState<FormInfoInput>(EMPTY);
  const [location, setLocation] = useState<Enums<"form_location">>("library");
  const [initialStatus, setInitialStatus] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      const [families, statuses, companies, accounts, objectFamilies, me] = await Promise.all([
        supabase.from("label_families").select("id, short_name, long_name, color").eq("kind", "family").eq("nature", "form")
          .eq("relative_nature", "child").eq("active", true).is("deleted_at", null).is("project_id", null).order("priority").order("short_name"),
        supabase.from("custom_statuses").select("id, name, color, is_default").eq("nature", "form").eq("active", true).order("sort_order"),
        supabase.from("companies").select("id, name").order("name"),
        supabase.from("accounts").select("id, name").order("name"),
        supabase.from("label_families").select("id, short_name, long_name").eq("kind", "family").eq("nature", "technical_object")
          .eq("active", true).is("deleted_at", null).order("short_name"),
        supabase.from("collaborators").select("authority, additional_rights, account_id").eq("auth_user_id", user.user?.id ?? "").maybeSingle(),
      ]);
      if (!active) return;
      const label = (f: { short_name: string; long_name: string | null }) => (f.long_name ? `${f.short_name} - ${f.long_name}` : f.short_name);
      setOptions({
        families: (families.data ?? []).map((f) => ({ id: f.id, label: label(f), color: f.color })),
        statuses: (statuses.data ?? []).map((s) => ({ id: s.id, label: s.name, color: s.color, is_default: s.is_default })),
        companies: (companies.data ?? []).map((c) => ({ id: c.id, label: c.name })),
        accounts: (accounts.data ?? []).map((a) => ({ id: a.id, label: a.name })),
        objectFamilies: (objectFamilies.data ?? []).map((f) => ({ id: f.id, label: label(f) })),
      });
      const allowed = me.data ? creatableNatures(me.data) : [];
      setNatures(allowed);
      if (!isEdit) {
        const def = statuses.data?.find((s) => s.is_default);
        setForm((f) => ({ ...f, nature: allowed.includes("generic") ? "generic" : allowed[0] ?? "generic", custom_status_id: def?.id ?? null, account_id: me.data?.account_id ?? null }));
        return;
      }
      const [{ data: row }, { data: links }] = await Promise.all([
        supabase.from("forms").select("*").eq("id", formId!).single(),
        supabase.from("form_companies").select("company_id").eq("form_id", formId!),
      ]);
      if (!active || !row) return;
      const pdf = (row.pdf_template ?? { enabled: false }) as FormInfoInput["pdf_template"];
      const hide = (row.hide_in_exports ?? {}) as Partial<Record<HideKey, boolean>>;
      setLocation(row.location);
      setForm({
        nature: row.nature, name: row.name, description: row.description ?? "", reference: row.reference ?? "", index_label: row.index_label ?? "",
        family_id: row.family_id ?? "", account_id: row.account_id, company_ids: (links ?? []).map((l) => l.company_id),
        custom_status_id: row.custom_status_id, status_change_comment: "", additional_comment: row.additional_comment ?? "",
        additional_observation: row.additional_observation ?? "", lock_responses: row.lock_responses,
        object_attributes_link: row.object_attributes_link, object_family_id: row.object_family_id,
        pdf_template: { enabled: !!pdf?.enabled, file_id: pdf?.file_id ?? null, file_name: pdf?.file_name ?? null, page_number_x: pdf?.page_number_x ?? null, page_number_y: pdf?.page_number_y ?? null },
        hide_in_exports: { control_doc: !!hide.control_doc, forms_doc: !!hide.forms_doc, multi_instr_doc: !!hide.multi_instr_doc, instr_doc: !!hide.instr_doc },
      });
      setInitialStatus(row.custom_status_id);
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [isEdit, formId]);

  const set = <K extends keyof FormInfoInput>(key: K, value: FormInfoInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const goTab = (id: string) => dialog.replace(isEdit ? `form-lib/edit/${formId}/${id}` : `form-lib/add/${id}`);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name?.trim()) e.name = tg("validators.required");
    if (!form.family_id) e.family_id = tg("validators.required");
    if (form.object_attributes_link === "other_family" && !form.object_family_id) e.object_family_id = tg("validators.required");
    if (form.pdf_template?.enabled && !form.pdf_template.file_id) e.pdf_template = tg("validators.required");
    setErrors(e);
    if (e.name || e.family_id) goTab("general-tab");
    else if (e.object_family_id || e.pdf_template) goTab("options-tab");
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    startTransition(async () => {
      const result = isEdit ? await updateFormInfo(formId!, form) : await createLibraryForm(form);
      if (!result.ok) { notify.error(isEdit ? errorText(result.error) : tf("toasts.createFail")); return; }
      notify.success(isEdit ? tg("toast.saved") : tf("toasts.created"));
      close();
      router.refresh();
    });
  };

  const uploadTemplate = async (file: File) => {
    if (!formId) return;
    if (file.type !== "application/pdf") { notify.error(t("templateOnlyPdf")); return; }
    setUploading(true);
    const path = `forms/${formId}/template-${crypto.randomUUID()}.pdf`;
    const { error } = await createClient().storage.from(FORM_FILES_BUCKET).upload(path, file, { contentType: "application/pdf" });
    setUploading(false);
    if (error) { notify.error(tg("toast.error")); return; }
    set("pdf_template", { ...form.pdf_template!, enabled: true, file_id: path, file_name: file.name });
  };

  const isLibrary = location === "library";
  const statusChanged = isEdit && form.custom_status_id !== initialStatus;
  const tabs = [
    { id: "general-tab", label: t("tabs.general") },
    ...(isEdit ? [{ id: "options-tab", label: t("tabs.options") }] : []),
  ];

  const select = (key: "family_id" | "custom_status_id" | "account_id" | "object_family_id", label: string, items: Opt[], required?: boolean, disabled?: boolean, help?: string) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel>{label}{required && " *"}</FieldLabel>
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

  const textInput = (key: "name" | "reference" | "index_label", label: string, required?: boolean, help?: string) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={`form-${key}`}>{label}{required && " *"}</FieldLabel>
      <Input id={`form-${key}`} value={(form[key] as string) ?? ""} aria-invalid={!!errors[key]} onChange={(e) => set(key, e.target.value)} />
      {help && <FieldDescription>{help}</FieldDescription>}
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );
  const textArea = (key: "description" | "additional_comment" | "additional_observation" | "status_change_comment", label: string, help?: string) => (
    <Field>
      <FieldLabel htmlFor={`form-${key}`}>{label}</FieldLabel>
      <Textarea id={`form-${key}`} rows={2} value={(form[key] as string) ?? ""} onChange={(e) => set(key, e.target.value)} />
      {help && <FieldDescription>{help}</FieldDescription>}
    </Field>
  );

  return (
    <ModalShell
      onClose={close}
      icon={<EntityIcon kind="library" icon={ClipboardListIcon} size="md" />}
      title={isEdit ? t("editTitle", { name: form.name }) : t("createTitle")}
      tabs={tabs}
      activeTab={tab}
      onTabChange={goTab}
      footer={<>
        <Button variant="outline" onClick={close}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !loaded || !options || (!isEdit && natures.length === 0)}>
          {pending && <Spinner data-icon="inline-start" />}{isEdit ? tg("actions.save") : tg("actions.create")}
        </Button>
      </>}
    >
      {!loaded || !options ? <div className="flex justify-center py-12"><Spinner /></div> : tab === "options-tab" ? (
        <FieldGroup>
          <Field orientation="horizontal">
            <Switch id="form-lock" checked={!!form.lock_responses} onCheckedChange={(v) => set("lock_responses", v)} />
            <FieldLabel htmlFor="form-lock">{t("fields.lockResponses")}</FieldLabel>
          </Field>
          <FieldSet>
            <FieldLegend variant="label">{t("fields.objectAttributes")}</FieldLegend>
            <Select value={form.object_attributes_link} onValueChange={(v) => set("object_attributes_link", v as FormInfoInput["object_attributes_link"])}
              disabled={form.nature !== "model"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(["disabled", "default_family", "other_family"] as const).map((v) => (
                    <SelectItem key={v} value={v}>{t(`fields.objectAttributesOptions.${v}`)}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {form.nature !== "model" && <FieldDescription>{t("fields.objectAttributesModelOnly")}</FieldDescription>}
            {form.object_attributes_link === "other_family" && select("object_family_id", t("fields.objectFamily"), options.objectFamilies, true)}
          </FieldSet>
          <FieldSet>
            <Field orientation="horizontal">
              <Switch id="form-pdf" checked={!!form.pdf_template?.enabled}
                onCheckedChange={(v) => set("pdf_template", { ...form.pdf_template!, enabled: v })} />
              <FieldLabel htmlFor="form-pdf">{t("fields.useTemplate")}</FieldLabel>
            </Field>
            {form.pdf_template?.enabled && (
              <div className="flex flex-col gap-3 pl-12">
                <Field data-invalid={!!errors.pdf_template}>
                  <FieldLabel>{t("fields.templateFile")}</FieldLabel>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" asChild disabled={uploading}>
                      <label className="cursor-pointer">
                        {uploading ? <Spinner data-icon="inline-start" /> : <FileUpIcon data-icon="inline-start" />}{t("uploadTemplate")}
                        <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadTemplate(f); }} />
                      </label>
                    </Button>
                    {form.pdf_template.file_name && <Badge variant="secondary">{form.pdf_template.file_name}</Badge>}
                  </div>
                  {errors.pdf_template && <FieldError>{errors.pdf_template}</FieldError>}
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  {(["page_number_x", "page_number_y"] as const).map((k) => (
                    <Field key={k}>
                      <FieldLabel htmlFor={`form-${k}`}>{t(k === "page_number_x" ? "fields.pageNumberX" : "fields.pageNumberY")}</FieldLabel>
                      <Input id={`form-${k}`} type="number" min={0} value={form.pdf_template?.[k] ?? ""}
                        onChange={(e) => set("pdf_template", { ...form.pdf_template!, [k]: e.target.value === "" ? null : Number(e.target.value) })} />
                    </Field>
                  ))}
                </div>
              </div>
            )}
          </FieldSet>
          <FieldSet>
            <FieldLegend variant="label">{t("fields.hideIn.title")}</FieldLegend>
            {(["control_doc", "forms_doc", "multi_instr_doc", "instr_doc"] as const).map((k) => (
              <Field key={k} orientation="horizontal">
                <Checkbox id={`form-hide-${k}`} checked={!!form.hide_in_exports?.[k]}
                  onCheckedChange={(v) => set("hide_in_exports", { ...EMPTY.hide_in_exports!, ...form.hide_in_exports, [k]: !!v } as FormInfoInput["hide_in_exports"])} />
                <FieldLabel htmlFor={`form-hide-${k}`} className="font-normal">{t(`fields.hideIn.${k}`)}</FieldLabel>
              </Field>
            ))}
          </FieldSet>
        </FieldGroup>
      ) : (
        <FieldGroup>
          {!isEdit && natures.length === 0 && (
            <Alert variant="destructive"><AlertDescription>{t("noCreatableType")}</AlertDescription></Alert>
          )}
          <Field>
            <FieldLabel>{t("fields.type")} *</FieldLabel>
            <Select value={form.nature} onValueChange={(v) => set("nature", v as FormInfoInput["nature"])} disabled={isEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(isEdit ? [form.nature] : natures).map((n) => <SelectItem key={n} value={n}>{tf(`natures.${n}` as never)}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {textInput("name", t("fields.name"), true)}
          {textArea("description", t("fields.description"))}
          <div className="grid grid-cols-2 gap-4">
            {textInput("reference", t("fields.reference"))}
            {textInput("index_label", t("fields.index"), false, tf("tooltips.index"))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {select("family_id", t("fields.family"), options.families, true)}
            {isLibrary && options.accounts.length > 1 && select("account_id", t("fields.account"), options.accounts, false, isEdit)}
          </div>
          <Field>
            <FieldLabel>{t("fields.companies")}</FieldLabel>
            <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border p-3">
              {options.companies.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
              {options.companies.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.company_ids?.includes(c.id)}
                    onCheckedChange={(v) => set("company_ids", v ? [...(form.company_ids ?? []), c.id] : (form.company_ids ?? []).filter((x) => x !== c.id))} />
                  {c.label}
                </label>
              ))}
            </div>
          </Field>
          {select("custom_status_id", t("fields.status"), options.statuses)}
          {statusChanged && textArea("status_change_comment", t("fields.statusComment"))}
          {textArea("additional_comment", t("fields.additionalComment"))}
          {textArea("additional_observation", t("fields.additionalObservation"), t("fields.additionalObservationHelp"))}
        </FieldGroup>
      )}
    </ModalShell>
  );
}
