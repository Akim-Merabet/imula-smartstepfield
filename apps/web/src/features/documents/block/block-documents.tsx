"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { EyeIcon, FileTextIcon, LinkIcon, LockIcon, PaperclipIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrl } from "../actions";
import { useWordingResolver, WordingBadge } from "../components/wording-badge";
import { stateKey, type DocumentNature, type DocumentState, type DocumentStep, type WordingFields } from "../meta";
import { validatePdf } from "../dialogs/file-checks";
import { uploadDocumentFile } from "../upload/uploads-store";
import { addBlockAttachment, linkBlockDocument, setBlockDocumentVersion, unlinkBlockDocument } from "./actions";

type Version = { id: string; index_label: string; state: DocumentState; step: DocumentStep | null; seq: number; is_last: boolean; pdf_path: string | null; diffusion_date: string | null };
type Doc = {
  id: string; name: string; ref_int: string | null; nature: DocumentNature; source: string; category_id: string | null;
  family: { id: string; short_name: string; long_name: string | null; color: string; wording_configuration_id: string | null } | null;
  versions: Version[]; files: { storage_path: string }[];
};
type Link = {
  id: string; document_id: string | null; pinned_version_id: string | null; frozen_version_id: string | null;
  is_attachment: boolean; attachment_path: string | null; attachment_name: string | null; position: number; document: Doc | null;
};

const DOC_SELECT = `id, name, ref_int, nature, source, category_id,
  family:label_families!documents_family_id_fkey(id, short_name, long_name, color, wording_configuration_id),
  versions:document_versions(id, index_label, state, step, seq, is_last, pdf_path, diffusion_date), files:document_files(storage_path)`;

const hasFile = (d: Doc, v: Version) => !!v.pdf_path || (d.source !== "extern" && !!v.diffusion_date);

/**
 * Section « Document(s) lié(s) » des blocs PR, TXT, DSI et MULTI_PR (spec 02 §5.11, spec 04 §4.9) :
 * lien vers un document de l'entité avec choix d'indice, pièce jointe hors base, visualisation, retrait.
 * Les indices des documents avec version liés au bloc Contrôles sont figés à chaque signature (trigger SQL).
 */
