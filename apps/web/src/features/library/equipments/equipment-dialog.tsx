"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { WrenchIcon } from "lucide-react";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useDirtyGuard } from "@/features/settings/components/dirty-guard";
import { useSiblings } from "@/features/settings/components/use-siblings";
import { createClient } from "@/lib/supabase/client";
import {
  AccountSelect, appendFile, fileDirty, fileValue, LibraryFamilySelect, LibraryFileField, Loading, PropertiesDialog,
  useLibraryRights, useLibraryRun, type FileValue, type PropertyAuthor,
} from "../shared/ui";
import { saveEquipment } from "./actions";
import { isExpired } from "./meta";

type Form = {
  family_id: string | null; account_id: string | null; name: string; reference: string; provider: string; quantity_unit: string;
  consumable: boolean; subject_to_verification: boolean; validity_date: string; verification_body: string;
};
type Files = { photo: FileValue; reference_document: FileValue; certificate: FileValue };
const EMPTY: Form = { family_id: null, account_id: null, name: "", reference: "", provider: "", quantity_unit: "", consumable: false, subject_to_verification: false, validity_date: "", verification_body: "" };
const NO_FILES: Files = { photo: fileValue(null), reference_document: fileValue(null), certificate: fileValue(null) };

/** ?dialog=library-equipment/add/<onglet> · edit/<id>/<onglet> · properties/<id> — Bibliothèque › Moyens. */
export default function EquipmentDialog({ segments, close }: DialogProps) {
  const [action, a] = segments;
  if (action === "properties" && a) return <EquipmentProperties id={a} close={close} />;
  return <EquipmentEditor segments={segments} close={close} />;
}

