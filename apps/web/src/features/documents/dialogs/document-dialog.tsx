"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArchiveIcon, FileTextIcon, Trash2Icon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { CustomFieldsEditor, type CustomFieldDef, type CustomFieldValues } from "@/components/custom-fields/custom-fields-editor";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDirtyGuard } from "@/features/settings/components/dirty-guard";
import { useSiblings } from "@/features/settings/components/use-siblings";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { addDocumentFiles, createDocument, getSignedUrl, removeDocumentFile, updateDocument } from "../actions";
import { useDocError } from "../components/use-doc-error";
import { useDocumentPermissions } from "../components/use-permissions";
import { useWordingFields } from "../components/wording-badge";
import {
  baseNature, CREATION_SOURCES, documentTabs, formatSize, indexFormatOf, isExtern, NATURES_BY_SOURCE, storagePath,
  type DocumentNature, type DocumentSource, type DocumentTab,
} from "../meta";
import type { DocumentInput } from "../schema";
import { uploadDocumentFile, isPasswordProtectedPdf } from "../upload/uploads-store";
import { ContentTab, validateContent, type ContentSources } from "./content-tab";
import { validatePdf } from "./file-checks";
import { FollowTab, type WordingFlags } from "./follow-tab";

export type DialogMode = "project" | "library" | "folder";
const PREFIX: Record<DialogMode, string> = { project: "dashboard-documents", library: "library-documents", folder: "closing-folder" };
const ROUTE: Record<DialogMode, "DashboardDocuments" | "LibraryDocuments" | "DashboardClosingFolder"> = {
  project: "DashboardDocuments", library: "LibraryDocuments", folder: "DashboardClosingFolder",
};

type Family = Pick<Tables<"label_families">, "id" | "short_name" | "long_name" | "color" | "wording_configuration_id" | "client_supervision" | "client_supervision_sub_index">;
type Option = { id: string; label: string; color?: string };
type Loaded = {
  families: Family[]; categories: Option[]; accounts: Option[]; templates: Option[];
  fields: (CustomFieldDef & { link_type: string; label_family_id: string | null })[];
  hasRefRule: boolean; referentialEntity: boolean; diagramEnabled: boolean; sources: ContentSources;
};
type Doc = Tables<"documents">;
type FileRow = { id: string; name: string; size: number; storage_path: string };

const EMPTY: DocumentInput = {
  source: "extern", nature: "pdf_versioned", family_id: "", account_id: null, name: "", ref_int: "", ref_ext: "", start_index: "",
  category_id: null, closing_category_id: null, folder_template_id: null, linked_flow_id: null, linked_form_id: null,
  linked_response_id: null, linked_diagram_id: null, linked_list_id: null, responses_strategy: null, form_content_location: "none",
  preamble: "", subject: "", glossary: "", options: {}, selections: {}, language_1: undefined, language_2: undefined,
  client_cover_page: false, highlight_changes: false, custom_fields: {},
};

