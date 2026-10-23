"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ExternalLinkIcon, FileIcon, InfoIcon, UploadIcon, XIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { FamilySelect } from "@/features/settings/components/family-select";
import type { ActionResult } from "@/lib/actions";
import type { Enums } from "@/lib/supabase/database.types";
import { getLibraryFileUrl, getLibraryRights } from "./actions";

/** Fichier d'une modale : chemin existant, nouveau fichier choisi, ou retrait demandé. */
export type FileValue = { path: string | null; file: File | null; removed: boolean };
export const fileValue = (path: string | null): FileValue => ({ path, file: null, removed: false });
export const fileDirty = (v: FileValue) => !!v.file || v.removed;
/** Ajoute le fichier au FormData : File (nouveau), "" (retiré), rien (inchangé). */
export function appendFile(fd: FormData, key: string, v: FileValue) {
  if (v.file) fd.append(key, v.file);
  else if (v.removed) fd.append(key, "");
}

const displayName = (path: string) => path.split("/").pop()?.replace(/^[0-9a-f-]{36}-/, "") ?? path;

export async function openLibraryFile(path: string, onError: () => void) {
  const res = await getLibraryFileUrl(path);
  if (res.ok) window.open(res.data, "_blank", "noopener");
  else onError();
}

/** Champ fichier (PDF ou image) stocké dans le bucket « library ». */
export function LibraryFileField({ id, label, tooltip, value, onChange, kind, disabled }: {
  id: string; label: string; tooltip?: string; value: FileValue; onChange: (v: FileValue) => void; kind: "pdf" | "image"; disabled?: boolean;
}) {
  const t = useTranslations("libraryShared.file");
  const tg = useTranslations("global");
  const input = useRef<HTMLInputElement>(null);
  const current = value.file ? value.file.name : !value.removed && value.path ? displayName(value.path) : null;
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (kind === "pdf" && f.type !== "application/pdf") { notify.error(t("pdfOnly")); return; }
    if (kind === "image" && !f.type.startsWith("image/")) { notify.error(t("imageOnly")); return; }
    if (f.size > 20 * 1024 * 1024) { notify.error(t("tooLarge", { max: 20 })); return; }
    onChange({ ...value, file: f, removed: false });
  };
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex min-h-9 items-center gap-2 rounded-md border px-2 py-1">
        <FileIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm">{current ?? <span className="text-muted-foreground">{t("none")}</span>}</span>
        {!value.file && !value.removed && value.path && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("view")}
            onClick={() => openLibraryFile(value.path!, () => notify.error(tg("toast.error")))}><ExternalLinkIcon /></Button>
        )}
        {!disabled && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
              <UploadIcon data-icon="inline-start" />{current ? t("replace") : t("choose")}
            </Button>
            {current && <Button type="button" variant="ghost" size="icon-sm" aria-label={t("remove")}
              onClick={() => onChange({ ...value, file: null, removed: !!value.path })}><XIcon /></Button>}
          </>
        )}
        <input ref={input} id={id} type="file" hidden accept={kind === "pdf" ? "application/pdf" : "image/*"}
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {tooltip && <FieldDescription>{tooltip}</FieldDescription>}
    </Field>
  );
}

/** Sélecteur d'applicabilité (comptes accessibles). */
export function AccountSelect({ id, accounts, value, onChange, disabled }: {
  id: string; accounts: { id: string; name: string }[]; value: string | null; onChange: (v: string) => void; disabled?: boolean;
}) {
  const tg = useTranslations("global");
  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled || accounts.length <= 1}>
      <SelectTrigger id={id}><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
      <SelectContent><SelectGroup>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  );
}

export function LibraryFamilySelect(props: {
  nature: Enums<"label_family_nature">; value: string | null; onChange: (id: string) => void; disabled?: boolean; invalid?: boolean;
}) {
  return <FamilySelect relative="child" {...props} />;
}

/** Exécute une server action : toast de succès / d'erreur traduite (namespace du module puis communs). */
export function useLibraryRun(namespace: string) {
  const t = useTranslations(namespace);
  const ts = useTranslations("libraryShared.errors");
  const tg = useTranslations("global");
  const router = useRouter();
  const message = useCallback((code: string) => {
    if (code === "forbidden") return tg("toast.forbidden");
    if (t.has(`errors.${code}`)) return t(`errors.${code}` as never);
    if (ts.has(code)) return ts(code as never);
    return tg("toast.error");
  }, [t, ts, tg]);
  const run = useCallback(async <T,>(fn: () => Promise<ActionResult<T>>, success?: string | false): Promise<ActionResult<T>> => {
    let res: ActionResult<T>;
    try { res = await fn(); } catch { res = { ok: false, error: "unknown" }; }
    if (res.ok) {
      if (success !== false) notify.success(success ?? tg("toast.saved"));
      router.refresh();
    } else {
      const sub = t.has(`errors.${res.error}Subtitle`) ? t(`errors.${res.error}Subtitle` as never) : undefined;
      notify.error(message(res.error), sub);
    }
    return res;
  }, [message, router, t, tg]);
  return { run, message };
}

