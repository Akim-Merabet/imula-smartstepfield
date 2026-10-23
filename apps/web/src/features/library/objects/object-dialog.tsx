"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { GroupIcon } from "lucide-react";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { CustomFieldsEditor, type CustomFieldDef, type CustomFieldValues } from "@/components/custom-fields/custom-fields-editor";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useDirtyGuard } from "@/features/settings/components/dirty-guard";
import { useSiblings } from "@/features/settings/components/use-siblings";
import { createClient } from "@/lib/supabase/client";
import { AccountSelect, LibraryFamilySelect, Loading, PropertiesDialog, useLibraryRights, useLibraryRun, type PropertyAuthor } from "../shared/ui";
import { duplicateObject, saveObject, type ObjectInput } from "./actions";

type Form = {
  family_id: string | null; account_id: string | null; parent_id: string | null; name: string; item_code: string; external_reference: string;
  identification_number: string; object_index: string; custom_status_id: string | null; certificate_document_id: string | null; description: string;
};
const EMPTY: Form = {
  family_id: null, account_id: null, parent_id: null, name: "", item_code: "", external_reference: "", identification_number: "",
  object_index: "", custom_status_id: null, certificate_document_id: null, description: "",
};
const NONE = "__none";
type Status = { id: string; name: string; color: string; link_type: string; label_family_id: string | null; is_default: boolean };
type FieldRow = CustomFieldDef & { link_type: string; label_family_id: string | null };

/** ?dialog=library-object/add/<onglet> · add-child/<parent>/<onglet> · edit/<id>/<onglet> · duplicate/<id> · properties/<id>. */
export default function ObjectDialog({ segments, close }: DialogProps) {
  const [action, a] = segments;
  if (action === "properties" && a) return <ObjectProperties id={a} close={close} />;
  if (action === "duplicate" && a) return <DuplicateObject id={a} close={close} />;
  return <ObjectEditor segments={segments} close={close} />;
}