export function BlockDocuments({ block, flowId, projectId, canEdit }: {
  block: { id: string; type: "pr" | "txt" | "dsi" | "multi_pr" }; flowId: string; projectId: string; canEdit: boolean;
}) {
  const t = useTranslations("documents.block");
  const td = useTranslations("documents");
  const tg = useTranslations("global");
  const locale = useLocale();
  const [links, setLinks] = useState<Link[] | null>(null);
  const [wordings, setWordings] = useState<Record<string, WordingFields>>({});
  const [linking, setLinking] = useState(false);
  const [toRemove, setToRemove] = useState<Link | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  void flowId; // contrat : identifiant du flow porteur (revalidation côté serveur via le bloc)

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("block_documents")
      .select(`id, document_id, pinned_version_id, frozen_version_id, is_attachment, attachment_path, attachment_name, position, document:documents(${DOC_SELECT})`)
      .eq("block_id", block.id).order("position");
    const list = (data ?? []) as unknown as Link[];
    setLinks(list);
    const ids = [...new Set(list.map((l) => l.document?.family?.wording_configuration_id).filter(Boolean) as string[])];
    if (ids.length) {
      const { data: langs } = await supabase.from("wording_configuration_languages").select("wording_configuration_id, language, fields").in("wording_configuration_id", ids);
      const map: Record<string, WordingFields> = {};
      for (const id of ids) {
        const rows = (langs ?? []).filter((r) => r.wording_configuration_id === id);
        map[id] = ((rows.find((r) => r.language === locale) ?? rows[0])?.fields ?? {}) as WordingFields;
      }
      setWordings(map);
    }
  }, [block.id, locale]);
  useEffect(() => { void load(); }, [load]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => start(async () => {
    const res = await fn();
    if (!res.ok) { notify.error(res.error === "duplicate_index" ? t("duplicateIndex") : res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error")); return; }
    notify.success(success); await load();
  });

  const view = async (path: string | null) => {
    if (!path) { notify.error(td("follow.errors.no_pdf")); return; }
    const res = await getSignedUrl(path);
    if (res.ok) window.open(res.data.url, "_blank", "noopener"); else notify.error(td("follow.errors.no_pdf"));
  };

  const attach = async (file: File | undefined) => {
    if (!file) return;
    const err = validatePdf(file);
    if (err) { notify.error(td(`follow.errors.${err}`)); return; }
    setUploading(true);
    try {
      const safe = file.name.normalize("NFD").replace(/[^\w.-]+/g, "_");
      const path = await uploadDocumentFile(file, `projects/${projectId}/attachments/${block.id}/${Date.now().toString(36)}-${safe}`, { context: null, documentId: null });
      run(() => addBlockAttachment(block.id, path, file.name), t("attached"));
    } catch (e) {
      notify.error((e as Error).message === "too_large" ? td("follow.errors.too_large_local") : td("follow.errors.upload_failed"));
    } finally { setUploading(false); }
  };

  return (
    <section className="rounded-md border">
      <div className="flex items-center gap-2 border-b px-4 py-2 text-sm font-medium">
        <FileTextIcon className="size-4" /><span className="flex-1">{t(`title.${block.type}`)}</span>
        {canEdit && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setLinking(true)}><LinkIcon data-icon="inline-start" />{t("link")}</Button>
            <Button size="sm" variant="secondary" asChild disabled={uploading}>
              <label className="cursor-pointer">
                {uploading ? <Spinner data-icon="inline-start" /> : <PaperclipIcon data-icon="inline-start" />}{t("attach")}
                <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </Button>
          </>
        )}
      </div>
      {!links ? <div className="flex justify-center py-6"><Spinner /></div> : links.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>{td("columns.family")}</TableHead><TableHead>{td("columns.name")}</TableHead><TableHead>{td("columns.refInt")}</TableHead>
            <TableHead>{td("columns.index")}</TableHead><TableHead>{td("columns.blockIndex")}</TableHead><TableHead>{td("columns.status")}</TableHead>
            <TableHead className="text-right">{td("columns.actions")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {links.map((l) => l.is_attachment || !l.document ? (
              <TableRow key={l.id}>
                <TableCell>—</TableCell>
                <TableCell><span className="flex items-center gap-2"><PaperclipIcon className="size-3.5" />{l.attachment_name ?? t("attachment")}</span></TableCell>
                <TableCell>—</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>{t("attachment")}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={t("view")} onClick={() => void view(l.attachment_path)}><EyeIcon /></Button>
                    {canEdit && <Button variant="ghost" size="icon-sm" aria-label={tg("actions.delete")} onClick={() => setToRemove(l)}><Trash2Icon /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <LinkRow key={l.id} link={l} doc={l.document} wording={l.document.family?.wording_configuration_id ? wordings[l.document.family.wording_configuration_id] : null}
                canEdit={canEdit} pending={pending} onView={view} onRemove={() => setToRemove(l)}
                onVersion={(v) => run(() => setBlockDocumentVersion(l.id, v), tg("toast.saved"))} />
            ))}
          </TableBody>
        </Table>
      )}
      {linking && (
        <LinkDialog projectId={projectId} excluded={(links ?? []).filter((l) => !l.pinned_version_id && l.document_id).map((l) => l.document_id!)}
          onClose={() => setLinking(false)}
          onLink={(docId) => { setLinking(false); run(() => linkBlockDocument(block.id, docId, null), t("linked")); }} />
      )}
      <ConfirmDialog open={!!toRemove} onOpenChange={(o) => { if (!o) setToRemove(null); }} title={t("unlinkConfirm")} confirmLabel={tg("actions.delete")}
        onConfirm={() => { if (toRemove) run(() => unlinkBlockDocument(toRemove.id), t("unlinked")); }} />
    </section>
  );
}

function LinkRow({ link, doc, wording, canEdit, pending, onView, onRemove, onVersion }: {
  link: Link; doc: Doc; wording: WordingFields | null; canEdit: boolean; pending: boolean;
  onView: (path: string | null) => void; onRemove: () => void; onVersion: (versionId: string | null) => void;
}) {
  const t = useTranslations("documents.block");
  const td = useTranslations("documents");
  const tg = useTranslations("global");
  const resolve = useWordingResolver(wording);
  const versions = [...doc.versions].sort((a, b) => b.seq - a.seq);
  const last = versions[0];
  const frozen = versions.find((v) => v.id === link.frozen_version_id) ?? null;
  const pinned = versions.find((v) => v.id === link.pinned_version_id) ?? null;
  const effective = frozen ?? pinned ?? versions.find((v) => hasFile(doc, v)) ?? last;
  const versioned = doc.nature !== "pdf_unversioned";
  const path = doc.nature === "pdf_unversioned" ? doc.files[0]?.storage_path ?? null : effective?.pdf_path ?? null;

  return (
    <TableRow>
      <TableCell><FamilyChip color={doc.family?.color} shortName={doc.family?.short_name} longName={doc.family?.long_name} /></TableCell>
      <TableCell className="font-medium">{doc.name}</TableCell>
      <TableCell>{doc.ref_int ?? "—"}</TableCell>
      <TableCell>{versioned ? last?.index_label ?? "—" : "—"}</TableCell>
      <TableCell>
        {!versioned ? "—" : frozen ? (
          <Tooltip><TooltipTrigger asChild><span className="flex items-center gap-1"><LockIcon className="size-3.5" />{frozen.index_label}</span></TooltipTrigger>
            <TooltipContent>{t("frozenHelp")}</TooltipContent></Tooltip>
        ) : canEdit ? (
          <Select value={link.pinned_version_id ?? "dynamic"} disabled={pending} onValueChange={(v) => onVersion(v === "dynamic" ? null : v)}>
            <SelectTrigger className="h-8 w-44" aria-label={t("indexToLink")}><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="dynamic">{t("dynamic")}</SelectItem>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.id} disabled={!hasFile(doc, v)}>{td("follow.indexLabel", { docIndex: v.index_label, state: resolve(stateKey(v)).value })}</SelectItem>
              ))}
            </SelectGroup></SelectContent>
          </Select>
        ) : (pinned?.index_label ?? `${effective?.index_label ?? "—"}`)}
      </TableCell>
      <TableCell>{effective ? <WordingBadge fields={wording} wkey={stateKey(effective)} /> : "—"}</TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={t("view")} title={t("view")} onClick={() => onView(path)}><EyeIcon /></Button>
          {canEdit && <Button variant="ghost" size="icon-sm" aria-label={tg("actions.delete")} onClick={onRemove}><Trash2Icon /></Button>}
        </div>
      </TableCell>
    </TableRow>
  );
}

