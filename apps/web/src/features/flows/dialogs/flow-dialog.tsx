"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileTextIcon, NetworkIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { CustomFieldsEditor, type CustomFieldDef, type CustomFieldValues } from "@/components/custom-fields/custom-fields-editor";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { createFlow, updateFlow } from "../actions";
import { MultiSelect, type MultiOption } from "../components/multi-select";
import { SimpleSelect, type SelectOption } from "../components/simple-select";
import { StatusSelect, type StatusOption } from "../components/status-select";
import { creatableFlowTypes, type FlowType, type ProjectType } from "../meta";
import type { FlowInput } from "../schema";

type Options = {
  projectType: ProjectType;
  families: (SelectOption & { parent_id: string | null })[];
  categories: SelectOption[];
  statuses: (StatusOption & { link_type: string; label_family_id: string | null })[];
  members: SelectOption[];
  tablets: SelectOption[];
  tags: MultiOption[];
  hierarchies: MultiOption[];
  fields: (CustomFieldDef & { link_type: string; label_family_id: string | null })[];
  generatedRef: boolean;
  flowIds: string[];
};

const EMPTY: FlowInput = {
  flow_type: "specific", name: "", description: "", ref_int: "", ref_ext: "", family_id: null, category_id: null,
  custom_status_id: null, status_comment: "", tag_ids: [], location_activated: false, location_site: "", location_area: "",
  location_local: "", elementary_system: "", functional_marker: "", technical_object_label: "", reporter_id: null,
  assignee_ids: [], tablet_1_id: null, tablet_2_id: null, tablet_3_id: null, collaborators: [],
  start_date: "", finish_date: "", estimated_start_date: "", estimated_end_date: "", achieved_start_date: "", achieved_end_date: "",
  simplified_signature_mode: false,
  supervision_intern_1: false, supervision_intern_2: false, supervision_intern_3: false,
  supervision_extern_1: false, supervision_extern_2: false, supervision_extern_3: false,
  internal_supervisor_name_1: "", internal_supervisor_name_2: "", internal_supervisor_name_3: "",
  external_supervisor_name_1: "", external_supervisor_name_2: "", external_supervisor_name_3: "",
  custom_fields: {},
};