function ObjectEditor({ segments, close }: DialogProps) {
  const t = useTranslations("technicalObjects");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const { run } = useLibraryRun("technicalObjects");
  const rights = useLibraryRights("LibraryObjectManagement");
  const [action, a, b] = segments;
  const isEdit = action === "edit";
  const isChild = action === "add-child";
  const id = isEdit ? a : null;
  const parentFromUrl = isChild ? a : null;
  const tab = ((isEdit || isChild) ? b : a) ?? "general-tab";
  const base = isEdit ? `library-object/edit/${id}` : isChild ? `library-object/add-child/${parentFromUrl}` : "library-object/add";
  const canWrite = !!rights && (isEdit ? rights.edit : rights.add);

  const [form, setForm] = useState<Form>({ ...EMPTY, parent_id: parentFromUrl });
  const [initial, setInitial] = useState<Form>({ ...EMPTY, parent_id: parentFromUrl });
  const [values, setValues] = useState<CustomFieldValues>({});
  const [initialValues, setInitialValues] = useState<CustomFieldValues>({});
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [objects, setObjects] = useState<{ id: string; name: string; parent_id: string | null }[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [documents, setDocuments] = useState<{ id: string; name: string; ref_int: string | null }[]>([]);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [familyParent, setFamilyParent] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createAnother, setCreateAnother] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || JSON.stringify(values) !== JSON.stringify(initialValues);
  const { requestClose, dialog: guard } = useDirtyGuard(dirty, close);
  const siblings = useSiblings(async () => {
    const { data } = await createClient().from("technical_objects").select("id").is("deleted_at", null).order("name");
    return (data ?? []).map((r) => r.id);
  }, id);

  useEffect(() => {
    const supabase = createClient();
    void Promise.all([
      supabase.from("accounts").select("id, name").order("name"),
      supabase.from("technical_objects").select("id, name, parent_id").is("deleted_at", null).order("name"),
      supabase.from("custom_statuses").select("id, name, color, link_type, label_family_id, is_default").eq("nature", "technical_object").eq("active", true).order("sort_order"),
      supabase.from("documents").select("id, name, ref_int").eq("scope", "library").is("deleted_at", null).in("nature", ["pdf_versioned", "pdf_unversioned"]).order("name"),
      supabase.from("custom_fields").select("id, name, type, choices, placeholder, tooltip, description, required, read_only, default_value, link_type, label_family_id")
        .eq("nature", "technical_object").eq("active", true).is("deleted_at", null).order("sort_order").order("name"),
    ]).then(([acc, objs, sts, docs, cfs]) => {
      setAccounts(acc.data ?? []);
      setObjects(objs.data ?? []);
      setStatuses((sts.data ?? []) as Status[]);
      setDocuments(docs.data ?? []);
      setFields((cfs.data ?? []) as FieldRow[]);
      if (!isEdit && acc.data?.length) {
        const first = acc.data[0].id;
        setForm((f) => (f.account_id ? f : { ...f, account_id: first }));
        setInitial((f) => (f.account_id ? f : { ...f, account_id: first }));
      }
    });
  }, [isEdit]);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    void Promise.all([
      supabase.from("technical_objects").select("*").eq("id", id).single(),
      supabase.from("custom_field_values").select("custom_field_id, value_text, value_json").eq("object_id", id),
    ]).then(([{ data }, { data: vals }]) => {
      if (!data) return;
      const s = (v: string | null) => v ?? "";
      const value: Form = {
        family_id: data.family_id, account_id: data.account_id, parent_id: data.parent_id, name: data.name, item_code: s(data.item_code),
        external_reference: s(data.external_reference), identification_number: s(data.identification_number), object_index: s(data.object_index),
        custom_status_id: data.custom_status_id, certificate_document_id: data.certificate_document_id, description: s(data.description),
      };
      const v: CustomFieldValues = {};
      for (const row of vals ?? []) v[row.custom_field_id] = Array.isArray(row.value_json) ? (row.value_json as string[]) : row.value_text;
      setForm(value); setInitial(value); setValues(v); setInitialValues(v); setLoaded(true);
    });
  }, [id]);

  useEffect(() => {
    if (!form.family_id) return;
    void createClient().from("label_families").select("parent_id").eq("id", form.family_id).maybeSingle()
      .then(({ data }) => setFamilyParent(data?.parent_id ?? null));
  }, [form.family_id]);

  const familyIds = useMemo(() => new Set([form.family_id, familyParent].filter(Boolean) as string[]), [form.family_id, familyParent]);
  const applies = (x: { link_type: string; label_family_id: string | null }) => x.link_type === "default" || (!!x.label_family_id && familyIds.has(x.label_family_id));
  const familyFields = form.family_id ? fields.filter(applies) : [];
  const familyStatuses = statuses.filter(applies);
  // Parent possible : tout objet sauf lui-même et ses descendants.
  const parentOptions = useMemo(() => {
    if (!id) return objects;
    const banned = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const o of objects) if (o.parent_id && banned.has(o.parent_id) && !banned.has(o.id)) { banned.add(o.id); grew = true; }
    }
    return objects.filter((o) => !banned.has(o.id));
  }, [objects, id]);
  const parentName = objects.find((o) => o.id === parentFromUrl)?.name ?? "";

  const goTab = (tabId: string) => dialog.replace(`${base}/${tabId}`);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.family_id) e.family_id = tg("validators.required");
    if (!form.account_id) e.account_id = tg("validators.required");
    if (!form.name.trim()) e.name = tg("validators.required");
    for (const f of familyFields) {
      const v = values[f.id];
      if (f.required && f.type !== "label" && (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length))) e[`cf-${f.id}`] = f.name;
    }
    setErrors(e);
    if (e.family_id || e.account_id || e.name) { goTab("general-tab"); return; }
    if (Object.keys(e).length) { goTab("attributes-tab"); return; }
    const allowed = new Set(familyFields.map((f) => f.id));
    const input: ObjectInput = {
      family_id: form.family_id!, account_id: form.account_id!, parent_id: form.parent_id, name: form.name,
      item_code: form.item_code || null, external_reference: form.external_reference || null, identification_number: form.identification_number || null,
      object_index: form.object_index || null, custom_status_id: form.custom_status_id, certificate_document_id: form.certificate_document_id,
      description: form.description || null,
      values: Object.fromEntries(Object.entries(values).filter(([k]) => allowed.has(k))),
    };
    startTransition(async () => {
      const res = await run(() => saveObject(id, input), id ? undefined : t("dialog.created"));
      if (!res.ok) return;
      setInitial(form); setInitialValues(values);
      if (!id && createAnother) {
        const next = { ...EMPTY, account_id: form.account_id, family_id: form.family_id, parent_id: form.parent_id };
        setForm(next); setInitial(next); setValues({}); setInitialValues({}); return;
      }
      close();
    });
  };

  const text = (key: "name" | "item_code" | "external_reference" | "identification_number" | "object_index", label: string, required = false) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={`to-${key}`}>{label}{required && " *"}</FieldLabel>
      <Input id={`to-${key}`} value={form[key]} maxLength={key === "object_index" ? 50 : 255} disabled={!canWrite} aria-invalid={!!errors[key]}
        onChange={(e) => set(key, e.target.value)} />
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );
  const select = (id_: string, value: string | null, onChange: (v: string | null) => void, options: { id: string; label: string; color?: string }[], noneLabel: string) => (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={!canWrite}>
      <SelectTrigger id={id_}><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.color && <span className="size-3 rounded-sm" style={{ backgroundColor: o.color }} />}{o.label}</SelectItem>
        ))}
      </SelectGroup></SelectContent>
    </Select>
  );
  const missing = Object.entries(errors).filter(([k]) => k.startsWith("cf-")).map(([, v]) => v);

  return (
    <ModalShell onClose={requestClose} size="lg"
      icon={<EntityIcon kind="library" icon={GroupIcon} size="md" />}
      title={isEdit ? (canWrite ? t("dialog.editTitle", { name: initial.name }) : t("dialog.viewTitle", { name: initial.name }))
        : isChild ? t("dialog.createChildTitle", { parentName }) : t("dialog.createTitle")}
      tabs={[
        { id: "general-tab", label: t("dialog.tabs.general") },
        { id: "attributes-tab", label: t("dialog.tabs.attributes") },
        ...(isEdit ? [{ id: "history-tab", label: t("dialog.tabs.history") }] : []),
      ]}
      activeTab={tab} onTabChange={goTab}
      onPrevious={siblings.previous ? () => dialog.replace(`library-object/edit/${siblings.previous}/${tab}`) : undefined}
      onNext={siblings.next ? () => dialog.replace(`library-object/edit/${siblings.next}/${tab}`) : undefined}
      footer={canWrite ? <>
        {!isEdit && (
          <label className="mr-auto flex items-center gap-2 text-sm">
            <Checkbox checked={createAnother} onCheckedChange={(v) => setCreateAnother(!!v)} />{t("dialog.createAnother")}
          </label>
        )}
        <Button variant="secondary" onClick={requestClose}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !loaded}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </> : <Button variant="secondary" onClick={requestClose}>{tg("actions.close")}</Button>}>
      {!loaded ? <Loading /> : tab === "history-tab" && id ? <ObjectHistory id={id} /> : tab === "attributes-tab" ? (
        !form.family_id ? <p className="py-8 text-center text-muted-foreground">{t("dialog.familyFirst")}</p> : (
          <div className="flex flex-col gap-3">
            {missing.length > 0 && <p className="text-sm text-destructive">{tg("validators.required")} : {missing.join(", ")}</p>}
            <CustomFieldsEditor fields={canWrite ? familyFields : familyFields.map((f) => ({ ...f, read_only: true }))} values={values}
              onChange={setValues} emptyLabel={t("dialog.noAttributes")} />
          </div>
        )
      ) : (
        <FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            <Field data-invalid={!!errors.family_id}>
              <FieldLabel>{t("dialog.fields.family")} *</FieldLabel>
              <LibraryFamilySelect nature="technical_object" value={form.family_id} onChange={(v) => set("family_id", v)} disabled={!canWrite} invalid={!!errors.family_id} />
              {errors.family_id && <FieldError>{errors.family_id}</FieldError>}
            </Field>
            <Field data-invalid={!!errors.account_id}>
              <FieldLabel htmlFor="to-account">{t("dialog.fields.applicability")} *</FieldLabel>
              <AccountSelect id="to-account" accounts={accounts} value={form.account_id} onChange={(v) => set("account_id", v)} disabled={!canWrite} />
            </Field>
          </div>
          {text("name", t("dialog.fields.name"), true)}
          <Field>
            <FieldLabel htmlFor="to-parent">{t("dialog.fields.parent")}</FieldLabel>
            {select("to-parent", form.parent_id, (v) => set("parent_id", v), parentOptions.map((o) => ({ id: o.id, label: o.name })), t("dialog.fields.noParent"))}
          </Field>
          <div className="grid grid-cols-2 gap-4">{text("item_code", t("dialog.fields.itemCode"))}{text("external_reference", t("dialog.fields.externalReference"))}</div>
          <div className="grid grid-cols-[1fr_8rem] gap-4">{text("identification_number", t("dialog.fields.identificationNumber"))}{text("object_index", t("dialog.fields.index"))}</div>
          <Field>
            <FieldLabel htmlFor="to-status">{t("dialog.fields.status")}</FieldLabel>
            {select("to-status", form.custom_status_id, (v) => set("custom_status_id", v), familyStatuses.map((s) => ({ id: s.id, label: s.name, color: s.color })), "—")}
            <FieldDescription>{t("dialog.statusHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="to-cert">{t("dialog.fields.certificate")}</FieldLabel>
            {select("to-cert", form.certificate_document_id, (v) => set("certificate_document_id", v),
              documents.map((d) => ({ id: d.id, label: d.ref_int ? `${d.ref_int} — ${d.name}` : d.name })), t("dialog.fields.noCertificate"))}
            <FieldDescription>{t("dialog.certificateHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="to-desc">{t("dialog.fields.description")}</FieldLabel>
            <Textarea id="to-desc" value={form.description} maxLength={5000} disabled={!canWrite} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </FieldGroup>
      )}
      {guard}
    </ModalShell>
  );
}

/** Historique des valeurs d'attributs (saisie directe ou réponse de formulaire liée). */
function ObjectHistory({ id }: { id: string }) {
  const t = useTranslations("technicalObjects.history");
  const format = useFormatter();
  type H = { id: string; changed_at: string; old_value_text: string | null; new_value_text: string | null; source: string;
    field: { name: string } | null; author: { first_name: string; last_name: string } | null };
  const [rows, setRows] = useState<H[] | null>(null);
  useEffect(() => {
    createClient().from("custom_field_value_history")
      .select("id, changed_at, old_value_text, new_value_text, source, field:custom_fields(name), author:collaborators(first_name, last_name)")
      .eq("object_id", id).order("changed_at", { ascending: false }).limit(200)
      .then(({ data }) => setRows((data ?? []) as unknown as H[]));
  }, [id]);
  if (!rows) return <Loading />;
  if (!rows.length) return <p className="py-8 text-center text-muted-foreground">{t("empty")}</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b text-left text-table-head">
        <th className="py-2 pr-3">{t("columns.date")}</th><th className="pr-3">{t("columns.attribute")}</th><th className="pr-3">{t("columns.old")}</th>
        <th className="pr-3">{t("columns.new")}</th><th className="pr-3">{t("columns.by")}</th><th>{t("columns.source")}</th>
      </tr></thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.id} className="border-b align-top">
            <td className="py-2 pr-3 whitespace-nowrap">{format.dateTime(new Date(h.changed_at), { dateStyle: "short", timeStyle: "short" })}</td>
            <td className="pr-3">{h.field?.name ?? "—"}</td>
            <td className="pr-3 text-muted-foreground">{h.old_value_text ?? "—"}</td>
            <td className="pr-3">{h.new_value_text ?? "—"}</td>
            <td className="pr-3">{h.author ? `${h.author.first_name} ${h.author.last_name}` : "—"}</td>
            <td>{t.has(`sources.${h.source}`) ? t(`sources.${h.source}` as never) : h.source}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DuplicateObject({ id, close }: { id: string; close: () => void }) {
  const t = useTranslations("technicalObjects.duplicate");
  const tg = useTranslations("global");
  const { run } = useLibraryRun("technicalObjects");
  const [source, setSource] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [ident, setIdent] = useState("");
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    createClient().from("technical_objects").select("name").eq("id", id).single().then(({ data }) => {
      if (!data) return;
      setSource(data.name);
      setName(`${data.name} ${t("copySuffix")}`.slice(0, 255));
    });
  }, [id, t]);
  return (
    <ModalShell onClose={close} size="sm" title={t("title", { name: source ?? "" })}
      footer={<>
        <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
        <Button disabled={pending || !name.trim()} onClick={() => startTransition(async () => {
          const res = await run(() => duplicateObject(id, { name, identification_number: ident || null }), t("success"));
          if (res.ok) close();
        })}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.duplicate")}</Button>
      </>}>
      {source === null ? <Loading /> : (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="dup-name">{t("name")} *</FieldLabel>
            <Input id="dup-name" value={name} maxLength={255} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="dup-ident">{t("identificationNumber")}</FieldLabel>
            <Input id="dup-ident" value={ident} maxLength={255} onChange={(e) => setIdent(e.target.value)} />
            <FieldDescription>{t("withAttributes")}</FieldDescription>
          </Field>
        </FieldGroup>
      )}
    </ModalShell>
  );
}