function EquipmentEditor({ segments, close }: DialogProps) {
  const t = useTranslations("libraryEquipments");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const { run } = useLibraryRun("libraryEquipments");
  const rights = useLibraryRights("LibraryEquipments");
  const [action, a, b] = segments;
  const isEdit = action === "edit";
  const id = isEdit ? a : null;
  const tab = (isEdit ? b : a) ?? "general-tab";
  const canWrite = !!rights && (isEdit ? rights.edit : rights.add);
  const [form, setForm] = useState<Form>(EMPTY);
  const [initial, setInitial] = useState<Form>(EMPTY);
  const [files, setFiles] = useState<Files>(NO_FILES);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [loaded, setLoaded] = useState(!isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createAnother, setCreateAnother] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || Object.values(files).some(fileDirty);
  const { requestClose, dialog: guard } = useDirtyGuard(dirty, close);
  const siblings = useSiblings(async () => {
    const { data } = await createClient().from("library_equipments").select("id").is("deleted_at", null).order("name");
    return (data ?? []).map((r) => r.id);
  }, id);

  useEffect(() => {
    createClient().from("accounts").select("id, name").order("name").then(({ data }) => {
      setAccounts(data ?? []);
      if (!isEdit && data?.length) {
        const first = data[0].id;
        setForm((f) => (f.account_id ? f : { ...f, account_id: first }));
        setInitial((f) => (f.account_id ? f : { ...f, account_id: first }));
      }
    });
  }, [isEdit]);

  useEffect(() => {
    if (!id) return;
    createClient().from("library_equipments").select("*").eq("id", id).single().then(({ data }) => {
      if (!data) return;
      const s = (v: string | null) => v ?? "";
      const value: Form = {
        family_id: data.family_id, account_id: data.account_id, name: data.name, reference: s(data.reference), provider: s(data.provider),
        quantity_unit: s(data.quantity_unit), consumable: data.consumable, subject_to_verification: data.subject_to_verification,
        validity_date: s(data.validity_date), verification_body: s(data.verification_body),
      };
      setForm(value); setInitial(value);
      setFiles({ photo: fileValue(data.photo_path), reference_document: fileValue(data.reference_document_path), certificate: fileValue(data.certificate_document_path) });
      setLoaded(true);
    });
  }, [id]);

  const goTab = (tabId: string) => dialog.replace(isEdit ? `library-equipment/edit/${id}/${tabId}` : `library-equipment/add/${tabId}`);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.family_id) e.family_id = tg("validators.required");
    if (!form.account_id) e.account_id = tg("validators.required");
    if (!form.name.trim()) e.name = tg("validators.required");
    setErrors(e);
    if (Object.keys(e).length) { goTab("general-tab"); return; }
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) fd.append(k, typeof v === "boolean" ? String(v) : v ?? "");
    for (const [k, v] of Object.entries(files)) appendFile(fd, k, v);
    startTransition(async () => {
      const res = await run(() => saveEquipment(id, fd), isEdit ? undefined : t("dialog.created"));
      if (!res.ok) return;
      setInitial(form);
      if (!isEdit && createAnother) {
        const next = { ...EMPTY, account_id: form.account_id, family_id: form.family_id };
        setForm(next); setInitial(next); setFiles(NO_FILES); return;
      }
      close();
    });
  };

  const text = (key: "name" | "reference" | "provider" | "quantity_unit" | "verification_body", label: string, required = false, max = 255) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={`eq-${key}`}>{label}{required && " *"}</FieldLabel>
      <Input id={`eq-${key}`} value={form[key]} maxLength={max} disabled={!canWrite} aria-invalid={!!errors[key]} onChange={(e) => set(key, e.target.value)} />
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );
  const expired = form.subject_to_verification && isExpired({ validity_date: form.validity_date || null });

  return (
    <ModalShell onClose={requestClose} size="lg"
      icon={<EntityIcon kind="library" icon={WrenchIcon} size="md" />}
      title={isEdit ? (canWrite ? t("dialog.editTitle") : t("dialog.viewTitle")) : t("dialog.createTitle")}
      subtitle={isEdit ? initial.name : undefined}
      tabs={[{ id: "general-tab", label: t("dialog.tabs.general") }, { id: "verification-tab", label: t("dialog.tabs.verification") }]}
      activeTab={tab} onTabChange={goTab}
      onPrevious={siblings.previous ? () => dialog.replace(`library-equipment/edit/${siblings.previous}/${tab}`) : undefined}
      onNext={siblings.next ? () => dialog.replace(`library-equipment/edit/${siblings.next}/${tab}`) : undefined}
      footer={canWrite ? <>
        {!isEdit && (
          <label className="mr-auto flex items-center gap-2 text-sm">
            <Checkbox checked={createAnother} onCheckedChange={(v) => setCreateAnother(!!v)} />{t("dialog.createAnother")}
          </label>
        )}
        <Button variant="secondary" onClick={requestClose}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !loaded}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </> : <Button variant="secondary" onClick={requestClose}>{tg("actions.close")}</Button>}>
      {!loaded ? <Loading /> : tab === "verification-tab" ? (
        <FieldGroup>
          <Field orientation="horizontal">
            <Switch id="eq-verify" checked={form.subject_to_verification} disabled={!canWrite} onCheckedChange={(v) => set("subject_to_verification", v)} />
            <FieldLabel htmlFor="eq-verify">{t("dialog.fields.subjectToVerification")}</FieldLabel>
          </Field>
          {form.subject_to_verification && (
            <>
              <Field>
                <FieldLabel htmlFor="eq-validity">{t("dialog.fields.validityDate")}</FieldLabel>
                <Input id="eq-validity" type="date" className="w-56" value={form.validity_date} disabled={!canWrite} onChange={(e) => set("validity_date", e.target.value)} />
              </Field>
              {expired && <Alert variant="destructive"><AlertDescription>{t("badges.expired")}</AlertDescription></Alert>}
              {text("verification_body", t("dialog.fields.verificationBody"))}
            </>
          )}
        </FieldGroup>
      ) : (
        <FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            <Field data-invalid={!!errors.family_id}>
              <FieldLabel>{t("dialog.fields.family")} *</FieldLabel>
              <LibraryFamilySelect nature="equipment" value={form.family_id} onChange={(v) => set("family_id", v)} disabled={!canWrite} invalid={!!errors.family_id} />
              {errors.family_id && <FieldError>{errors.family_id}</FieldError>}
            </Field>
            <Field data-invalid={!!errors.account_id}>
              <FieldLabel htmlFor="eq-account">{t("dialog.fields.applicability")} *</FieldLabel>
              <AccountSelect id="eq-account" accounts={accounts} value={form.account_id} onChange={(v) => set("account_id", v)} disabled={!canWrite} />
            </Field>
          </div>
          {text("name", t("dialog.fields.name"), true)}
          <div className="grid grid-cols-3 gap-4">
            {text("reference", t("dialog.fields.reference"))}{text("provider", t("dialog.fields.provider"))}{text("quantity_unit", t("dialog.fields.unit"), false, 50)}
          </div>
          <Field orientation="horizontal">
            <Switch id="eq-consumable" checked={form.consumable} disabled={!canWrite} onCheckedChange={(v) => set("consumable", v)} />
            <FieldLabel htmlFor="eq-consumable">{t("dialog.fields.consumable")}</FieldLabel>
          </Field>
          <LibraryFileField id="eq-photo" label={t("dialog.fields.photo")} kind="image" value={files.photo} disabled={!canWrite}
            onChange={(v) => setFiles((f) => ({ ...f, photo: v }))} />
          <LibraryFileField id="eq-ref-doc" label={t("dialog.fields.referenceDocument")} tooltip={t("dialog.documentHint")} kind="pdf" value={files.reference_document}
            disabled={!canWrite} onChange={(v) => setFiles((f) => ({ ...f, reference_document: v }))} />
          <LibraryFileField id="eq-cert" label={t("dialog.fields.certificate")} tooltip={t("dialog.documentHint")} kind="pdf" value={files.certificate}
            disabled={!canWrite} onChange={(v) => setFiles((f) => ({ ...f, certificate: v }))} />
        </FieldGroup>
      )}
      {guard}
    </ModalShell>
  );
}

