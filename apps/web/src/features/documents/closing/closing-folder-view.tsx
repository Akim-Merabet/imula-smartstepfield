"use client";

import { Fragment, useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, ChevronRightIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, ClipboardCheckIcon, EllipsisIcon,
  EyeIcon, FileCogIcon, InfoIcon, PencilIcon, PlusIcon, Trash2Icon,
} from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { deleteDocument, getSignedUrl } from "../actions";
import { useDocError } from "../components/use-doc-error";
import { WordingBadge } from "../components/wording-badge";
import { stateKey, type WordingFields } from "../meta";
import { deleteSection, generateClosing, reorderSections } from "./actions";
import type { ClosingFolder, ClosingItem, ClosingSection } from "./queries";

type Category = { id: string; short_name: string; long_name: string | null; parent_id: string | null; relative_nature: string };

/** Dossier de clôture (§5.9.3) : arbre dossier → sections → documents. */
export function ClosingFolderView({ folders, wordings, categories, permissions }: {
  folders: ClosingFolder[]; wordings: Record<string, WordingFields>; categories: Category[];
  permissions: { add: boolean; edit: boolean; delete: boolean; generate: boolean };
}) {
  const t = useTranslations("closingFolder");
  const tg = useTranslations("global");
  const format = useFormatter();
  const router = useRouter();
  const dialog = useDialog();
  const docError = useDocError();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [toDeleteFolder, setToDeleteFolder] = useState<ClosingFolder | null>(null);
  const [toDeleteSection, setToDeleteSection] = useState<ClosingSection | null>(null);
  const [verify, setVerify] = useState<ClosingFolder | null>(null);
  const [pending, start] = useTransition();

  const openAdd = useCallback(() => dialog.open("closing-folder/add/general-tab"), [dialog]);
  useRegisterPageAdd(permissions.add ? openAdd : null);

  const toggle = (id: string) => setClosed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allIds = folders.flatMap((f) => [f.id, ...f.sections.map((s) => s.id)]);
  const open = { has: (id: string) => !closed.has(id), size: allIds.length - allIds.filter((id) => closed.has(id)).length };
  const generate = (folderId: string, sectionId: string | null) => start(async () => {
    const res = await generateClosing(folderId, sectionId);
    if (!res.ok) { notify.error(docError(res.error)); return; }
    notify.info(t("generate.started"), t("generate.heavy")); router.refresh();
  });
  const preview = async (f: ClosingFolder) => {
    const last = [...f.versions].sort((a, b) => b.seq - a.seq).find((v) => v.pdf_path);
    if (!last?.pdf_path) { generate(f.id, null); return; }
    const res = await getSignedUrl(last.pdf_path);
    if (res.ok) window.open(res.data.url, "_blank", "noopener");
  };
  const move = (f: ClosingFolder, index: number, dir: -1 | 1) => start(async () => {
    const ids = f.sections.map((s) => s.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    const res = await reorderSections(f.id, ids);
    if (!res.ok) { notify.error(docError(res.error)); return; }
    notify.success(t("arrangementSaved")); router.refresh();
  });

  if (folders.length === 0) {
    return (
      <Empty className="flex-1 border">
        <EmptyHeader><EmptyTitle>{t("empty.title")}</EmptyTitle><EmptyDescription>{t("empty.description")}</EmptyDescription></EmptyHeader>
        {permissions.add && <Button onClick={openAdd}><PlusIcon data-icon="inline-start" />{t("actions.create")}</Button>}
      </Empty>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setClosed(open.size ? new Set(allIds) : new Set())}>
          {open.size ? <ChevronsDownUpIcon data-icon="inline-start" /> : <ChevronsUpDownIcon data-icon="inline-start" />}{open.size ? t("collapse") : t("expand")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>{t("columns.name")}</TableHead><TableHead>{t("columns.refInt")}</TableHead><TableHead>{t("columns.index")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead><TableHead>{t("columns.diffusion")}</TableHead><TableHead className="text-right">{t("columns.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {folders.map((f) => {
              const last = f.versions.find((v) => v.is_last);
              const fw = f.family?.wording_configuration_id ? wordings[f.family.wording_configuration_id] : null;
              return (
                <Fragment key={f.id}>
                  <TableRow className="bg-muted/40">
                    <TableCell>
                      <button type="button" className="flex items-center gap-2 font-medium" onClick={() => toggle(f.id)}>
                        {open.has(f.id) ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
                        <FamilyChip color={f.family?.color} shortName={f.family?.short_name} longName={f.family?.long_name} />
                        <span className="flex flex-col items-start">{f.name}<span className="text-xs font-normal text-muted-foreground">{t("sectionsCount", { count: f.sections.length })}</span></span>
                      </button>
                    </TableCell>
                    <TableCell>{f.ref_int ?? f.ref_ext ?? "—"}</TableCell>
                    <TableCell>{last?.index_label ?? "—"}</TableCell>
                    <TableCell>{last && <WordingBadge fields={fw} wkey={stateKey(last)} />}</TableCell>
                    <TableCell>{last?.diffusion_date ? format.dateTime(new Date(last.diffusion_date), { dateStyle: "short" }) : "—"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {permissions.edit && <Button variant="ghost" size="icon-sm" aria-label={t("actions.addSection")} title={t("actions.addSection")} onClick={() => dialog.open(`closing-section/add/${f.id}/general-tab`)}><PlusIcon /></Button>}
                        <Button variant="ghost" size="icon-sm" aria-label={t("actions.edit")} onClick={() => dialog.open(`closing-folder/edit/${f.id}/general-tab`)}><PencilIcon /></Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              {permissions.generate && <DropdownMenuItem disabled={pending} onSelect={() => generate(f.id, null)}><FileCogIcon />{t("actions.generate")}</DropdownMenuItem>}
                              <DropdownMenuItem onSelect={() => void preview(f)}><EyeIcon />{t("actions.preview")}</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setVerify(f)}><ClipboardCheckIcon />{t("actions.verify")}</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => dialog.open(`closing-folder/properties/${f.id}`)}><InfoIcon />{t("actions.properties")}</DropdownMenuItem>
                            </DropdownMenuGroup>
                            {permissions.delete && <><DropdownMenuSeparator /><DropdownMenuGroup>
                              <DropdownMenuItem variant="destructive" onSelect={() => setToDeleteFolder(f)}><Trash2Icon />{tg("actions.delete")}</DropdownMenuItem>
                            </DropdownMenuGroup></>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                  {open.has(f.id) && f.sections.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="pl-12 text-sm text-muted-foreground">{t("empty.sections")}</TableCell></TableRow>
                  )}
                  {open.has(f.id) && f.sections.map((s, i) => (
                    <Fragment key={s.id}>
                      <TableRow>
                        <TableCell className="pl-10">
                          <button type="button" className="flex items-center gap-2" onClick={() => toggle(s.id)}>
                            {open.has(s.id) ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
                            <span className="flex flex-col items-start">
                              <span className="font-medium">{s.name}</span>
                              <span className="text-xs text-muted-foreground">{t(`types.${s.type}`)} · {t("documentsCount", { count: s.items.length })}{s.flow ? ` · ${s.flow.name}` : ""}</span>
                            </span>
                          </button>
                        </TableCell>
                        <TableCell colSpan={3} className="text-xs text-muted-foreground"
                          title={s.last_generated_at ? t("lastGenerated", { date: format.dateTime(new Date(s.last_generated_at), { dateStyle: "short", timeStyle: "short" }) }) : undefined}>
                          {s.description}
                        </TableCell>
                        <TableCell />
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {permissions.edit && <>
                              <Button variant="ghost" size="icon-sm" aria-label={t("actions.up")} disabled={i === 0 || pending} onClick={() => move(f, i, -1)}><ArrowUpIcon /></Button>
                              <Button variant="ghost" size="icon-sm" aria-label={t("actions.down")} disabled={i === f.sections.length - 1 || pending} onClick={() => move(f, i, 1)}><ArrowDownIcon /></Button>
                              <Button variant="ghost" size="icon-sm" aria-label={t("actions.edit")} onClick={() => dialog.open(`closing-section/edit/${s.id}/general-tab`)}><PencilIcon /></Button>
                            </>}
                            {permissions.generate && <Button variant="ghost" size="icon-sm" aria-label={t("actions.previewSection")} title={t("actions.previewSection")} disabled={pending} onClick={() => generate(f.id, s.id)}><EyeIcon /></Button>}
                            {permissions.delete && <Button variant="ghost" size="icon-sm" aria-label={tg("actions.delete")} onClick={() => setToDeleteSection(s)}><Trash2Icon /></Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                      {open.has(s.id) && s.items.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="pl-20 text-sm text-muted-foreground">{t("empty.items")}</TableCell></TableRow>
                      )}
                      {open.has(s.id) && s.items.map((item) => <ItemRow key={item.id} item={item} wordings={wordings} />)}
                    </Fragment>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog open={!!toDeleteFolder} onOpenChange={(o) => { if (!o) setToDeleteFolder(null); }} title={t("delete.folder")} confirmLabel={tg("actions.delete")}
        onConfirm={async () => {
          if (!toDeleteFolder) return;
          const res = await deleteDocument(toDeleteFolder.id);
          if (!res.ok) { notify.error(docError(res.error)); return; }
          notify.success(tg("toast.deleted")); router.refresh();
        }} />
      <ConfirmDialog open={!!toDeleteSection} onOpenChange={(o) => { if (!o) setToDeleteSection(null); }} title={t("delete.section")}
        description={tg("confirm.noTrash")} confirmLabel={tg("actions.delete")}
        onConfirm={async () => {
          if (!toDeleteSection) return;
          const res = await deleteSection(toDeleteSection.id);
          if (!res.ok) { notify.error(docError(res.error)); return; }
          notify.success(tg("toast.deleted")); router.refresh();
        }} />
      {verify && <VerificationDialog folder={verify} categories={categories} onClose={() => setVerify(null)} />}
    </div>
  );
}

function ItemRow({ item, wordings }: { item: ClosingItem; wordings: Record<string, WordingFields> }) {
  const t = useTranslations("closingFolder");
  const format = useFormatter();
  const d = item.document;
  if (!d) return null;
  const versions = [...d.versions].sort((a, b) => b.seq - a.seq);
  const v = (item.version_id ? versions.find((x) => x.id === item.version_id) : versions.find((x) => x.diffusion_date)) ?? versions[0];
  const diffused = versions.some((x) => x.diffusion_date);
  return (
    <TableRow className={cn(!diffused && "text-muted-foreground")}>
      <TableCell className="pl-20">
        <span className="flex items-center gap-2">{d.name}
          {d.is_large_file && <Badge variant="secondary" className="h-4 px-1 text-[0.65rem]">{t("largeFile")}</Badge>}
          {!diffused && <Badge variant="outline" className="h-4 px-1 text-[0.65rem]">{t("notDiffused")}</Badge>}
        </span>
      </TableCell>
      <TableCell>{d.ref_int ?? "—"}</TableCell>
      <TableCell>{v?.index_label ?? "—"}</TableCell>
      <TableCell>{v && <WordingBadge fields={d.family?.wording_configuration_id ? wordings[d.family.wording_configuration_id] : null} wkey={stateKey(v)} />}</TableCell>
      <TableCell>{v?.diffusion_date ? format.dateTime(new Date(v.diffusion_date), { dateStyle: "short" }) : "—"}</TableCell>
      <TableCell />
    </TableRow>
  );
}

/** « Vérification du contenu » : catégories parents appelées et part des catégories enfants utilisées. */
function VerificationDialog({ folder, categories, onClose }: { folder: ClosingFolder; categories: Category[]; onClose: () => void }) {
  const t = useTranslations("closingFolder.verification");
  const used = new Set(folder.sections.flatMap((s) => s.items.map((i) => i.document?.closing_category_id).filter(Boolean) as string[]));
  const parents = categories.filter((c) => c.relative_nature === "parent");
  const rows = parents.map((p) => {
    const children = categories.filter((c) => c.parent_id === p.id);
    return { p, total: children.length, used: children.filter((c) => used.has(c.id)).length };
  }).filter((r) => r.used > 0 || used.has(r.p.id));
  const all = rows.every((r) => r.used === r.total);
  return (
    <ModalShell onClose={onClose} size="sm" icon={<EntityIcon kind="project" icon={ClipboardCheckIcon} size="md" />} title={t("title")}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">{t("subtitle")}</p>
        {rows.length === 0 ? <p>{t("noCategory")}</p> : (
          <ul className="flex flex-col gap-1">
            {rows.map((r) => <li key={r.p.id}>{t("line", { name: r.p.long_name ? `${r.p.short_name} - ${r.p.long_name}` : r.p.short_name, used: r.used, total: r.total })}</li>)}
          </ul>
        )}
        {rows.length > 0 && <p className={all ? "text-success" : "text-warning"}>{all ? t("allUsed") : t("notAllUsed")}</p>}
      </div>
    </ModalShell>
  );
}
