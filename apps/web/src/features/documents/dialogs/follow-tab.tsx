"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  ArrowDownIcon, ArrowUpIcon, CircleCheckIcon, EllipsisIcon, EyeIcon, FilePenLineIcon, FileUpIcon, LockIcon, MailsIcon,
  MessageSquareReplyIcon, PlaneIcon, PrinterIcon, RefreshCwIcon, Trash2Icon, UsersIcon, WandIcon,
} from "lucide-react";
import { notify } from "@/components/common/notify";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { getSignedUrl, versionAction } from "../actions";
import { useDocError } from "../components/use-doc-error";
import { useWordingResolver, WordingBadge } from "../components/wording-badge";
import { enqueueDocumentGeneration } from "../generation";
import {
  FREE_STATE_KEYS, isExtern, stateKey, storagePath, visaKey, type DocumentNature, type VersionAction, type WordingFields,
} from "../meta";
import { isPasswordProtectedPdf, uploadDocumentFile } from "../upload/uploads-store";
import { validatePdf } from "./file-checks";

type Version = Tables<"document_versions">;
type Person = { id: string; first_name: string; last_name: string; trigram: string };

export type FollowDocument = {
  id: string; name: string; nature: DocumentNature; source: string; scope: string; origin: string; actions_disabled: boolean;
  project_id: string | null; linked_flow_id: string | null;
  family: { client_supervision: boolean; client_supervision_sub_index: boolean; wording_configuration_id: string | null } | null;
};
export type WordingFlags = { hide_bpa: boolean; hide_bpe_valid: boolean; hide_vso_sr: boolean };

type Popup =
  | { kind: "upload" | "editFile"; v: Version }
  | { kind: "diffuse" | "diffuseBpa" | "response" | "responseBpa" | "bpeValid" | "particularize" | "contributors" | "editDiffusion" | "editResponse"; v: Version; unlock?: boolean }
  | { kind: "confirm"; v: Version; action: VersionAction; title: string };

const ROLES = [
  ["redactor", "redactor_id", "redactor_date"], ["checker", "checker_id", "checker_date"], ["approver", "approver_id", "approver_date"],
  ["quality", "quality_supervisor_id", "quality_date"], ["safety", "safety_supervisor_id", "safety_date"],
] as const;