/** Modale document (§5.2) — ?dialog=<préfixe>/add/<onglet> · <préfixe>/edit/<id>/<onglet>. */
export function DocumentDialog({ segments, close, mode }: DialogProps & { mode: DialogMode }) {
  const t = useTranslations("documents");
  const tc = useTranslations("documents.content");
  const tf = useTranslations("closingFolder");
  const tg = useTranslations("global");
  const router = useRouter();
  const dialog = useDialog();
  const docError = useDocError();
  const params = useParams<{ projectId?: string }>();
  const projectId = mode === "library" ? null : params.projectId ?? null;
  const prefix = PREFIX[mode];
  const [action, idOrTab, maybeTab] = segments;
  const isEdit = action === "edit";
  const docId = isEdit ? idOrTab : null;
  const tab = ((isEdit ? maybeTab : idOrTab) ?? "general-tab") as DocumentTab;
  const perms = useDocumentPermissions(ROUTE[mode], projectId);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [last, setLast] = useState<{ state: string; count: number } | null>(null);
  const [form, setForm] = useState<DocumentInput>(() => mode === "folder" ? { ...EMPTY, source: "closing_folder", nature: "rfi" } : mode === "project" ? { ...EMPTY, source: "flow", nature: "pr" } : EMPTY);
  const [initial, setInitial] = useState<string>("");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileToRemove, setFileToRemove] = useState<FileRow | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [reload, setReload] = useState(0);
  const dirty = initial !== "" && JSON.stringify(form) !== initial;
  const { requestClose, dialog: guard } = useDirtyGuard(dirty || pendingFiles.length > 0, close);

  const nature = form.nature as DocumentNature;
  const family = loaded?.families.find((f) => f.id === form.family_id) ?? null;
  const wording = useWordingFields(family?.wording_configuration_id);
  const [flags, setFlags] = useState<WordingFlags>({ hide_bpa: false, hide_bpe_valid: false, hide_vso_sr: false });
  useEffect(() => {
    if (!family?.wording_configuration_id) return;
    createClient().from("wording_configurations").select("hide_bpa, hide_bpe_valid, hide_vso_sr").eq("id", family.wording_configuration_id).maybeSingle()
      .then(({ data }) => { if (data) setFlags(data); });
  }, [family?.wording_configuration_id]);

  // ----- Chargement des listes de choix et du document -----
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const cat = supabase.from("label_families").select("id, short_name, long_name, color").eq("kind", "category").eq("nature", "document").is("deleted_at", null).order("priority");
      const [families, categories, accounts, fields, rules, templates, project, org] = await Promise.all([
        supabase.from("label_families").select("id, short_name, long_name, color, wording_configuration_id, client_supervision, client_supervision_sub_index")
          .eq("kind", "family").eq("nature", "document").eq("relative_nature", "child").eq("active", true).is("deleted_at", null).order("priority").order("short_name"),
        projectId ? cat.eq("project_id", projectId) : cat.is("project_id", null),
        supabase.from("accounts").select("id, name").order("name"),
        supabase.from("custom_fields").select("id, name, type, choices, placeholder, tooltip, description, required, read_only, default_value, link_type, label_family_id")
          .eq("nature", "document").eq("active", true).is("deleted_at", null).order("sort_order"),
        supabase.from("reference_rules").select("id").eq("nature", "document").eq("field", "ref_int").eq("active", true).limit(1),
        mode === "folder" ? supabase.from("closing_folder_templates").select("id, name").order("name") : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        projectId ? supabase.from("projects").select("type").eq("id", projectId).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("organizations").select("diagram_enabled").maybeSingle(),
      ]);
      let sources: ContentSources = { flows: [], forms: [], diagrams: [], lists: [], skills: [], attributes: [], documents: [] };
      if (projectId) {
        const [flows, forms, diagrams, lists, skills, attributes, documents] = await Promise.all([
          supabase.from("flows").select("id, name, flow_type").eq("project_id", projectId).is("deleted_at", null).order("name"),
          supabase.from("forms").select("id, name").eq("project_id", projectId).is("deleted_at", null).order("name"),
          supabase.from("diagrams").select("id, name").eq("project_id", projectId).order("name"),
          supabase.from("project_lists").select("id, name, type").eq("project_id", projectId).is("deleted_at", null).order("name"),
          supabase.from("label_families").select("id, short_name, long_name").eq("nature", "skill").eq("relative_nature", "child").is("deleted_at", null).order("short_name"),
          supabase.from("custom_fields").select("id, name").eq("nature", "technical_object").eq("link_type", "default").eq("active", true).is("deleted_at", null),
          supabase.from("documents").select("id, name, nature, ref_int").eq("project_id", projectId).is("deleted_at", null).order("name"),
        ]);
        sources = {
          flows: flows.data ?? [], forms: forms.data ?? [], diagrams: diagrams.data ?? [], lists: lists.data ?? [],
          skills: (skills.data ?? []).map((s) => ({ id: s.id, label: s.long_name ? `${s.short_name} - ${s.long_name}` : s.short_name })),
          attributes: attributes.data ?? [], documents: (documents.data ?? []).filter((d) => d.id !== docId),
        };
      }
      const label = (x: { short_name: string; long_name: string | null }) => (x.long_name ? `${x.short_name} - ${x.long_name}` : x.short_name);
      if (!active) return;
      const data: Loaded = {
        families: families.data ?? [],
        categories: (categories.data ?? []).map((c) => ({ id: c.id, label: label(c), color: c.color })),
        accounts: (accounts.data ?? []).map((a) => ({ id: a.id, label: a.name })),
        templates: (templates.data ?? []).map((x) => ({ id: x.id, label: x.name })),
        fields: fields.data ?? [], hasRefRule: (rules.data ?? []).length > 0,
        referentialEntity: (project.data as { type?: string } | null)?.type === "referential",
        diagramEnabled: org.data?.diagram_enabled ?? true, sources,
      };
      setLoaded(data);
      if (!docId) { setInitial(JSON.stringify(form)); return; }
      const [{ data: d }, { data: selections }, { data: values }, { data: versions }, { data: fileRows }] = await Promise.all([
        supabase.from("documents").select("*").eq("id", docId).single(),
        supabase.from("document_selections").select("kind, ref_id, position").eq("document_id", docId).order("position"),
        supabase.from("custom_field_values").select("custom_field_id, value_text, value_json").eq("object_id", docId),
        supabase.from("document_versions").select("state, is_last").eq("document_id", docId),
        supabase.from("document_files").select("id, name, size, storage_path").eq("document_id", docId).is("version_id", null).order("position"),
      ]);
      if (!active || !d) return;
      const sel: Record<string, string[]> = {};
      for (const s of selections ?? []) (sel[s.kind] ??= []).push(s.ref_id);
      const cf: CustomFieldValues = {};
      for (const v of values ?? []) cf[v.custom_field_id] = Array.isArray(v.value_json) ? (v.value_json as string[]) : v.value_text;
      const next: DocumentInput = {
        source: d.source, nature: d.nature, family_id: d.family_id, account_id: d.account_id, name: d.name, ref_int: d.ref_int ?? "",
        ref_ext: d.ref_ext ?? "", start_index: d.start_index ?? (versions?.find((v) => v.is_last) ? "" : ""), category_id: d.category_id,
        closing_category_id: d.closing_category_id, folder_template_id: d.folder_template_id, linked_flow_id: d.linked_flow_id,
        linked_form_id: d.linked_form_id, linked_response_id: d.linked_response_id, linked_diagram_id: d.linked_diagram_id,
        linked_list_id: d.linked_list_id, responses_strategy: d.responses_strategy, form_content_location: d.form_content_location,
        preamble: d.preamble ?? "", subject: d.subject ?? "", glossary: d.glossary ?? "", options: (d.options ?? {}) as Record<string, boolean>,
        selections: sel, language_1: d.language_1, language_2: d.language_2, client_cover_page: d.client_cover_page,
        highlight_changes: d.highlight_changes, custom_fields: cf,
      };
      setDoc(d);
      setLast({ state: versions?.find((v) => v.is_last)?.state ?? "prel", count: versions?.length ?? 0 });
      setFiles(fileRows ?? []);
      setForm(next);
      setInitial(JSON.stringify(next));
    })();
    return () => { active = false; };
  }, [docId, projectId, mode, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const siblings = useSiblings(async () => {
    if (!isEdit) return [];
    let q = createClient().from("documents").select("id").is("deleted_at", null).order("position").order("name");
    q = mode === "library" ? q.eq("scope", "library") : q.eq("project_id", projectId ?? "");
    q = mode === "folder" ? q.eq("nature", "rfi") : q.neq("nature", "rfi");
    const { data } = await q;
    return (data ?? []).map((r) => r.id);
  }, docId, [mode, projectId, isEdit]);

  const set = (patch: Partial<DocumentInput>) => setForm((f) => ({ ...f, ...patch }));
  const goTab = (id: string) => dialog.replace(isEdit ? `${prefix}/edit/${docId}/${id}` : `${prefix}/add/${id}`);
  const tabs = documentTabs(nature);
  const readOnly = !!doc?.content_disabled || (isEdit ? !perms.edit : !perms.add);
  const isPrel = !isEdit || last?.state === "prel";
  const startIndexEditable = !isEdit || (last?.count === 1 && last.state === "prel");
  const ext = isExtern(nature);

  const fieldsForFamily = useMemo(() => (loaded?.fields ?? []).filter((f) => f.link_type === "default" || f.label_family_id === form.family_id), [loaded, form.family_id]);

  const validate = () => {
    const e: Record<string, string> = {};
    if ((form.name ?? "").trim().length < 3) e.name = tg("validators.minLength", { min: 3 });
    if (!form.family_id) e.family_id = mode === "folder" ? tf("dialog.familyRequired") : tg("validators.required");
    if (mode === "library" && !form.account_id) e.account_id = tg("validators.required");
    for (const k of ["ref_int", "ref_ext"] as const) if (form[k] && String(form[k]).trim().length < 3) e[k] = tg("validators.minLength", { min: 3 });
    if (mode === "folder" && !form.ref_int && !form.ref_ext && !loaded?.hasRefRule) e.ref_int = tf("dialog.refRequired");
    if (form.start_index && nature !== "pdf_unversioned" && !indexFormatOf(form.start_index)) e.start_index = t("follow.errors.invalid_index");
    const content = !ext && mode !== "folder" ? validateContent(nature, form, (k) => tc(k as never)) : {};
    setErrors({ ...e, ...content });
    if (Object.keys(e).length) { goTab("general-tab"); return false; }
    if (Object.keys(content).length) { goTab("content-tab"); return false; }
    return true;
  };

  const uploadPending = async (target: { id: string; project_id: string | null }) => {
    if (!pendingFiles.length) return true;
    const uploaded: { path: string; name: string; size: number }[] = [];
    try {
      for (const f of pendingFiles) {
        const path = await uploadDocumentFile(f, storagePath(target, null, f.name), { context: form.name ?? null, documentId: target.id });
        uploaded.push({ path, name: f.name, size: f.size });
      }
    } catch (e) {
      notify.error((e as Error).message === "too_large" ? t("follow.errors.too_large_local") : t("follow.errors.upload_failed"));
      return false;
    }
    const res = await addDocumentFiles(target.id, uploaded);
    if (!res.ok) { notify.error(docError(res.error)); return false; }
    setPendingFiles([]);
    notify.success(t("follow.toast.fileAdded"));
    return true;
  };

  const submit = () => {
    if (!validate()) return;
    start(async () => {
      const payload: DocumentInput = { ...form, ref_int: form.ref_int || null, ref_ext: form.ref_ext || null, start_index: form.start_index || null };
      if (isEdit && docId) {
        const res = await updateDocument(docId, payload);
        if (!res.ok) { notify.error(docError(res.error)); return; }
        await uploadPending({ id: docId, project_id: projectId });
        notify.success(tg("toast.saved"));
        setReload((n) => n + 1);
        router.refresh();
        return;
      }
      const res = await createDocument(mode === "library" ? "library" : "project", projectId, payload);
      if (!res.ok) { notify.error(res.error === "invalid_index" ? t("follow.errors.invalid_index") : res.error === "unique_content" ? docError(res.error) : t("dialog.createFailed")); return; }
      if (nature === "pdf_unversioned") await uploadPending({ id: res.data.id, project_id: projectId });
      notify.success(mode === "folder" ? tf("dialog.created") : t("dialog.created"));
      router.refresh();
      setInitial("");
      dialog.replace(`${prefix}/edit/${res.data.id}/${nature === "pdf_unversioned" ? "content-tab" : "follow-tab"}`);
    });
  };

  const addFiles = async (list: FileList | null) => {
    const accepted: File[] = [];
    for (const f of Array.from(list ?? [])) {
      const err = validatePdf(f) ?? ((await isPasswordProtectedPdf(f)) ? "password" : null);
      if (err) notify.error(t(`follow.errors.${err}` as never)); else accepted.push(f);
    }
    setPendingFiles((p) => [...p, ...accepted]);
  };

  const sourceOptions = CREATION_SOURCES;
  const natureOptions = mode === "library" ? NATURES_BY_SOURCE.extern
    : (NATURES_BY_SOURCE[form.source as Exclude<DocumentSource, "closing_folder">] ?? []).filter((n) => n !== "diagram" || loaded?.diagramEnabled);

  const select = (key: "family_id" | "category_id" | "closing_category_id" | "account_id" | "folder_template_id", label: string, items: Option[],
    opts: { required?: boolean; help?: string; disabled?: boolean; allowNone?: boolean } = {}) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel>{label}{opts.required && " *"}</FieldLabel>
      <Select value={(form[key] as string) || (opts.allowNone ? "none" : undefined)} disabled={readOnly || opts.disabled}
        onValueChange={(v) => set({ [key]: v === "none" ? null : v } as Partial<DocumentInput>)}>
        <SelectTrigger aria-invalid={!!errors[key]}><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
        <SelectContent><SelectGroup>
          {opts.allowNone && <SelectItem value="none">{tg("none")}</SelectItem>}
          {items.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.color && <span className="size-3 rounded-sm" style={{ backgroundColor: o.color }} />}{o.label}</SelectItem>
          ))}
        </SelectGroup></SelectContent>
      </Select>
      {opts.help && <FieldDescription>{opts.help}</FieldDescription>}
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );
  const text = (key: "name" | "ref_int" | "ref_ext" | "start_index", label: string, opts: { required?: boolean; placeholder?: string; disabled?: boolean; help?: string; max?: number } = {}) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={`d-${key}`}>{label}{opts.required && " *"}</FieldLabel>
      <Input id={`d-${key}`} value={(form[key] as string) ?? ""} placeholder={opts.placeholder} maxLength={opts.max ?? 255}
        disabled={readOnly || opts.disabled} aria-invalid={!!errors[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<DocumentInput>)} />
      {opts.help && <FieldDescription>{opts.help}</FieldDescription>}
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );

  const familyOptions: Option[] = (loaded?.families ?? []).map((f) => ({ id: f.id, label: f.long_name ? `${f.short_name} - ${f.long_name}` : f.short_name, color: f.color }));
  const languages = ["none", "fr", "en", "de", "it"] as const;
  const showLinkedFlowOption = nature === "multi_flow_form" || nature === "rfi" || form.source === "module";
  const showHighlight = form.source === "flow" && ["pr", "multi_pr", "dsi", "emm", "adr", "object"].includes(nature);
  const refGenerated = loaded?.hasRefRule && !isEdit;

  const body = (() => {
    if (!loaded || (isEdit && !doc)) return <div className="flex justify-center py-16"><Spinner /></div>;
    if (tab === "attribute-tab") {
      return <CustomFieldsEditor fields={fieldsForFamily} values={(form.custom_fields ?? {}) as CustomFieldValues}
        onChange={(v) => set({ custom_fields: v })} emptyLabel={t("dialog.noAttributes")} />;
    }
    if (tab === "follow-tab") {
      if (!isEdit || !doc) return <Alert><AlertDescription>{t("dialog.saveFirst")}</AlertDescription></Alert>;
      return <FollowTab key={reload} doc={{
        id: doc.id, name: doc.name, nature: doc.nature, source: doc.source, scope: doc.scope, origin: doc.origin, actions_disabled: doc.actions_disabled,
        project_id: doc.project_id, linked_flow_id: doc.linked_flow_id,
        family: family ? { client_supervision: family.client_supervision, client_supervision_sub_index: family.client_supervision_sub_index, wording_configuration_id: family.wording_configuration_id } : null,
      }} wording={wording} flags={flags} canEdit={perms.edit} canUnlock={perms.unlock} canDelete={perms.delete} />;
    }
    if (tab === "content-tab") {
      if (nature === "pdf_unversioned") {
        return (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="d-files">{tc("files")}</FieldLabel>
              <Input id="d-files" type="file" multiple accept="application/pdf,.pdf" disabled={readOnly} onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
              {pendingFiles.length > 0 && <FieldDescription>{tc("filesSelected", { count: pendingFiles.length })} · {tc("filesSaveHint")}</FieldDescription>}
            </Field>
            <ul className="flex flex-col divide-y rounded-md border">
              {files.length + pendingFiles.length === 0 && <li className="p-3 text-center text-sm text-muted-foreground">{tc("noFiles")}</li>}
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <FileTextIcon className="size-4 text-muted-foreground" />
                  <button type="button" className="truncate text-left hover:underline" onClick={async () => { const r = await getSignedUrl(f.storage_path); if (r.ok) window.open(r.data.url, "_blank", "noopener"); }}>{f.name}</button>
                  <span className="ml-auto text-xs text-muted-foreground">{formatSize(f.size)}</span>
                  {!readOnly && <Button variant="ghost" size="icon-sm" aria-label={tg("actions.delete")} onClick={() => (files.length <= 1 ? notify.error(tc("keepOne")) : setFileToRemove(f))}><Trash2Icon /></Button>}
                </li>
              ))}
              {pendingFiles.map((f, i) => (
                <li key={`p-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                  <FileTextIcon className="size-4" /><span className="truncate">{f.name}</span>
                  <span className="ml-auto text-xs">{formatSize(f.size)}</span>
                  <Button variant="ghost" size="icon-sm" aria-label={tg("actions.delete")} onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}><Trash2Icon /></Button>
                </li>
              ))}
            </ul>
          </FieldGroup>
        );
      }
      return <ContentTab nature={nature} form={form} set={set} sources={loaded.sources} errors={errors} disabled={readOnly || (isEdit && !isPrel)} referentialEntity={loaded.referentialEntity} />;
    }
    if (tab === "options-tab") {
      if (ext) return <p className="py-8 text-center text-muted-foreground">{t("options.noneForExtern")}</p>;
      return (
        <FieldGroup>
          <p className="text-sm font-medium">{t("options.languagesTitle")}</p>
          <div className="grid grid-cols-2 gap-4">
            {(["language_1", "language_2"] as const).map((key, i) => (
              <Field key={key}>
                <FieldLabel>{t(i === 0 ? "options.language1" : "options.language2")}</FieldLabel>
                <Select value={form[key] ?? (i === 0 ? "fr" : "none")} disabled={readOnly || !isPrel || (i === 1 && !form.language_1)}
                  onValueChange={(v) => set(i === 0 ? { language_1: v as never, language_2: form.language_2 === v ? "none" : form.language_2 } : { language_2: v as never })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    {languages.filter((l) => (i === 0 ? l !== "none" : l !== form.language_1)).map((l) => <SelectItem key={l} value={l}>{t(`options.languages.${l}`)}</SelectItem>)}
                  </SelectGroup></SelectContent>
                </Select>
                {!isPrel && <FieldDescription>{t("options.languagesLocked")}</FieldDescription>}
              </Field>
            ))}
          </div>
          {showLinkedFlowOption && (
            <Field>
              <FieldLabel>{t("options.linkedFlowToggle")}</FieldLabel>
              <Select value={form.linked_flow_id ?? "none"} disabled={readOnly || !isPrel} onValueChange={(v) => set({ linked_flow_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder={t("options.linkedFlow")} /></SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value="none">{tg("none")}</SelectItem>
                  {loaded.sources.flows.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
          )}
          <Field orientation="horizontal">
            <Switch id="d-ccp" checked={!!form.client_cover_page} disabled={readOnly || !(isPrel || last?.state === "bpo")} onCheckedChange={(v) => set({ client_cover_page: v })} />
            <FieldLabel htmlFor="d-ccp">{t("options.clientCoverPage")}</FieldLabel>
          </Field>
          {!(isPrel || last?.state === "bpo") && <FieldDescription>{t("options.clientCoverPageLocked")}</FieldDescription>}
          {showHighlight && (
            <Field orientation="horizontal">
              <Switch id="d-hl" checked={!!form.highlight_changes} disabled={readOnly} onCheckedChange={(v) => set({ highlight_changes: v })} />
              <FieldLabel htmlFor="d-hl">{t("options.highlightChanges")}</FieldLabel>
            </Field>
          )}
        </FieldGroup>
      );
    }
    // ----- Général -----
    return (
      <FieldGroup>
        {doc?.content_disabled && <Alert><AlertDescription>{doc.origin === "derived_from_standard" ? t("dialog.readOnlyReferential") : t("dialog.readOnly")}</AlertDescription></Alert>}
        {mode === "project" && (
          <Field>
            <FieldLabel>{t("dialog.source")} *</FieldLabel>
            <ToggleGroup type="single" variant="outline" value={form.source} disabled={isEdit || readOnly} className="flex-wrap justify-start"
              onValueChange={(v) => v && set({ source: v as never, nature: NATURES_BY_SOURCE[v as keyof typeof NATURES_BY_SOURCE][0] })}>
              {sourceOptions.map((s) => <ToggleGroupItem key={s} value={s} className="px-3" title={t(`sourceComments.${s}`)}>{t(`sources.${s}`)}</ToggleGroupItem>)}
            </ToggleGroup>
            <FieldDescription>{t(`sourceComments.${form.source as (typeof CREATION_SOURCES)[number]}`)}</FieldDescription>
          </Field>
        )}
        {mode !== "folder" && (
          <Field>
            <FieldLabel>{t("dialog.type")} *</FieldLabel>
            {isEdit ? <p className="text-sm">{t(`natures.${nature}`)}</p> : (
              <div className="grid grid-cols-2 gap-2">
                {natureOptions.map((n) => (
                  <button key={n} type="button" onClick={() => set({ nature: n, start_index: n === "pdf_unversioned" ? "" : form.start_index })}
                    className={cn("flex flex-col items-start rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-primary",
                      baseNature(nature) === n && "border-primary bg-row-focus")}>
                    <span className="font-medium">{t(`natures.${n}`)}</span>
                    <span className="text-xs text-muted-foreground">{t(`natureComments.${n}` as never)}</span>
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}
        {mode === "library" && select("account_id", t("dialog.applicability"), loaded.accounts, { required: true })}
        <div className="grid grid-cols-2 gap-4">
          {select("family_id", t("dialog.family"), familyOptions, { required: true })}
          {text("name", mode === "folder" ? tf("dialog.name") : t("dialog.name"), { required: true })}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {text("ref_int", t("dialog.refInt"), {
            placeholder: refGenerated ? t("dialog.refIntGenerated") : undefined,
            disabled: isEdit && loaded.hasRefRule && !perms.editRef,
          })}
          {text("ref_ext", t("dialog.refExt"))}
        </div>
        {nature !== "pdf_unversioned" && mode !== "folder" && text("start_index", t("dialog.startIndex"), {
          max: 16, disabled: !startIndexEditable, help: startIndexEditable ? t("dialog.startIndexHelp") : t("dialog.startIndexLocked"),
        })}
        {mode !== "folder" && (
          <div className="grid grid-cols-2 gap-4">
            {select("category_id", t("dialog.category"), loaded.categories, { allowNone: true, help: t("dialog.categoryHelp") })}
            {select("closing_category_id", t("dialog.closingCategory"), loaded.categories, { allowNone: true, help: t("dialog.closingCategoryHelp") })}
          </div>
        )}
        {mode === "folder" && (
          <>
            {select("folder_template_id", tf("dialog.template"), loaded.templates, { allowNone: true, disabled: isEdit, help: t("dialog.folderTemplateHelp") })}
            <Field>
              <FieldLabel>{t("options.linkedFlow")}</FieldLabel>
              <Select value={form.linked_flow_id ?? "none"} disabled={readOnly} onValueChange={(v) => set({ linked_flow_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value="none">{tg("none")}</SelectItem>
                  {loaded.sources.flows.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
          </>
        )}
      </FieldGroup>
    );
  })();

  const tabIndex = tabs.indexOf(tab);
  const nextTab = !isEdit && tabIndex >= 0 && tabIndex < tabs.length - 1 && tabs[tabIndex + 1] !== "follow-tab" ? tabs[tabIndex + 1] : null;
  const familyName = family?.short_name ?? "";

  return (
    <>
      <ModalShell onClose={requestClose} size="lg"
        icon={<EntityIcon kind="project" icon={mode === "folder" ? ArchiveIcon : FileTextIcon} size="md" />}
        title={isEdit
          ? (mode === "folder" ? tf("dialog.editTitle", { folderName: form.name ?? "" }) : t("dialog.editTitle", { familyName, docName: form.name ?? "" }))
          : (mode === "folder" ? tf("dialog.createTitle") : t("dialog.createTitle"))}
        tabs={tabs.map((id) => ({ id, label: t(`dialog.tabs.${id}`), disabled: id === "follow-tab" && !isEdit }))}
        activeTab={tab} onTabChange={goTab}
        onPrevious={isEdit && siblings.previous ? () => dialog.replace(`${prefix}/edit/${siblings.previous}/${tab}`) : undefined}
        onNext={isEdit && siblings.next ? () => dialog.replace(`${prefix}/edit/${siblings.next}/${tab}`) : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={requestClose}>{tg("actions.close")}</Button>
            {nextTab && <Button variant="secondary" onClick={() => goTab(nextTab)}>{t("dialog.next")}</Button>}
            {!readOnly && tab !== "follow-tab" && (
              <Button onClick={submit} disabled={pending || !loaded || !perms.loaded}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
            )}
          </>
        }>
        {body}
      </ModalShell>
      {guard}
      <ConfirmDialog open={!!fileToRemove} onOpenChange={(o) => { if (!o) setFileToRemove(null); }} title={tc("removeFile")} confirmLabel={tg("actions.delete")}
        onConfirm={async () => {
          if (!fileToRemove) return;
          const res = await removeDocumentFile(fileToRemove.id);
          if (!res.ok) { notify.error(docError(res.error)); return; }
          setFiles((f) => f.filter((x) => x.id !== fileToRemove.id)); router.refresh();
        }} />
    </>
  );
}