/** ISO → valeur d'un input datetime-local (heure locale). */
function toLocal(v: string | null) {
  if (!v) return "";
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DOCUMENT_TYPES = ["instructions", "equipments", "risks", "controls", "forms", "multiInstructions", "objects"] as const;
const TABS = ["general-tab", "attribute-tab", "document-tab", "assignment-tab", "planning-tab", "options-tab"] as const;

/** ?dialog=flow/add/<onglet> · ?dialog=flow/edit/<id>/<onglet> — modale à 6 onglets (spec 02 §2.10). */
export function FlowFormDialog({ segments, close }: DialogProps) {
  const t = useTranslations("flows");
  const tg = useTranslations("global");
  const router = useRouter();
  const dialog = useDialog();
  const { projectId } = useParams<{ projectId: string }>();
  const [action, idOrTab, maybeTab] = segments;
  const isEdit = action === "edit";
  const flowId = isEdit ? idOrTab : null;
  const tab = (isEdit ? maybeTab : idOrTab) ?? "general-tab";

  const [options, setOptions] = useState<Options | null>(null);
  const [form, setForm] = useState<FlowInput>(EMPTY);
  const [initialStatus, setInitialStatus] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const [project, families, categories, statuses, members, tablets, tags, hierarchies, fields, rules, flowIds] = await Promise.all([
        supabase.from("projects").select("type").eq("id", projectId).single(),
        supabase.from("label_families").select("id, short_name, long_name, color, parent_id")
          .eq("kind", "family").eq("nature", "flow").eq("relative_nature", "child").eq("active", true).is("deleted_at", null).order("priority").order("short_name"),
        supabase.from("label_families").select("id, short_name, long_name, color")
          .eq("kind", "category").eq("nature", "flow").eq("project_id", projectId).eq("active", true).is("deleted_at", null).order("short_name"),
        supabase.from("custom_statuses").select("id, name, color, category, is_default, link_type, label_family_id").eq("nature", "flow").eq("active", true).order("sort_order"),
        supabase.from("project_members").select("collaborator:collaborators(id, first_name, last_name)").eq("project_id", projectId).order("sort_order"),
        supabase.from("project_tablets").select("tablet:tablets(id, name)").eq("project_id", projectId),
        supabase.from("tags").select("id, name, color").order("name"),
        supabase.from("label_families").select("id, short_name, long_name, project_id")
          .eq("kind", "category").eq("nature", "hierarchy").eq("active", true).is("deleted_at", null)
          .or(`project_id.is.null,project_id.eq.${projectId}`).order("short_name"),
        supabase.from("custom_fields").select("id, name, type, choices, placeholder, tooltip, description, required, read_only, default_value, link_type, label_family_id")
          .eq("nature", "flow").eq("active", true).is("deleted_at", null).order("sort_order"),
        supabase.from("reference_rules").select("id").eq("nature", "flow").eq("field", "ref_int").eq("active", true).limit(1),
        supabase.from("flows").select("id").eq("project_id", projectId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(500),
      ]);
      if (!active) return;
      const famLabel = (f: { short_name: string; long_name: string | null }) => (f.long_name ? `${f.short_name} - ${f.long_name}` : f.short_name);
      const projectType = (project.data?.type ?? "project") as ProjectType;
      setOptions({
        projectType,
        families: (families.data ?? []).map((f) => ({ value: f.id, label: famLabel(f), color: f.color, parent_id: f.parent_id })),
        categories: (categories.data ?? []).map((f) => ({ value: f.id, label: famLabel(f), color: f.color })),
        statuses: statuses.data ?? [],
        members: (members.data ?? []).flatMap((m) => (m.collaborator ? [{ value: m.collaborator.id, label: `${m.collaborator.first_name} ${m.collaborator.last_name}` }] : [])),
        tablets: (tablets.data ?? []).flatMap((x) => (x.tablet ? [{ value: x.tablet.id, label: x.tablet.name }] : [])),
        tags: (tags.data ?? []).map((x) => ({ value: x.id, label: x.name, color: x.color })),
        hierarchies: (hierarchies.data ?? []).map((h) => ({ value: h.id, label: famLabel(h) })),
        fields: fields.data ?? [],
        generatedRef: (rules.data ?? []).length > 0,
        flowIds: (flowIds.data ?? []).map((f) => f.id),
      });
      if (!isEdit) {
        const def = statuses.data?.find((s) => s.is_default);
        setForm((f) => ({ ...f, flow_type: creatableFlowTypes(projectType)[0], custom_status_id: def?.id ?? null }));
        return;
      }
      const [{ data: flow }, { data: assignees }, { data: collabs }, { data: hier }, { data: flowTags }, { data: values }] = await Promise.all([
        supabase.from("flows").select("*").eq("id", flowId!).single(),
        supabase.from("flow_assignees").select("collaborator_id").eq("flow_id", flowId!),
        supabase.from("flow_collaborators").select("collaborator_id").eq("flow_id", flowId!),
        supabase.from("flow_collaborator_hierarchies").select("collaborator_id, hierarchy_id").eq("flow_id", flowId!),
        supabase.from("flow_tags").select("tag_id").eq("flow_id", flowId!),
        supabase.from("custom_field_values").select("custom_field_id, value_text, value_json").eq("object_id", flowId!),
      ]);
      if (!active || !flow) return;
      const cf: CustomFieldValues = {};
      for (const v of values ?? []) cf[v.custom_field_id] = Array.isArray(v.value_json) ? (v.value_json as string[]) : v.value_text;
      setForm(toInput(flow, {
        assignee_ids: (assignees ?? []).map((a) => a.collaborator_id),
        collaborators: (collabs ?? []).map((c) => ({
          collaborator_id: c.collaborator_id,
          hierarchy_ids: (hier ?? []).filter((h) => h.collaborator_id === c.collaborator_id).map((h) => h.hierarchy_id),
        })),
        tag_ids: (flowTags ?? []).map((x) => x.tag_id),
        custom_fields: cf,
      }));
      setInitialStatus(flow.custom_status_id);
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [isEdit, flowId, projectId]);

  const family = options?.families.find((f) => f.value === form.family_id);
  const familyIds = useMemo(() => new Set([form.family_id, family?.parent_id].filter(Boolean) as string[]), [form.family_id, family]);
  const fields = useMemo(() => (options?.fields ?? []).filter((f) => f.link_type === "default" || (f.label_family_id && familyIds.has(f.label_family_id))), [options, familyIds]);
  // R-STAT-2 : statuts compatibles avec la famille du flow.
  const statuses = useMemo(() => (options?.statuses ?? []).filter((s) => s.link_type === "default" || (s.label_family_id && familyIds.has(s.label_family_id))), [options, familyIds]);

  const set = <K extends keyof FlowInput>(key: K, value: FlowInput[K]) => { setDirty(true); setForm((f) => ({ ...f, [key]: value })); };
  const goTab = (id: string) => dialog.replace(isEdit ? `flow/edit/${flowId}/${id}` : `flow/add/${id}`);
  const requestClose = () => (dirty ? setConfirmClose(true) : close());

  const validate = () => {
    const e: Record<string, string> = {};
    const name = form.name ?? "";
    if (name.length < 3) e.name = tg("validators.minLength", { min: 3 });
    else if (name.length > 255) e.name = tg("validators.maxLength", { max: 255 });
    else if (name !== name.trim()) e.name = t("validators.trim");
    for (const [a, b] of [["start_date", "finish_date"], ["estimated_start_date", "estimated_end_date"], ["achieved_start_date", "achieved_end_date"]] as const) {
      if (form[a] && form[b] && new Date(form[a] as string) > new Date(form[b] as string)) e[b] = t("validators.dateOrder");
    }
    if ((form.collaborators ?? []).some((c) => c.hierarchy_ids.length === 0)) e.collaborators = t("dialog.hierarchyRequired");
    for (const f of fields) {
      const v = form.custom_fields?.[f.id];
      if (f.required && (v == null || v === "" || (Array.isArray(v) && v.length === 0))) e[`cf_${f.id}`] = tg("validators.required");
    }
    setErrors(e);
    if (e.name) goTab("general-tab");
    else if (e.collaborators) goTab("assignment-tab");
    else if (e.finish_date || e.estimated_end_date || e.achieved_end_date) goTab("planning-tab");
    else if (Object.keys(e).some((k) => k.startsWith("cf_"))) goTab("attribute-tab");
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    startTransition(async () => {
      const iso = (v: string | null | undefined) => (v ? new Date(v).toISOString() : null);
      const payload: FlowInput = {
        ...form,
        start_date: iso(form.start_date), finish_date: iso(form.finish_date),
        estimated_start_date: iso(form.estimated_start_date), estimated_end_date: iso(form.estimated_end_date),
        achieved_start_date: iso(form.achieved_start_date), achieved_end_date: iso(form.achieved_end_date),
      };
      const result = isEdit ? await updateFlow(flowId!, payload) : await createFlow(projectId, payload);
      if (!result.ok) {
        const known = ["has_signatures", "dsi_not_redaction", "invalid_type"];
        notify.error(result.error === "forbidden" ? tg("toast.forbidden") : known.includes(result.error) ? t(`dialog.errors.${result.error}` as never) : t("dialog.errors.save"));
        if (result.error === "has_signatures" || result.error === "dsi_not_redaction") goTab("options-tab");
        return;
      }
      if (!isEdit && result.data && typeof result.data === "object" && "ref" in result.data && result.data.ref && !form.ref_int) {
        notify.success(t("dialog.created"), t("dialog.createdWithRef", { param: result.data.ref }));
      } else {
        notify.success(isEdit ? tg("toast.saved") : t("dialog.created"));
      }
      setDirty(false);
      router.refresh();
      close();
    });
  };

  const types = options ? creatableFlowTypes(options.projectType) : [];
  const ids = options?.flowIds ?? [];
  const idx = flowId ? ids.indexOf(flowId) : -1;
  const navTo = (id: string) => dialog.replace(`flow/edit/${id}/${tab}`);

  const text = (key: keyof FlowInput, label: string, extra?: { placeholder?: string; disabled?: boolean }) => (
    <Field data-invalid={!!errors[key as string]}>
      <FieldLabel htmlFor={`f-${key}`}>{label}</FieldLabel>
      <Input id={`f-${key}`} value={(form[key] as string) ?? ""} placeholder={extra?.placeholder} disabled={extra?.disabled}
        aria-invalid={!!errors[key as string]} onChange={(e) => set(key, e.target.value as never)} />
      {errors[key as string] && <FieldError>{errors[key as string]}</FieldError>}
    </Field>
  );
  const date = (key: keyof FlowInput, label: string) => (
    <Field data-invalid={!!errors[key as string]}>
      <FieldLabel htmlFor={`f-${key}`}>{label}</FieldLabel>
      <Input id={`f-${key}`} type="datetime-local" value={(form[key] as string) ?? ""} aria-invalid={!!errors[key as string]}
        onChange={(e) => set(key, e.target.value as never)} />
      {errors[key as string] && <FieldError>{errors[key as string]}</FieldError>}
    </Field>
  );
  const single = (key: "family_id" | "category_id" | "reporter_id" | "tablet_1_id" | "tablet_2_id" | "tablet_3_id", label: string, items: SelectOption[], help?: string) => (
    <Field>
      <FieldLabel htmlFor={`f-${key}`}>{label}</FieldLabel>
      <SimpleSelect id={`f-${key}`} value={form[key] as string | null} onChange={(v) => set(key, v)} options={items} />
      {help && <FieldDescription>{help}</FieldDescription>}
    </Field>
  );

  const tabs = TABS.map((id) => ({ id, label: t(`dialog.tabs.${id.replace("-tab", "")}` as never) }));

  const body = () => {
    if (!options || !loaded) return <div className="flex justify-center py-16"><Spinner /></div>;
    if (tab === "attribute-tab") {
      return (
        <FieldGroup>
          <CustomFieldsEditor fields={fields} values={(form.custom_fields ?? {}) as CustomFieldValues}
            onChange={(v) => set("custom_fields", v)} emptyLabel={t("dialog.noAttributes")} />
          {Object.keys(errors).some((k) => k.startsWith("cf_")) && <FieldError>{t("dialog.requiredAttributes")}</FieldError>}
        </FieldGroup>
      );
    }
    if (tab === "document-tab") {
      return (
        <FieldGroup>
          <Alert><AlertDescription>{t("dialog.documentsInfo")}</AlertDescription></Alert>
          <ul className="flex flex-col divide-y rounded-md border">
            {DOCUMENT_TYPES.map((d) => (
              <li key={d} className="flex items-center gap-3 px-4 py-3">
                <FileTextIcon className="size-4 text-muted-foreground" />
                <span className="flex-1">{t(`documents.${d}`)}</span>
                <span className="text-xs text-muted-foreground">{t("dialog.documentNotGenerated")}</span>
              </li>
            ))}
          </ul>
        </FieldGroup>
      );
    }
    if (tab === "assignment-tab") {
      const collabs = form.collaborators ?? [];
      return (
        <FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            {single("reporter_id", t("dialog.reporter"), options.members)}
            <Field>
              <FieldLabel htmlFor="f-assignees">{t("dialog.assignees")}</FieldLabel>
              <MultiSelect id="f-assignees" options={options.members} value={form.assignee_ids ?? []} onChange={(v) => set("assignee_ids", v)} />
              <FieldDescription>{t("dialog.assigneesHelp")}</FieldDescription>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {single("tablet_1_id", t("dialog.tablet", { n: 1 }), options.tablets)}
            {single("tablet_2_id", t("dialog.tablet", { n: 2 }), options.tablets)}
            {single("tablet_3_id", t("dialog.tablet", { n: 3 }), options.tablets)}
          </div>
          <FieldSet>
            <FieldLegend>{t("dialog.collaborators")}</FieldLegend>
            <FieldDescription>{t("dialog.collaboratorsHelp")}</FieldDescription>
            <MultiSelect options={options.members} value={collabs.map((c) => c.collaborator_id)}
              onChange={(v) => set("collaborators", v.map((id) => collabs.find((c) => c.collaborator_id === id) ?? { collaborator_id: id, hierarchy_ids: [] }))} />
            {collabs.length > 0 && (
              <div className="flex flex-col gap-2 rounded-md border p-3">
                {collabs.map((c) => (
                  <div key={c.collaborator_id} className="grid grid-cols-[12rem_1fr] items-center gap-3">
                    <span className="truncate text-sm">{options.members.find((m) => m.value === c.collaborator_id)?.label}</span>
                    <MultiSelect options={options.hierarchies} value={c.hierarchy_ids} placeholder={t("dialog.hierarchies")}
                      onChange={(v) => set("collaborators", collabs.map((x) => (x.collaborator_id === c.collaborator_id ? { ...x, hierarchy_ids: v } : x)))} />
                  </div>
                ))}
              </div>
            )}
            {errors.collaborators && <FieldError>{errors.collaborators}</FieldError>}
          </FieldSet>
        </FieldGroup>
      );
    }
    if (tab === "planning-tab") {
      const legend = [["planned", "bg-info"], ["estimated", "bg-warning"], ["achieved", "bg-success"]] as const;
      return (
        <FieldGroup>
          <div className="flex gap-6 text-sm">
            {legend.map(([k, c]) => <span key={k} className="flex items-center gap-2"><span className={cn("size-3 rounded-full", c)} />{t(`dialog.legend.${k}`)}</span>)}
          </div>
          {([["start_date", "finish_date", "planned"], ["estimated_start_date", "estimated_end_date", "estimated"], ["achieved_start_date", "achieved_end_date", "achieved"]] as const).map(([a, b, k]) => (
            <div key={k} className="grid grid-cols-2 gap-4">
              {date(a, t(`dialog.dates.${k}Start`))}
              {date(b, t(`dialog.dates.${k}End`))}
            </div>
          ))}
        </FieldGroup>
      );
    }
    if (tab === "options-tab") {
      return (
        <FieldGroup>
          <Field orientation="horizontal">
            <Switch id="f-simplified" checked={!!form.simplified_signature_mode} onCheckedChange={(v) => set("simplified_signature_mode", v)} />
            <FieldLabel htmlFor="f-simplified">{t("dialog.simplifiedMode")}</FieldLabel>
          </Field>
          <FieldDescription>{t("dialog.simplifiedModeHelp")}</FieldDescription>
          {(["intern", "extern"] as const).map((kind) => (
            <FieldSet key={kind}>
              <FieldLegend>{t(`dialog.supervisors.${kind}`)}</FieldLegend>
              <div className="grid grid-cols-3 gap-4">
                {([1, 2, 3] as const).map((n) => {
                  const flag = `supervision_${kind}_${n}` as keyof FlowInput;
                  const nameKey = `${kind === "intern" ? "internal" : "external"}_supervisor_name_${n}` as keyof FlowInput;
                  return (
                    <div key={n} className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={!!form[flag]} onCheckedChange={(v) => set(flag, !!v as never)} />
                        {t(`dialog.supervisors.${kind}N`, { n })}
                      </label>
                      <Input aria-label={t(`dialog.supervisors.${kind}N`, { n })} placeholder={t("dialog.supervisors.name")} disabled={!form[flag]}
                        value={(form[nameKey] as string) ?? ""} onChange={(e) => set(nameKey, e.target.value as never)} />
                    </div>
                  );
                })}
              </div>
            </FieldSet>
          ))}
        </FieldGroup>
      );
    }
    return (
      <FieldGroup>
        <Field>
          <FieldLabel>{t("dialog.type")} *</FieldLabel>
          {isEdit ? (
            <div className="text-sm">{t(`types.${form.flow_type as FlowType}`)}</div>
          ) : (
            <RadioGroup value={form.flow_type} onValueChange={(v) => set("flow_type", v)} className="flex flex-wrap gap-4">
              {types.map((type) => (
                <Tooltip key={type}>
                  <TooltipTrigger asChild>
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value={type} />{t(`types.${type}`)}</label>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-72">{t(`typeHelp.${type}`)}</TooltipContent>
                </Tooltip>
              ))}
            </RadioGroup>
          )}
        </Field>
        {text("name", `${t("dialog.name")} *`, { placeholder: t("dialog.namePlaceholder") })}
        <Field>
          <FieldLabel htmlFor="f-description">{t("dialog.description")}</FieldLabel>
          <Textarea id="f-description" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          <FieldDescription>{t("dialog.descriptionHelp")}</FieldDescription>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          {text("ref_int", t("dialog.reference"), { placeholder: options.generatedRef && !isEdit ? t("dialog.generated") : undefined })}
          {text("ref_ext", t("dialog.refExt"))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {single("family_id", t("dialog.family"), options.families)}
          {single("category_id", t("dialog.category"), options.categories, t("dialog.categoryHelp"))}
        </div>
        <Field>
          <FieldLabel htmlFor="f-status">{t("dialog.status")}</FieldLabel>
          <div className="flex gap-2">
            <div className="flex-1"><StatusSelect id="f-status" statuses={statuses} value={form.custom_status_id ?? null} onChange={(v) => set("custom_status_id", v)} /></div>
            {isEdit && <Button variant="secondary" onClick={() => dialog.replace(`flow/history/${flowId}`)}>{t("dialog.statusHistory")}</Button>}
          </div>
          <FieldDescription>{t("dialog.statusDefaultInfo")}</FieldDescription>
        </Field>
        {isEdit && form.custom_status_id !== initialStatus && (
          <Field>
            <FieldLabel htmlFor="f-status-comment">{t("dialog.statusComment")}</FieldLabel>
            <Textarea id="f-status-comment" value={form.status_comment ?? ""} onChange={(e) => set("status_comment", e.target.value)} />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="f-tags">{t("dialog.tags")}</FieldLabel>
          <MultiSelect id="f-tags" options={options.tags} value={form.tag_ids ?? []} onChange={(v) => set("tag_ids", v)} />
        </Field>
        <FieldSet>
          <Field orientation="horizontal">
            <Switch id="f-location" checked={!!form.location_activated} onCheckedChange={(v) => set("location_activated", v)} />
            <FieldLabel htmlFor="f-location">{t("dialog.location")}</FieldLabel>
          </Field>
          {form.location_activated ? (
            <div className="grid grid-cols-3 gap-4">
              {text("location_site", t("dialog.site"))}
              {text("location_area", t("dialog.area"))}
              {text("location_local", t("dialog.local"))}
              {text("elementary_system", t("dialog.elementarySystem"))}
              {text("functional_marker", t("dialog.functionalMarker"))}
              {text("technical_object_label", t("dialog.object"))}
            </div>
          ) : <FieldDescription>{t("dialog.locationHelp")}</FieldDescription>}
        </FieldSet>
      </FieldGroup>
    );
  };

  return (
    <>
      <ModalShell
        onClose={requestClose}
        icon={<EntityIcon kind="project" icon={NetworkIcon} size="md" />}
        title={isEdit ? t("dialog.editTitle", { type: t(`types.${form.flow_type as FlowType}`), name: form.name ?? "" }) : t("dialog.createTitle")}
        tabs={tabs}
        activeTab={tab}
        onTabChange={goTab}
        onPrevious={isEdit && idx > 0 ? () => navTo(ids[idx - 1]) : undefined}
        onNext={isEdit && idx >= 0 && idx < ids.length - 1 ? () => navTo(ids[idx + 1]) : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={requestClose}>{tg("actions.cancel")}</Button>
            <Button onClick={submit} disabled={pending || !loaded || !options}>
              {pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}
            </Button>
          </>
        }>
        {body()}
      </ModalShell>
      {confirmClose && (
        <UnsavedConfirm onCancel={() => setConfirmClose(false)} onConfirm={() => { setConfirmClose(false); close(); }} />
      )}
    </>
  );
}

function UnsavedConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const tg = useTranslations("global");
  return (
    <ModalShell onClose={onCancel} size="sm" title={tg("confirm.unsavedTitle")}
      footer={<><Button variant="secondary" onClick={onCancel}>{tg("actions.cancel")}</Button><Button variant="destructive" onClick={onConfirm}>{tg("actions.close")}</Button></>}>
      <p className="py-4">{tg("confirm.unsavedText")}</p>
    </ModalShell>
  );
}

function toInput(f: Tables<"flows">, extra: Pick<FlowInput, "assignee_ids" | "collaborators" | "tag_ids" | "custom_fields">): FlowInput {
  const s = (v: string | null) => v ?? "";
  return {
    flow_type: f.flow_type, name: f.name, description: s(f.description), ref_int: s(f.ref_int), ref_ext: s(f.ref_ext),
    family_id: f.family_id, category_id: f.category_id, custom_status_id: f.custom_status_id, status_comment: "",
    location_activated: f.location_activated, location_site: s(f.location_site), location_area: s(f.location_area),
    location_local: s(f.location_local), elementary_system: s(f.elementary_system), functional_marker: s(f.functional_marker),
    technical_object_label: s(f.technical_object_label), reporter_id: f.reporter_id,
    tablet_1_id: f.tablet_1_id, tablet_2_id: f.tablet_2_id, tablet_3_id: f.tablet_3_id,
    start_date: toLocal(f.start_date), finish_date: toLocal(f.finish_date),
    estimated_start_date: toLocal(f.estimated_start_date), estimated_end_date: toLocal(f.estimated_end_date),
    achieved_start_date: toLocal(f.achieved_start_date), achieved_end_date: toLocal(f.achieved_end_date),
    simplified_signature_mode: f.simplified_signature_mode,
    supervision_intern_1: f.supervision_intern_1, supervision_intern_2: f.supervision_intern_2, supervision_intern_3: f.supervision_intern_3,
    supervision_extern_1: f.supervision_extern_1, supervision_extern_2: f.supervision_extern_2, supervision_extern_3: f.supervision_extern_3,
    internal_supervisor_name_1: s(f.internal_supervisor_name_1), internal_supervisor_name_2: s(f.internal_supervisor_name_2),
    internal_supervisor_name_3: s(f.internal_supervisor_name_3), external_supervisor_name_1: s(f.external_supervisor_name_1),
    external_supervisor_name_2: s(f.external_supervisor_name_2), external_supervisor_name_3: s(f.external_supervisor_name_3),
    ...extra,
  };
}