/** Onglet « Suivi » (spec 04 §4.5, §5.3) : lignes d'indice, actions normales et mode « Déverrouiller le suivi ». */
export function FollowTab({ doc, wording, flags, canEdit, canUnlock, canDelete }: {
  doc: FollowDocument; wording: WordingFields | null; flags: WordingFlags; canEdit: boolean; canUnlock: boolean; canDelete: boolean;
}) {
  const t = useTranslations("documents.follow");
  const tg = useTranslations("global");
  const format = useFormatter();
  const router = useRouter();
  const docError = useDocError();
  const resolve = useWordingResolver(wording);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [asc, setAsc] = useState(false);
  const [unlock, setUnlock] = useState(false);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [pending, start] = useTransition();

  const ext = isExtern(doc.nature);
  const clientSup = !!doc.family?.client_supervision;
  const blocked = doc.origin === "imported_from_library" || doc.actions_disabled;
  const editable = canEdit && !blocked;

  const load = useCallback(async () => {
    const { data } = await createClient().from("document_versions").select("*").eq("document_id", doc.id).order("seq");
    setVersions(data ?? []);
  }, [doc.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const supabase = createClient();
    const q = doc.project_id
      ? supabase.from("project_members").select("collaborator:collaborators(id, first_name, last_name, trigram)").eq("project_id", doc.project_id)
        .then(({ data }) => (data ?? []).map((r) => r.collaborator as Person | null).filter(Boolean) as Person[])
      : supabase.from("collaborators").select("id, first_name, last_name, trigram").eq("kind", "user").eq("status", "active").order("last_name")
        .then(({ data }) => (data ?? []) as Person[]);
    q.then(setPeople);
  }, [doc.project_id]);

  const run = (action: VersionAction, v: Version, payload: Record<string, unknown> = {}, success?: string, description?: string) =>
    new Promise<boolean>((resolveRun) => start(async () => {
      const res = await versionAction(v.id, action, payload);
      if (!res.ok) { notify.error(docError(res.error)); resolveRun(false); return; }
      if (res.data.taskId) notify.info(t("toast.generationStarted"), t("toast.generationHelp"));
      notify.success(success ?? t("toast.saved"), description);
      await load(); router.refresh(); resolveRun(true);
    }));

  const sorted = useMemo(() => (versions ? (asc ? versions : [...versions].reverse()) : []), [versions, asc]);
  const last = versions?.find((v) => v.is_last) ?? null;
  const person = (id: string | null) => people.find((p) => p.id === id);
  const trigrams = (v: Version) => {
    const parts = ROLES.map(([, k]) => person(v[k])?.trigram ?? "-");
    return parts.every((p) => p === "-") ? "-" : parts.join(" / ");
  };
  const date = (d: string | null) => (d ? format.dateTime(new Date(d), { dateStyle: "short" }) : "---");

  const preview = async (v: Version) => {
    if (v.pdf_path) {
      const res = await getSignedUrl(v.pdf_path);
      if (res.ok) window.open(res.data.url, "_blank", "noopener"); else notify.error(t("errors.no_pdf"));
      return;
    }
    if (ext) { notify.error(t("errors.no_pdf")); return; }
    const res = await enqueueDocumentGeneration(v.id, "preview");
    if (res.ok) notify.info(t("toast.generationStarted"), t("toast.generationHelp")); else notify.error(docError(res.error));
  };

  const iconBtn = (label: string, icon: React.ReactNode, onClick: () => void, className?: string) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} className={className} disabled={pending} onClick={onClick}>{icon}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );

  const bpoLabel = resolve("bpoAd").value;

  const normalActions = (v: Version) => {
    if (!v.is_last || !editable) return null;
    const s = v.step;
    const menu: { label: string; icon: React.ReactNode; onSelect: () => void }[] = [];
    if (s === "client_res" || s === "client_res_bpa") menu.push({ label: t("actions.cancelDiffusion"), icon: <PlaneIcon />, onSelect: () => setPopup({ kind: "confirm", v, action: "cancel_diffusion", title: t("confirm.cancelDiffusion") }) });
    if (s === "bpe" && v.state === "bpe" && !flags.hide_bpe_valid && doc.scope !== "library") menu.push({ label: t("actions.bpeValid"), icon: <CircleCheckIcon />, onSelect: () => setPopup({ kind: "bpeValid", v }) });
    if (s && ["bpe", "bpe_valid", "bpa", "bpa_refused"].includes(s) && v.state !== "temp" && !flags.hide_bpa) menu.push({ label: t("actions.addSubIndex"), icon: <FilePenLineIcon />, onSelect: () => void run("add_sub_index", v) });
    if (!ext && ((s === "diffusion" || s === "diffusion_bpa") || v.state === "prel")) menu.push({ label: t("actions.particularize"), icon: <WandIcon />, onSelect: () => setPopup({ kind: "particularize", v }) });
    if (["dsi", "multi_pr", "flow_form", "pr"].includes(doc.nature) && s && ["bpe", "bpe_valid", "bpa"].includes(s) && doc.origin !== "derived_from_standard")
      menu.push({ label: t("actions.withoutFieldData"), icon: <EyeIcon />, onSelect: () => void run("without_field_data", v) });
    if (!ext && (s === "diffusion" || s === "diffusion_bpa")) menu.push({ label: t("actions.contributors"), icon: <UsersIcon />, onSelect: () => setPopup({ kind: "contributors", v }) });
    return (
      <>
        {s === "upload_file" && iconBtn(t("actions.upload"), <FileUpIcon />, () => setPopup({ kind: "upload", v }), "text-primary")}
        {ext && (s === "diffusion" || s === "diffusion_bpa") && iconBtn(t("actions.editFile"), <FilePenLineIcon />, () => setPopup({ kind: "editFile", v }))}
        {(s === "client_res" || s === "client_res_bpa") && iconBtn(t("actions.clientResponse"), <MessageSquareReplyIcon />, () => setPopup({ kind: s === "client_res" ? "response" : "responseBpa", v }), "text-primary")}
        {s && ["bpe", "bpe_valid", "bpa", "bpa_refused"].includes(s) && iconBtn(t("actions.toBpo", { state: bpoLabel }), <LockIcon />,
          () => setPopup({ kind: "confirm", v, action: "to_bpo", title: t("confirm.toBpo", { state: bpoLabel }) }))}
        {s === "diffusion" && iconBtn(t("actions.diffuse"), <MailsIcon />, () => (ext ? void run("diffuse", v, {}, t("toast.diffused"), t("toast.diffusedHelp")) : setPopup({ kind: "diffuse", v })), "text-primary")}
        {s === "diffusion_bpa" && iconBtn(t("actions.diffuse"), <MailsIcon />, () => setPopup({ kind: "diffuseBpa", v }), "text-primary")}
        {menu.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t("actions.more")}><EllipsisIcon /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuGroup>
              {menu.map((m) => <DropdownMenuItem key={m.label} onSelect={m.onSelect}>{m.icon}{m.label}</DropdownMenuItem>)}
            </DropdownMenuGroup></DropdownMenuContent>
          </DropdownMenu>
        )}
      </>
    );
  };

  const unlockActions = (v: Version) => {
    const menu: { label: string; icon: React.ReactNode; onSelect: () => void }[] = [];
    if (v.is_last && !ext) menu.push({ label: t("actions.regenerate"), icon: <PrinterIcon />, onSelect: () => void run("regenerate", v, {}, t("toast.regenerated")) });
    if (!ext) menu.push({ label: t("actions.editContributors"), icon: <UsersIcon />, onSelect: () => setPopup({ kind: "contributors", v, unlock: true }) });
    if (!v.visa || !["vso", "vso_sr", "bpe_valid", "vso_bpa"].includes(v.visa)) menu.push({ label: t("actions.editDiffusion"), icon: <MailsIcon />, onSelect: () => setPopup({ kind: "editDiffusion", v }) });
    if (clientSup && v.visa && ["vso_sr", "vao", "vao_bpa"].includes(v.visa)) menu.push({ label: t("actions.editResponse"), icon: <MessageSquareReplyIcon />, onSelect: () => setPopup({ kind: "editResponse", v }) });
    if (v.is_last && !ext) {
      menu.push({ label: t("actions.refreshConfig"), icon: <RefreshCwIcon />, onSelect: () => void run("refresh_config", v, {}, t("toast.regenerated")) });
      menu.push({ label: t("actions.refreshLastIndex"), icon: <RefreshCwIcon />, onSelect: () => void run("refresh_last_index", v, {}, t("toast.regenerated")) });
    }
    if (ext) menu.push({ label: t("actions.editFile"), icon: <FilePenLineIcon />, onSelect: () => setPopup({ kind: "editFile", v }) });
    if (!menu.length) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t("actions.more")}><EllipsisIcon /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuGroup>
          {menu.map((m) => <DropdownMenuItem key={m.label} onSelect={m.onSelect}>{m.icon}{m.label}</DropdownMenuItem>)}
        </DropdownMenuGroup></DropdownMenuContent>
      </DropdownMenu>
    );
  };

  if (!versions) return <div className="flex justify-center py-16"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <label className={cn("flex items-center gap-2 text-sm", (!canUnlock || blocked) && "opacity-50")}>
              <Checkbox checked={unlock} disabled={!canUnlock || blocked} onCheckedChange={(v) => setUnlock(!!v)} />{t("unlock")}
            </label>
          </TooltipTrigger>
          {blocked && <TooltipContent>{t("unlockDisabled")}</TooltipContent>}
        </Tooltip>
        {unlock && last && (
          <div className="ml-auto flex flex-wrap gap-1">
            <Button size="sm" variant="secondary" title={t("actions.newNextHelp")} disabled={pending} onClick={() => void run("new_index_next", last)}>{t("actions.newNext")}</Button>
            <Button size="sm" variant="secondary" title={t("actions.newSubHelp")} disabled={pending} onClick={() => void run("new_sub_index", last)}>{t("actions.newSub")}</Button>
            <Button size="sm" variant="secondary" title={t("actions.newSameHelp")} disabled={pending} onClick={() => void run("new_index_same", last)}>{t("actions.newSame")}</Button>
            {canDelete && (
              <Button size="sm" variant="secondary" title={t("actions.deleteLastHelp")} disabled={pending || versions.length <= 1}
                onClick={() => setPopup({ kind: "confirm", v: last, action: "delete_last", title: t("confirm.deleteLast") })}>
                <Trash2Icon data-icon="inline-start" />{t("actions.deleteLast")}
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button type="button" className="flex items-center gap-1" onClick={() => setAsc((a) => !a)} aria-label={asc ? t("sortDesc") : t("sortAsc")}>
                  {t("columns.index")}{asc ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
                </button>
              </TableHead>
              <TableHead>{t("columns.contributors")}</TableHead>
              <TableHead>{t("columns.date")}</TableHead>
              {clientSup && <TableHead>{t("columns.response")}</TableHead>}
              {clientSup && <TableHead>{t("columns.reference")}</TableHead>}
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead>{t("columns.return")}</TableHead>
              <TableHead className="text-right">{t("columns.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((v) => {
              const vk = visaKey(v.visa);
              return (
                <TableRow key={v.id} className={cn(!v.is_last && "text-muted-foreground")}>
                  <TableCell>
                    <span title={v.diffusion_comment ?? undefined} className="font-medium">{t("indexLabel", { docIndex: v.index_label, state: resolve(stateKey(v)).value })}</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{ext ? "-" : trigrams(v)}</TableCell>
                  <TableCell>{date(v.diffusion_date)}</TableCell>
                  {clientSup && <TableCell>{date(v.response_date)}</TableCell>}
                  {clientSup && <TableCell>{v.response_ref ?? "---"}</TableCell>}
                  <TableCell><WordingBadge fields={wording} wkey={stateKey(v)} /></TableCell>
                  <TableCell>
                    {vk ? <WordingBadge fields={wording} wkey={vk} />
                      : v.visa === "diffusion" ? t("visaDiffusion") : v.visa === "diffusion_bpa" ? t("visaDiffusionBpa") : "---"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      {!unlock && normalActions(v)}
                      {unlock && unlockActions(v)}
                      {(v.pdf_path || (!ext && v.is_last)) && iconBtn(t("actions.preview"), <EyeIcon />, () => void preview(v))}
                      {v.response_file_path && iconBtn(t("popover.document"), <MessageSquareReplyIcon />, () => void openPath(v.response_file_path!))}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {popup?.kind === "confirm" && (
        <ConfirmDialog open onOpenChange={(o) => { if (!o) setPopup(null); }} title={popup.title}
          destructive={popup.action === "delete_last"} confirmLabel={tg("actions.confirm")}
          onConfirm={async () => {
            const ok = await run(popup.action, popup.v, {}, popup.action === "cancel_diffusion" ? t("toast.cancelled") : popup.action === "to_bpo" ? t("toast.toBpo") : undefined);
            if (ok) setPopup(null);
          }} />
      )}
      {popup && popup.kind !== "confirm" && (
        <ActionDialog popup={popup} doc={doc} people={people} wording={wording} flags={flags} onClose={() => setPopup(null)} pending={pending}
          onUpload={async (file) => {
            const v = popup.v;
            setPopup(null);
            notify.info(t("toast.uploadStarted"));
            try {
              const path = await uploadDocumentFile(file, storagePath(doc, v.id, file.name), { context: doc.name, documentId: doc.id });
              await run(popup.kind === "upload" ? "attach_file" : (v.step && ["upload_file", "diffusion", "diffusion_bpa"].includes(v.step) && v.is_last ? "attach_file" : "edit_file"),
                v, { path, name: file.name, size: file.size }, t("toast.fileAdded"));
            } catch (e) {
              notify.error((e as Error).message === "too_large" ? t("errors.too_large_local") : t("errors.upload_failed"));
            }
          }}
          onSubmit={async (action, payload, success, description) => { if (await run(action, popup.v, payload, success, description)) setPopup(null); }} />
      )}
    </div>
  );
}

async function openPath(path: string) {
  const res = await getSignedUrl(path);
  if (res.ok) window.open(res.data.url, "_blank", "noopener");
}

/** Popovers d'action (diffusion, retour client, BPE*, BPA, contributeurs, particularisation, fichier). */
function ActionDialog({ popup, doc, people, wording, flags, pending, onClose, onSubmit, onUpload }: {
  popup: Exclude<Popup, { kind: "confirm" }>; doc: FollowDocument; people: Person[]; wording: WordingFields | null; flags: WordingFlags;
  pending: boolean; onClose: () => void;
  onSubmit: (action: VersionAction, payload: Record<string, unknown>, success?: string, description?: string) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
}) {
  const t = useTranslations("documents.follow");
  const tg = useTranslations("global");
  const resolve = useWordingResolver(wording);
  const v = popup.v;
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState((popup.kind === "editDiffusion" ? v.diffusion_date : popup.kind === "editResponse" ? v.response_date : null)?.slice(0, 10) ?? today);
  const [comment, setComment] = useState(popup.kind === "editDiffusion" ? v.diffusion_comment ?? "" : popup.kind === "editResponse" ? v.response_comment ?? "" : "");
  const [userId, setUserId] = useState("");
  const [label, setLabel] = useState(v.response_label ?? "");
  const [ref, setRef] = useState(v.response_ref ?? "");
  const [responseFile, setResponseFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [keepResponse, setKeepResponse] = useState(!!v.response_file_path);
  const [keepCover, setKeepCover] = useState(!!v.client_cover_page_path);
  const [stateKeyValue, setStateKeyValue] = useState<string>(stateKey(v));
  const [file, setFile] = useState<File | null>(null);
  const [complement, setComplement] = useState({ complement_ref_int: v.complement_ref_int ?? "", complement_ref_ext: v.complement_ref_ext ?? "" });
  const [contrib, setContrib] = useState<Record<string, string>>(() => Object.fromEntries(ROLES.flatMap(([, id, d]) => [[id, (v[id] as string | null) ?? ""], [d, (v[d] as string | null) ?? ""]])));
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmEdit, setConfirmEdit] = useState(false);
  const isoDate = (d: string) => (d ? new Date(`${d}T12:00:00`).toISOString() : "");

  const checkFile = async (f: File | null, setter: (f: File | null) => void) => {
    setFileError(null);
    if (!f) { setter(null); return; }
    const err = validatePdf(f) ?? ((await isPasswordProtectedPdf(f)) ? "password" : null);
    if (err) { setFileError(t(`errors.${err}` as never)); setter(null); return; }
    setter(f);
  };

  const uploadAttachment = async (f: File | null, keep: boolean, current: string | null) => {
    if (f) return uploadDocumentFile(f, storagePath(doc, v.id, f.name), { context: doc.name, documentId: doc.id });
    return keep ? current : null;
  };

  const submitResponse = async (visa: string | null) => {
    if (!date) return;
    setUploading(true);
    try {
      const response_file_path = await uploadAttachment(responseFile, keepResponse, v.response_file_path);
      const cover_page_path = await uploadAttachment(coverFile, keepCover, v.client_cover_page_path);
      const payload = { visa, date: isoDate(date), label, ref, comment, response_file_path, cover_page_path };
      if (popup.kind === "editResponse") await onSubmit("edit_response", payload, t("toast.responseEdited"));
      else await onSubmit(popup.kind === "response" ? "client_response" : "client_response_bpa", payload,
        visa === "vso_sr" ? t("toast.response") : t("toast.response"), visa === "vso_sr" ? t("toast.vsoSr") : undefined);
    } catch {
      notify.error(t("errors.upload_failed"));
    } finally { setUploading(false); }
  };

  const fillFromFlow = async () => {
    if (!doc.linked_flow_id) return;
    const { data } = await createClient().from("blocks").select("redactor_id, verifier_id, approver_id").eq("flow_id", doc.linked_flow_id);
    const first = (k: "redactor_id" | "verifier_id" | "approver_id") => data?.find((b) => b[k])?.[k] ?? "";
    setContrib((c) => ({ ...c, redactor_id: first("redactor_id") || c.redactor_id, checker_id: first("verifier_id") || c.checker_id, approver_id: first("approver_id") || c.approver_id }));
    notify.success(t("popover.fromFlowDone"));
  };

  const personSelect = (value: string, onChange: (v: string) => void, id: string) => (
    <Select value={value || "none"} onValueChange={(x) => onChange(x === "none" ? "" : x)}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>
        <SelectItem value="none">{tg("none")}</SelectItem>
        {people.map((p) => <SelectItem key={p.id} value={p.id}>{`${p.trigram} - ${p.first_name} ${p.last_name}`}</SelectItem>)}
      </SelectGroup></SelectContent>
    </Select>
  );
  const fileInput = (id: string, onFile: (f: File | null) => void) => (
    <Input id={id} type="file" accept="application/pdf,.pdf" onChange={(e) => void checkFile(e.target.files?.[0] ?? null, onFile)} />
  );

  const titles: Record<string, string> = {
    upload: t("actions.upload"), editFile: t("actions.editFile"), diffuse: t("popover.diffusionTitle"), diffuseBpa: t("popover.bpaTitle"),
    response: t("popover.responseTitle"), responseBpa: t("popover.responseTitle"), bpeValid: t("popover.bpeValidTitle"),
    particularize: t("popover.particularizeTitle"), contributors: popup.kind === "contributors" && popup.unlock ? t("actions.editContributors") : t("actions.contributors"),
    editDiffusion: t("popover.editDiffusionTitle"), editResponse: t("popover.editResponseTitle"),
  };

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;
  const busy = pending || uploading;
  const cancel = <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>;
  const saveBtn = (fn: () => void, disabled = false) => (
    <Button onClick={fn} disabled={busy || disabled}>{busy && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
  );

  switch (popup.kind) {
    case "upload": case "editFile":
      body = (
        <Field data-invalid={!!fileError}>
          <FieldLabel htmlFor="fu-file">{t("popover.file")}</FieldLabel>
          {fileInput("fu-file", setFile)}
          {v.pdf_name && <FieldDescription>{v.pdf_name}</FieldDescription>}
          {fileError && <FieldDescription className="text-destructive">{fileError}</FieldDescription>}
        </Field>
      );
      footer = <>{cancel}{saveBtn(() => file && void onUpload(file), !file)}</>;
      break;
    case "diffuse": case "diffuseBpa": case "bpeValid": case "editDiffusion":
      body = (
        <FieldGroup>
          {(popup.kind === "diffuseBpa" || popup.kind === "bpeValid") && (
            <Field><FieldLabel htmlFor="ad-user">{t("popover.collaborator")} *</FieldLabel>{personSelect(userId, setUserId, "ad-user")}</Field>
          )}
          {popup.kind === "editDiffusion" && (
            <Field>
              <FieldLabel>{t("popover.state")} *</FieldLabel>
              <Select value={stateKeyValue} onValueChange={setStateKeyValue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {FREE_STATE_KEYS.map((k) => <SelectItem key={k} value={k}>{resolve(k).value} — {resolve(k).tooltip}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
          )}
          <Field><FieldLabel htmlFor="ad-date">{t("popover.date")}{popup.kind !== "bpeValid" && " *"}</FieldLabel>
            <Input id="ad-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="ad-comment">{t("popover.comment")}</FieldLabel>
            <Textarea id="ad-comment" maxLength={255} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
        </FieldGroup>
      );
      footer = <>{cancel}{saveBtn(() => {
        const payload = { date: isoDate(date), comment, user_id: userId || null, key: stateKeyValue };
        if (popup.kind === "diffuse") void onSubmit("diffuse", payload, t("toast.diffused"), t("toast.diffusedHelp"));
        else if (popup.kind === "diffuseBpa") void onSubmit("diffuse_bpa", payload, t("toast.diffused"), t("toast.diffusedHelp"));
        else if (popup.kind === "bpeValid") void onSubmit("bpe_valid", payload);
        else void onSubmit("edit_diffusion", payload);
      }, (popup.kind !== "bpeValid" && !date) || ((popup.kind === "diffuseBpa" || popup.kind === "bpeValid") && !userId))}</>;
      break;
    case "response": case "responseBpa": case "editResponse":
      body = (
        <FieldGroup>
          <Field><FieldLabel htmlFor="cr-date">{t("popover.responseDate")} *</FieldLabel><Input id="cr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field><FieldLabel htmlFor="cr-label">{t("popover.organism")}</FieldLabel><Input id="cr-label" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
            <Field><FieldLabel htmlFor="cr-ref">{t("popover.reference")}</FieldLabel><Input id="cr-ref" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          </div>
          <Field><FieldLabel htmlFor="cr-comment">{t("popover.comment")}</FieldLabel><Textarea id="cr-comment" maxLength={255} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
          <Field>
            <FieldLabel htmlFor="cr-doc">{t("popover.document")}</FieldLabel>
            {keepResponse && v.response_file_path
              ? <div className="flex items-center gap-2 text-sm"><span className="truncate">{v.response_file_path.split("/").pop()}</span><Button size="sm" variant="ghost" onClick={() => setKeepResponse(false)}>{t("popover.removeFile")}</Button></div>
              : fileInput("cr-doc", setResponseFile)}
          </Field>
          <Field>
            <FieldLabel htmlFor="cr-cover">{t("popover.coverPage")}</FieldLabel>
            {keepCover && v.client_cover_page_path
              ? <div className="flex items-center gap-2 text-sm"><span className="truncate">{v.client_cover_page_path.split("/").pop()}</span><Button size="sm" variant="ghost" onClick={() => setKeepCover(false)}>{t("popover.removeFile")}</Button></div>
              : fileInput("cr-cover", setCoverFile)}
          </Field>
          {fileError && <p className="text-sm text-destructive">{fileError}</p>}
        </FieldGroup>
      );
      if (popup.kind === "editResponse") footer = <>{cancel}{saveBtn(() => setConfirmEdit(true), !date)}</>;
      else {
        const btn = (visa: string, key: "vao" | "vsoSr" | "vso" | "bpaKo" | "bpaOk") => {
          const w = resolve(key);
          return (
            <Button key={visa} disabled={busy || !date} onClick={() => void submitResponse(visa)} title={w.tooltip}
              style={{ backgroundColor: w.color, color: "white" }}>{w.value}</Button>
          );
        };
        footer = <>{cancel}{popup.kind === "response"
          ? [btn("vao", "vao"), ...(flags.hide_vso_sr ? [] : [btn("vso_sr", "vsoSr")]), btn("vso", "vso")]
          : [btn("vao_bpa", "bpaKo"), btn("vso_bpa", "bpaOk")]}</>;
      }
      break;
    case "particularize":
      body = (
        <FieldGroup>
          <Field><FieldLabel htmlFor="pa-int">{t("popover.complementRefInt")}</FieldLabel>
            <Input id="pa-int" value={complement.complement_ref_int} onChange={(e) => setComplement((c) => ({ ...c, complement_ref_int: e.target.value }))} /></Field>
          <Field><FieldLabel htmlFor="pa-ext">{t("popover.complementRefExt")}</FieldLabel>
            <Input id="pa-ext" value={complement.complement_ref_ext} onChange={(e) => setComplement((c) => ({ ...c, complement_ref_ext: e.target.value }))} /></Field>
        </FieldGroup>
      );
      footer = <>{cancel}{saveBtn(() => void onSubmit("particularize", complement, t("toast.regenerated")))}</>;
      break;
    case "contributors":
      body = (
        <FieldGroup>
          {ROLES.map(([role, id, d]) => (
            <div key={role} className="grid grid-cols-[1fr_10rem] gap-3">
              <Field><FieldLabel htmlFor={`co-${role}`}>{t(`popover.${role}`)}</FieldLabel>{personSelect(contrib[id], (x) => setContrib((c) => ({ ...c, [id]: x })), `co-${role}`)}</Field>
              <Field><FieldLabel htmlFor={`cod-${role}`}>{t("popover.date")}</FieldLabel>
                <Input id={`cod-${role}`} type="date" value={contrib[d]} onChange={(e) => setContrib((c) => ({ ...c, [d]: e.target.value }))} /></Field>
            </div>
          ))}
        </FieldGroup>
      );
      footer = <>
        {doc.linked_flow_id && <Button variant="ghost" className="mr-auto" onClick={() => void fillFromFlow()}>{t("popover.fromFlow")}</Button>}
        {cancel}{saveBtn(() => void onSubmit("set_contributors", { ...contrib, unlock: !!popup.unlock }))}
      </>;
      break;
  }

  return (
    <>
      <ModalShell onClose={onClose} size="sm" title={titles[popup.kind]} subtitle={`${doc.name} · ${v.index_label}`} footer={footer}>
        {body}
      </ModalShell>
      <ConfirmDialog open={confirmEdit} onOpenChange={setConfirmEdit} destructive={false} title={t("confirm.editResponse")}
        confirmLabel={tg("actions.confirm")} onConfirm={() => submitResponse(null)} />
    </>
  );
}