function EquipmentProperties({ id, close }: { id: string; close: () => void }) {
  const t = useTranslations("libraryEquipments.properties");
  const format = useFormatter();
  type P = { name: string; reference: string | null; subject_to_verification: boolean; validity_date: string | null; created_at: string; updated_at: string;
    family: { short_name: string; long_name: string | null } | null; account: { name: string } | null; creator: PropertyAuthor; updater: PropertyAuthor };
  const [p, setP] = useState<P | null>(null);
  useEffect(() => {
    createClient().from("library_equipments")
      .select(`name, reference, subject_to_verification, validity_date, created_at, updated_at,
        family:label_families!library_equipments_family_id_fkey(short_name, long_name), account:accounts(name),
        creator:collaborators!library_equipments_created_by_fkey(first_name, last_name), updater:collaborators!library_equipments_updated_by_fkey(first_name, last_name)`)
      .eq("id", id).single().then(({ data }) => setP(data as unknown as P));
  }, [id]);
  if (!p) return <ModalShell onClose={close} size="sm" title={t("title")}><Loading /></ModalShell>;
  const verification = !p.subject_to_verification ? t("verificationFalse") : isExpired(p) ? t("verificationExpired") : t("verificationTrue");
  return (
    <PropertiesDialog title={t("title")} onClose={close} createdAt={p.created_at} createdBy={p.creator} updatedAt={p.updated_at} updatedBy={p.updater}
      lines={[
        { label: t("applicability"), value: p.account?.name },
        { label: t("family"), value: p.family ? [p.family.short_name, p.family.long_name].filter(Boolean).join(" - ") : null },
        { label: t("name"), value: p.name },
        { label: t("reference"), value: p.reference },
        { label: t("verification"), value: p.validity_date ? `${verification} (${format.dateTime(new Date(p.validity_date), { dateStyle: "short" })})` : verification },
      ]} />
  );
}