function LinkDialog({ projectId, excluded, onClose, onLink }: { projectId: string; excluded: string[]; onClose: () => void; onLink: (id: string) => void }) {
  const t = useTranslations("documents.block");
  const td = useTranslations("documents");
  const tg = useTranslations("global");
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [q, setQ] = useState("");
  const [family, setFamily] = useState("all");
  const [category, setCategory] = useState("all");
  const [state, setState] = useState("all");
  const [selected, setSelected] = useState("");
  useEffect(() => {
    const supabase = createClient();
    supabase.from("documents").select(DOC_SELECT).eq("project_id", projectId).is("deleted_at", null).neq("nature", "rfi").order("name")
      .then(({ data }) => setDocs((data ?? []) as unknown as Doc[]));
    supabase.from("label_families").select("id, short_name").eq("kind", "category").eq("nature", "document").eq("project_id", projectId)
      .then(({ data }) => setCategories((data ?? []).map((c) => ({ id: c.id, label: c.short_name }))));
  }, [projectId]);
  const families = useMemo(() => [...new Map((docs ?? []).filter((d) => d.family).map((d) => [d.family!.id, d.family!])).values()], [docs]);
  const keyOf = (d: Doc) => { const l = d.versions.find((v) => v.is_last); return l ? stateKey(l) : "other"; };
  const all = (docs ?? []).filter((d) => !excluded.includes(d.id));
  const shown = all.filter((d) => (family === "all" || d.family?.id === family) && (category === "all" || d.category_id === category)
    && (state === "all" || keyOf(d) === state) && `${d.name} ${d.ref_int ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const states = [...new Set(all.map(keyOf))];

  return (
    <ModalShell onClose={onClose} size="lg" icon={<EntityIcon kind="project" icon={LinkIcon} size="md" />} title={t("linkTitle")}
      subtitle={t("counter", { current: shown.length, total: all.length })}
      footer={<><Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button><Button disabled={!selected} onClick={() => onLink(selected)}>{t("linkButton")}</Button></>}>
      <div className="flex flex-wrap gap-2 pb-3">
        <InputGroup className="w-56"><InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={tg("list.searchPlaceholder")} /></InputGroup>
        {([["family", family, setFamily, families.map((f) => ({ id: f.id, label: f.short_name }))], ["category", category, setCategory, categories],
          ["state", state, setState, states.map((s) => ({ id: s, label: td(`wording.${s}.value`) }))]] as const).map(([k, value, setter, items]) => (
          <Select key={k} value={value} onValueChange={setter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="all">{td(`filters.${k === "category" ? "category" : k}`)} : {tg("all")}</SelectItem>
              {items.map((i) => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
        ))}
      </div>
      {!docs ? <div className="flex justify-center py-10"><Spinner /></div> : (
        <RadioGroup value={selected} onValueChange={setSelected}>
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-10" /><TableHead>{td("columns.family")}</TableHead><TableHead>{td("columns.name")}</TableHead>
              <TableHead>{td("columns.refInt")}</TableHead><TableHead>{td("columns.index")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {shown.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">{tg("list.emptyTitle")}</TableCell></TableRow>}
              {shown.map((d) => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => setSelected(d.id)}>
                  <TableCell><RadioGroupItem value={d.id} aria-label={d.name} /></TableCell>
                  <TableCell><FamilyChip color={d.family?.color} shortName={d.family?.short_name} longName={d.family?.long_name} /></TableCell>
                  <TableCell><div className="flex flex-col"><span className="font-medium">{d.name}</span><span className="text-xs text-muted-foreground">{td(`natures.${d.nature}`)}</span></div></TableCell>
                  <TableCell>{d.ref_int ?? "—"}</TableCell>
                  <TableCell>{d.nature === "pdf_unversioned" ? "—" : d.versions.find((v) => v.is_last)?.index_label ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </RadioGroup>
      )}
      <p className="pt-3 text-xs text-muted-foreground">{t("annexHint")}</p>
    </ModalShell>
  );
}