function ObjectProperties({ id, close }: { id: string; close: () => void }) {
  const t = useTranslations("technicalObjects.properties");
  type P = { name: string; item_code: string | null; external_reference: string | null; identification_number: string | null; created_at: string; updated_at: string;
    family: { short_name: string; long_name: string | null } | null; account: { name: string } | null; parent: { name: string } | null;
    creator: PropertyAuthor; updater: PropertyAuthor };
  const [p, setP] = useState<P | null>(null);
  useEffect(() => {
    createClient().from("technical_objects")
      .select(`name, item_code, external_reference, identification_number, created_at, updated_at,
        family:label_families!technical_objects_family_id_fkey(short_name, long_name), account:accounts(name), parent:technical_objects!technical_objects_parent_id_fkey(name),
        creator:collaborators!technical_objects_created_by_fkey(first_name, last_name), updater:collaborators!technical_objects_updated_by_fkey(first_name, last_name)`)
      .eq("id", id).single().then(({ data }) => setP(data as unknown as P));
  }, [id]);
  if (!p) return <ModalShell onClose={close} size="sm" title={t("title")}><Loading /></ModalShell>;
  return (
    <PropertiesDialog title={t("title")} onClose={close} createdAt={p.created_at} createdBy={p.creator} updatedAt={p.updated_at} updatedBy={p.updater}
      lines={[
        { label: t("applicability"), value: p.account?.name },
        { label: t("family"), value: p.family ? [p.family.short_name, p.family.long_name].filter(Boolean).join(" - ") : null },
        { label: t("name"), value: p.name },
        { label: t("parent"), value: p.parent?.name },
        { label: t("itemCode"), value: p.item_code },
        { label: t("externalReference"), value: p.external_reference },
        { label: t("identificationNumber"), value: p.identification_number },
      ]} />
  );
}
