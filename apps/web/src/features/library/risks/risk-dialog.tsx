"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CopyIcon, ExternalLinkIcon, PencilIcon, PlusIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useDirtyGuard } from "@/features/settings/components/dirty-guard";
import { useSiblings } from "@/features/settings/components/use-siblings";
import { createClient } from "@/lib/supabase/client";
import { Pictogram, PictogramPicker } from "../shared/pictogram";
import {
  AccountSelect, appendFile, fileValue, LibraryFamilySelect, LibraryFileField, Loading, openLibraryFile, PropertiesDialog, useLibraryRights, useLibraryRun,
  type FileValue, type PropertyAuthor,
} from "../shared/ui";
import { deleteParade, duplicateParade, saveParade, saveRisk, type RiskInput } from "./actions";

type Form = {
  family_id: string | null; account_id: string | null; name: string; reference: string; source: string; landmark: string;
  pictogram: number | null; major: boolean; frequency: string; occurrence: string; severity: string;
};
type Parade = { id: string; name: string; description: string | null; pictogram: number | null; file_path: string | null; position: number };
const EMPTY: Form = { family_id: null, account_id: null, name: "", reference: "", source: "", landmark: "", pictogram: null, major: false, frequency: "", occurrence: "", severity: "" };
const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.min(999, Math.round(Number(v)))));

/** ?dialog=library-risk/add/<onglet> · edit/<id>/<onglet> · properties/<id> — Bibliothèque › Risques. */
export default function RiskDialog({ segments, close }: DialogProps) {
  const [action, a] = segments;
  if (action === "properties" && a) return <RiskProperties id={a} close={close} />;
  return <RiskEditor segments={segments} close={close} />;
}