export type PropertyAuthor = { first_name: string; last_name: string } | null;

/** Modale « Propriétés de … » : lignes informatives + création / modification. */
export function PropertiesDialog({ title, lines, createdAt, createdBy, updatedAt, updatedBy, onClose }: {
  title: string; lines: { label: string; value: ReactNode }[]; createdAt: string; createdBy: PropertyAuthor;
  updatedAt: string; updatedBy: PropertyAuthor; onClose: () => void;
}) {
  const t = useTranslations("libraryShared.properties");
  const format = useFormatter();
  const who = (a: PropertyAuthor) => (a ? `${a.first_name} ${a.last_name}` : t("unknownUser"));
  const date = (d: string) => format.dateTime(new Date(d), { dateStyle: "short", timeStyle: "short" });
  return (
    <ModalShell onClose={onClose} size="sm" icon={<InfoIcon className="mt-1 size-5 text-primary" />} title={title}>
      <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
        {lines.map((l) => (
          <div key={l.label} className="contents"><dt className="font-medium">{l.label}</dt><dd className="min-w-0 break-words">{l.value ?? "—"}</dd></div>
        ))}
      </dl>
      <div className="mt-4 flex flex-col gap-1 border-t pt-3 text-sm text-muted-foreground">
        <span>{t("createdOn", { date: date(createdAt), name: who(createdBy) })}</span>
        <span>{t("updatedOn", { date: date(updatedAt), name: who(updatedBy) })}</span>
      </div>
    </ModalShell>
  );
}

/** Barre « Réorganiser » : changer la famille des éléments sélectionnés. */
export function ReorganizeBar({ families, count, onApply }: {
  families: { id: string; label: string }[]; count: number; onApply: (familyId: string) => Promise<boolean>;
}) {
  const t = useTranslations("libraryShared.reorganize");
  const tg = useTranslations("global");
  const [family, setFamily] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (!count) return null;
  const name = families.find((f) => f.id === family)?.label ?? "";
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
      <span>{t("footerChange")}</span>
      <Select value={family ?? undefined} onValueChange={setFamily}>
        <SelectTrigger className="w-64" aria-label={t("footerChange")}><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
        <SelectContent><SelectGroup>{families.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
      <span className="text-muted-foreground">{t("footerTotal", { count })}</span>
      <Button size="sm" disabled={!family} onClick={() => setConfirm(true)}>{t("button")}</Button>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} destructive={false} title={t("confirm", { name, count })}
        confirmLabel={t("button")} onConfirm={async () => { if (family && await onApply(family)) setFamily(null); }} />
    </div>
  );
}

/** Modale d'import Excel : trame à télécharger + fichier. */
export function ImportExcelDialog({ title, templateHref, onImport, onClose }: {
  title: string; templateHref: string; onImport: (fd: FormData) => Promise<boolean>; onClose: () => void;
}) {
  const t = useTranslations("libraryShared.import");
  const tg = useTranslations("global");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <ModalShell onClose={onClose} size="sm" icon={<UploadIcon className="mt-1 size-5 text-primary" />} title={title}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
        <Button disabled={!file || busy} onClick={async () => {
          if (!file) return;
          if (!file.name.toLowerCase().endsWith(".xlsx")) { notify.error(t("invalidType")); return; }
          setBusy(true);
          const fd = new FormData();
          fd.append("file", file);
          const done = await onImport(fd);
          setBusy(false);
          if (done) onClose();
        }}>{busy && <Spinner data-icon="inline-start" />}{busy ? t("processing") : t("run")}</Button>
      </>}>
      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel>{t("template")}</FieldLabel>
          <Button asChild variant="outline" className="self-start"><a href={templateHref} download>{t("template")}</a></Button>
          <FieldDescription>{t("templateHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="lib-import-file">{t("file")}</FieldLabel>
          <input id="lib-import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
      </div>
    </ModalShell>
  );
}

/** Toast de fin d'import (nombre importé + lignes ignorées). */
export function useImportNotifier() {
  const t = useTranslations("libraryShared.import");
  return useCallback((data: { count: number; skipped: number[] }) => {
    notify.success(t("success", { count: data.count }), data.skipped.length ? t("rowErrors", { rows: data.skipped.join(", ") }) : undefined);
  }, [t]);
}

/** Droit d'édition de l'écran (null tant que non chargé). */
export function useLibraryRights(routeId: Parameters<typeof getLibraryRights>[0]) {
  const [rights, setRights] = useState<Awaited<ReturnType<typeof getLibraryRights>> | null>(null);
  useEffect(() => { void getLibraryRights(routeId).then(setRights); }, [routeId]);
  return rights;
}

export function Loading() {
  return <div className="flex justify-center py-16"><Spinner /></div>;
}