function RiskEditor({ segments, close }: DialogProps) {
  const t = useTranslations("libraryRisks");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const { run } = useLibraryRun("libraryRisks");
  const [action, a, b] = segments;
  const isEdit = action === "edit";
  const id = isEdit ? a : null;
  const tab = (isEdit ? b : a) ?? "general-tab";
  const [form, setForm] = useState<Form>(EMPTY);
  const [initial, setInitial] = useState<Form>(EMPTY);
  const [parades, setParades] = useState<Parade[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const rights = useLibraryRights("LibraryRisks");
  const canWrite = !!rights && (isEdit ? rights.edit : rights.add);
  const [loaded, setLoaded] = useState(!isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createAnother, setCreateAnother] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const { requestClose, dialog: guard } = useDirtyGuard(dirty, close);
  const siblings = useSiblings(async () => {
    const { data } = await createClient().from("library_risks").select("id").is("deleted_at", null).order("name");
    return (data ?? []).map((r) => r.id);
  }, id);

  const loadParades = useCallback(async (riskId: string) => {
    const { data } = await createClient().from("library_risk_parades").select("id, name, description, pictogram, file_path, position")
      .eq("risk_id", riskId).order("position");
    setParades(data ?? []);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("accounts").select("id, name").order("name").then(({ data }) => {
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
    const supabase = createClient();
    supabase.from("library_risks").select("*").eq("id", id).single().then(({ data }) => {
      if (!data) return;
      const s = (v: string | null) => v ?? "";
      const n = (v: number | null) => (v === null ? "" : String(v));
      const value: Form = {
        family_id: data.family_id, account_id: data.account_id, name: data.name, reference: s(data.reference), source: s(data.source),
        landmark: s(data.landmark), pictogram: data.pictogram, major: data.major, frequency: n(data.frequency), occurrence: n(data.occurrence), severity: n(data.severity),
      };
      setForm(value); setInitial(value); setLoaded(true);
    });
    supabase.from("library_risk_parades").select("id, name, description, pictogram, file_path, position").eq("risk_id", id).order("position")
      .then(({ data }) => setParades(data ?? []));
  }, [id]);

  const goTab = (tabId: string) => dialog.replace(isEdit ? `library-risk/edit/${id}/${tabId}` : `library-risk/add/${tabId}`);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = (mode: "close" | "next") => {
    const e: Record<string, string> = {};
    if (!form.family_id) e.family_id = tg("validators.required");
    if (!form.account_id) e.account_id = tg("validators.required");
    if (!form.name.trim()) e.name = tg("validators.required");
    setErrors(e);
    if (Object.keys(e).length) { goTab("general-tab"); return; }
    const input: RiskInput = {
      family_id: form.family_id!, account_id: form.account_id!, name: form.name, reference: form.reference || null, source: form.source || null,
      landmark: form.landmark || null, pictogram: form.pictogram, major: form.major,
      frequency: num(form.frequency), occurrence: num(form.occurrence), severity: num(form.severity),
    };
    startTransition(async () => {
      const res = await run(() => saveRisk(id, input), isEdit ? undefined : t("dialog.created"));
      if (!res.ok) return;
      setInitial(form);
      if (mode === "next") { dialog.replace(`library-risk/edit/${res.data.id}/parades-tab`); return; }
      if (!isEdit && createAnother) { setForm({ ...EMPTY, account_id: form.account_id, family_id: form.family_id }); setInitial({ ...EMPTY, account_id: form.account_id, family_id: form.family_id }); return; }
      close();
    });
  };

  const text = (key: "name" | "reference" | "source" | "landmark", required = false) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={`rk-${key}`}>{t(`dialog.fields.${key}`)}{required && " *"}</FieldLabel>
      <Input id={`rk-${key}`} value={form[key]} maxLength={255} disabled={!canWrite} aria-invalid={!!errors[key]} onChange={(e) => set(key, e.target.value)} />
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );
  const score = (key: "frequency" | "occurrence" | "severity") => (
    <Field>
      <FieldLabel htmlFor={`rk-${key}`}>{t(`dialog.fields.${key}`)}</FieldLabel>
      <Input id={`rk-${key}`} type="number" min={0} max={999} step={1} value={form[key]} disabled={!canWrite} onChange={(e) => set(key, e.target.value)} />
    </Field>
  );

  return (
    <ModalShell onClose={requestClose} size="lg"
      icon={<EntityIcon kind="library" icon={TriangleAlertIcon} size="md" />}
      title={isEdit ? (canWrite ? t("dialog.editTitle") : t("dialog.viewTitle")) : t("dialog.createTitle")}
      subtitle={isEdit ? initial.name : undefined}
      tabs={[{ id: "general-tab", label: t("dialog.tabs.general") }, { id: "parades-tab", label: t("dialog.tabs.parades"), disabled: !isEdit }]}
      activeTab={tab} onTabChange={goTab}
      onPrevious={siblings.previous ? () => dialog.replace(`library-risk/edit/${siblings.previous}/${tab}`) : undefined}
      onNext={siblings.next ? () => dialog.replace(`library-risk/edit/${siblings.next}/${tab}`) : undefined}
      footer={canWrite && tab === "general-tab" ? <>
        {!isEdit && (
          <label className="mr-auto flex items-center gap-2 text-sm">
            <Checkbox checked={createAnother} onCheckedChange={(v) => setCreateAnother(!!v)} />{t("dialog.createAnother")}
          </label>
        )}
        <Button variant="secondary" onClick={requestClose}>{tg("actions.cancel")}</Button>
        {!isEdit && <Button variant="outline" onClick={() => submit("next")} disabled={pending}>{t("dialog.nextStep")}</Button>}
        <Button onClick={() => submit("close")} disabled={pending || !loaded}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </> : <Button variant="secondary" onClick={requestClose}>{tg("actions.close")}</Button>}>
      {!loaded ? <Loading /> : tab === "parades-tab" && id ? (
        <ParadesPanel riskId={id} riskName={initial.name} parades={parades} canWrite={canWrite} reload={() => loadParades(id)} />
      ) : (
        <FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            <Field data-invalid={!!errors.family_id}>
              <FieldLabel>{t("dialog.fields.family")} *</FieldLabel>
              <LibraryFamilySelect nature="risk" value={form.family_id} onChange={(v) => set("family_id", v)} disabled={!canWrite} invalid={!!errors.family_id} />
              {errors.family_id && <FieldError>{errors.family_id}</FieldError>}
            </Field>
            <Field data-invalid={!!errors.account_id}>
              <FieldLabel htmlFor="rk-account">{t("dialog.fields.applicability")} *</FieldLabel>
              <AccountSelect id="rk-account" accounts={accounts} value={form.account_id} onChange={(v) => set("account_id", v)} disabled={!canWrite} />
              {errors.account_id && <FieldError>{errors.account_id}</FieldError>}
            </Field>
          </div>
          {text("name", true)}
          <div className="grid grid-cols-3 gap-4">{text("reference")}{text("source")}{text("landmark")}</div>
          <div className="grid grid-cols-2 items-end gap-4">
            <Field>
              <FieldLabel htmlFor="rk-picto">{t("dialog.fields.pictogram")}</FieldLabel>
              <PictogramPicker id="rk-picto" value={form.pictogram} onChange={(v) => set("pictogram", v)} disabled={!canWrite} />
            </Field>
            <Field orientation="horizontal">
              <Switch id="rk-major" checked={form.major} disabled={!canWrite} onCheckedChange={(v) => set("major", v)} />
              <FieldLabel htmlFor="rk-major">{t("dialog.fields.major")}</FieldLabel>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">{score("frequency")}{score("occurrence")}{score("severity")}</div>
          {!isEdit && <p className="text-sm text-muted-foreground">{t("dialog.saveFirst")}</p>}
        </FieldGroup>
      )}
      {guard}
    </ModalShell>
  );
}

/** Onglet « Parades » : parades génériques du risque (nom, pictogramme, PDF, description). */
function ParadesPanel({ riskId, riskName, parades, canWrite, reload }: {
  riskId: string; riskName: string; parades: Parade[]; canWrite: boolean; reload: () => Promise<void>;
}) {
  const t = useTranslations("libraryRisks.parades");
  const tg = useTranslations("global");
  const tr = useTranslations("libraryRisks");
  const { run } = useLibraryRun("libraryRisks");
  const [editing, setEditing] = useState<Parade | "new" | null>(null);
  const [toDelete, setToDelete] = useState<Parade | null>(null);
  const [toDuplicate, setToDuplicate] = useState<Parade | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{t("title")}</h3>
        {canWrite && <Button size="sm" onClick={() => setEditing("new")}><PlusIcon data-icon="inline-start" />{t("add")}</Button>}
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-table-head">
          <th className="py-2 pr-3">{t("columns.name")}</th><th className="pr-3">{t("columns.pictogram")}</th><th className="pr-3">{t("columns.pdf")}</th>
          <th className="w-32 text-right">{t("columns.actions")}</th>
        </tr></thead>
        <tbody>
          {parades.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">{t("empty")}</td></tr>}
          {parades.map((p) => (
            <tr key={p.id} className="border-b">
              <td className="py-2 pr-3">
                <div className="font-medium">{p.name}</div>
                {p.description && <div className="line-clamp-2 text-xs text-muted-foreground">{p.description}</div>}
              </td>
              <td className="pr-3"><Pictogram value={p.pictogram} size="sm" /></td>
              <td className="pr-3">
                {p.file_path ? (
                  <Button variant="link" size="sm" className="px-0" onClick={() => openLibraryFile(p.file_path!, () => notify.error(tg("toast.error")))}>
                    <ExternalLinkIcon data-icon="inline-start" />{t("viewPdf")}
                  </Button>
                ) : "—"}
              </td>
              <td className="text-right">
                {canWrite && (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={tg("actions.edit")} onClick={() => setEditing(p)}><PencilIcon /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={tg("actions.duplicate")} onClick={() => setToDuplicate(p)}><CopyIcon /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={tg("actions.delete")} onClick={() => setToDelete(p)}><Trash2Icon /></Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && <ParadeDialog riskId={riskId} riskName={riskName} parade={editing === "new" ? null : editing}
        onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }} title={t("deleteTitle", { name: toDelete?.name ?? "" })}
        description={tg("confirm.noTrash")} confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete && (await run(() => deleteParade(toDelete.id), t("deleted"))).ok) await reload(); }} />
      <ConfirmDialog open={!!toDuplicate} onOpenChange={(o) => { if (!o) setToDuplicate(null); }} destructive={false}
        title={t("duplicateTitle", { name: toDuplicate?.name ?? "" })} confirmLabel={tg("actions.duplicate")}
        onConfirm={async () => { if (toDuplicate && (await run(() => duplicateParade(toDuplicate.id, tr("duplicate.copySuffix")), t("duplicated"))).ok) await reload(); }} />
    </div>
  );
}

function ParadeDialog({ riskId, riskName, parade, onClose, onSaved }: {
  riskId: string; riskName: string; parade: Parade | null; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const t = useTranslations("libraryRisks.parades");
  const tg = useTranslations("global");
  const { run } = useLibraryRun("libraryRisks");
  const [name, setName] = useState(parade?.name ?? "");
  const [description, setDescription] = useState(parade?.description ?? "");
  const [pictogram, setPictogram] = useState<number | null>(parade?.pictogram ?? null);
  const [file, setFile] = useState<FileValue>(fileValue(parade?.file_path ?? null));
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const submit = () => {
    if (!name.trim()) { setError(true); return; }
    const fd = new FormData();
    fd.append("name", name);
    fd.append("description", description);
    fd.append("pictogram", pictogram ? String(pictogram) : "");
    appendFile(fd, "file", file);
    startTransition(async () => {
      const res = await run(() => saveParade(riskId, parade?.id ?? null, fd), parade ? undefined : t("created"));
      if (res.ok) await onSaved();
    });
  };
  return (
    <ModalShell onClose={onClose} size="sm" title={parade ? t("dialog.editTitle") : t("dialog.createTitle")}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </>}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="pr-risk">{t("dialog.risk")}</FieldLabel>
          <Input id="pr-risk" value={riskName} disabled />
        </Field>
        <Field data-invalid={error}>
          <FieldLabel htmlFor="pr-name">{t("dialog.name")} *</FieldLabel>
          <Input id="pr-name" value={name} maxLength={255} aria-invalid={error} onChange={(e) => { setName(e.target.value); setError(false); }} />
          {error && <FieldError>{tg("validators.required")}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="pr-picto">{t("dialog.pictogram")}</FieldLabel>
          <PictogramPicker id="pr-picto" value={pictogram} onChange={setPictogram} />
        </Field>
        <LibraryFileField id="pr-file" label={t("dialog.file")} kind="pdf" value={file} onChange={setFile} />
        <Field>
          <FieldLabel htmlFor="pr-desc">{t("dialog.description")}</FieldLabel>
          <Textarea id="pr-desc" value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </FieldGroup>
    </ModalShell>
  );
}

function RiskProperties({ id, close }: { id: string; close: () => void }) {
  const t = useTranslations("libraryRisks.properties");
  type P = { name: string; reference: string | null; source: string | null; created_at: string; updated_at: string;
    family: { short_name: string; long_name: string | null } | null; account: { name: string } | null; creator: PropertyAuthor; updater: PropertyAuthor };
  const [p, setP] = useState<P | null>(null);
  useEffect(() => {
    createClient().from("library_risks")
      .select(`name, reference, source, created_at, updated_at, family:label_families!library_risks_family_id_fkey(short_name, long_name), account:accounts(name),
        creator:collaborators!library_risks_created_by_fkey(first_name, last_name), updater:collaborators!library_risks_updated_by_fkey(first_name, last_name)`)
      .eq("id", id).single().then(({ data }) => setP(data as unknown as P));
  }, [id]);
  if (!p) return <ModalShell onClose={close} size="sm" title={t("title")}><Loading /></ModalShell>;
  return (
    <PropertiesDialog title={t("title")} onClose={close} createdAt={p.created_at} createdBy={p.creator} updatedAt={p.updated_at} updatedBy={p.updater}
      lines={[
        { label: t("applicability"), value: p.account?.name },
        { label: t("family"), value: p.family ? [p.family.short_name, p.family.long_name].filter(Boolean).join(" - ") : null },
        { label: t("name"), value: p.name },
        { label: t("reference"), value: p.reference },
        { label: t("source"), value: p.source },
      ]} />
  );
}
