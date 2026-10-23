"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import {
  DownloadIcon, EllipsisIcon, EyeIcon, FileUpIcon, InfoIcon, LayersIcon, LockOpenIcon, RefreshCwIcon, Share2Icon, Trash2Icon,
} from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { deleteDocument, getLastPdfUrl, refreshAllFromLibrary, refreshFromLibrary, reorganizeDocuments, type DeleteConflicts } from "../actions";
import type { WordingFields } from "../meta";
import type { DocumentListItem } from "../queries";
import { useIsUploading } from "../upload/uploads-store";
import { useDocError } from "./use-doc-error";
import { WordingBadge } from "./wording-badge";

type Option = { value: string; label: string; color?: string };
export type DocumentsTablePermissions = { add: boolean; edit: boolean; delete: boolean; import: boolean };

export function DocumentsTable({ mode, projectId, items, total, wordings, permissions, categories }: {
  mode: "project" | "library"; projectId: string | null; items: DocumentListItem[]; total: number;
  wordings: Record<string, WordingFields>; permissions: DocumentsTablePermissions; categories: Option[];
}) {
  const t = useTranslations("documents");
  const tg = useTranslations("global");
  const format = useFormatter();
  const router = useRouter();
  const dialog = useDialog();
  const docError = useDocError();
  const prefix = mode === "project" ? "dashboard-documents" : "library-documents";
  const [toDelete, setToDelete] = useState<DocumentListItem | null>(null);
  const [conflicts, setConflicts] = useState<{ kind: "in_use" | "imported"; details: DeleteConflicts } | null>(null);
  const [toUpdate, setToUpdate] = useState<DocumentListItem | null>(null);
  const [updateAll, setUpdateAll] = useState(false);
  const [reorganizing, setReorganizing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [field, setField] = useState<"category_id" | "closing_category_id">("category_id");
  const [category, setCategory] = useState<string>("none");
  const [confirmReorg, setConfirmReorg] = useState(false);
  const [pending, start] = useTransition();

  const openAdd = useCallback(() => dialog.open(`${prefix}/add/general-tab`), [dialog, prefix]);
  useRegisterPageAdd(permissions.add ? openAdd : null);

  const openPdf = async (d: DocumentListItem) => {
    const res = await getLastPdfUrl(d.id);
    if (!res.ok) { notify.error(t("follow.errors.no_pdf")); return; }
    window.open(res.data.url, "_blank", "noopener");
  };

  const columns = useMemo<ColumnDef<DocumentListItem, unknown>[]>(() => [
    {
      id: "family", header: t("columns.family"), size: 140, accessorFn: (d) => d.family?.short_name ?? "",
      cell: ({ row }) => {
        const d = row.original;
        return (
          <span className="flex items-center gap-1">
            <FamilyChip color={d.family?.color} shortName={d.family?.short_name} longName={d.family?.long_name} />
            {d.origin !== "local" && (
              <Badge variant="outline" className="h-5 px-1.5" title={t(`provenances.${d.origin}` as never)}>{t(`provenanceBadge.${d.origin}` as never)}</Badge>
            )}
            {d.origin === "derived_from_standard" && !d.actions_disabled && <LockOpenIcon className="size-3.5 text-muted-foreground" />}
          </span>
        );
      },
    },
    {
      id: "name", header: t("columns.name"), size: 320, accessorFn: (d) => d.name,
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium group-hover:underline">{row.original.name}</span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {t(`natures.${row.original.nature}` as never)}
            {row.original.is_large_file && <Badge variant="secondary" className="h-4 px-1 text-[0.65rem]" title={t("largeFileHelp")}>{t("largeFile")}</Badge>}
          </span>
        </div>
      ),
    },
    ...(mode === "library" ? [{
      id: "applicability", header: t("columns.applicability"), size: 140, accessorFn: (d: DocumentListItem) => d.account?.name ?? "",
      cell: ({ row }: { row: { original: DocumentListItem } }) => <span className="truncate">{row.original.account?.name ?? "—"}</span>,
    } as ColumnDef<DocumentListItem, unknown>] : []),
    { id: "refInt", header: t("columns.refInt"), size: 160, accessorFn: (d) => d.ref_int ?? "", cell: ({ row }) => row.original.ref_int ?? "—" },
    { id: "index", header: t("columns.index"), size: 90, accessorFn: (d) => d.last?.index_label ?? "", cell: ({ row }) => (row.original.nature === "pdf_unversioned" ? "—" : row.original.last?.index_label ?? "—") },
    {
      id: "state", header: t("columns.state"), size: 140, accessorFn: (d) => d.key,
      cell: ({ row }) => <WordingBadge fields={row.original.family?.wording_configuration_id ? wordings[row.original.family.wording_configuration_id] : null} wkey={row.original.key} />,
    },
    {
      id: "diffusion", header: t("columns.diffusion"), size: 120, accessorFn: (d) => d.last?.diffusion_date ?? "",
      cell: ({ row }) => (row.original.last?.diffusion_date ? format.dateTime(new Date(row.original.last.diffusion_date), { dateStyle: "short" }) : "—"),
    },
    {
      id: "importDate", header: t("columns.importDate"), size: 120, accessorFn: (d) => d.created_at,
      cell: ({ row }) => format.dateTime(new Date(row.original.created_at), { dateStyle: "short" }),
    },
    {
      id: "actions", header: t("columns.actions"), size: 140, enableResizing: false, enableSorting: false, meta: { sticky: true },
      cell: ({ row }) => (
        <RowActions d={row.original} mode={mode} permissions={permissions}
          onUpdate={() => setToUpdate(row.original)} onPdf={() => openPdf(row.original)}
          onProperties={() => dialog.open(`${prefix}/properties/${row.original.id}`)} onDelete={() => setToDelete(row.original)} />
      ),
    },
  ], [t, format, wordings, mode, permissions, dialog, prefix]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async () => {
    if (!toDelete) return;
    const res = await deleteDocument(toDelete.id);
    if (res.ok) { notify.success(t("delete.done")); router.refresh(); return; }
    if ((res.error === "in_use" || res.error === "imported") && res.details) {
      setConflicts({ kind: res.error, details: res.details as DeleteConflicts }); return;
    }
    notify.error(docError(res.error));
  };

  const applyReorganize = () => start(async () => {
    const res = await reorganizeDocuments(mode, projectId, selected, field, category === "none" ? null : category);
    if (!res.ok) { notify.error(docError(res.error)); return; }
    notify.success(tg("toast.saved")); setReorganizing(false); setSelected([]); router.refresh();
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pb-2 text-sm text-muted-foreground">
        <span className="mr-auto">{tg("list.counter", { current: items.length, total })}</span>
        {mode === "project" && permissions.import && (
          <Button variant="secondary" size="sm" onClick={() => dialog.open(`${prefix}/import`)}><FileUpIcon data-icon="inline-start" />{t("actions.importLibrary")}</Button>
        )}
        {mode === "project" && permissions.edit && items.some((d) => d.library_update_available) && (
          <Button variant="secondary" size="sm" onClick={() => setUpdateAll(true)}><RefreshCwIcon data-icon="inline-start" />{t("actions.updateAll")}</Button>
        )}
        {permissions.edit && (
          <Button variant={reorganizing ? "default" : "secondary"} size="sm" onClick={() => { setReorganizing((v) => !v); setSelected([]); }}>
            <LayersIcon data-icon="inline-start" />{t("actions.reorganize")}
          </Button>
        )}
      </div>
      {reorganizing && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span>{t("reorganize.change")}</span>
          <Select value={field} onValueChange={(v) => setField(v as typeof field)}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="category_id">{t("reorganize.field.category_id")}</SelectItem>
              <SelectItem value="closing_category_id">{t("reorganize.field.closing_category_id")}</SelectItem>
            </SelectGroup></SelectContent>
          </Select>
          <span>{t("reorganize.to")}</span>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="none">{t("reorganize.none")}</SelectItem>
              {categories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
          <span className="text-muted-foreground">{t("reorganize.on", { number: selected.length })}</span>
          <Button size="sm" className="ml-auto" disabled={!selected.length || pending} onClick={() => setConfirmReorg(true)}>
            {pending && <Spinner data-icon="inline-start" />}{tg("actions.validate")}
          </Button>
        </div>
      )}
      <DataTable
        key={reorganizing ? "select" : "list"}
        tableId={mode === "project" ? "project-documents" : "library-documents"}
        columns={columns}
        data={items}
        getRowId={(d) => d.id}
        clientSorting
        selectable={reorganizing}
        onSelectionChange={setSelected}
        onRowClick={(d) => { if (!d.generating && !reorganizing) dialog.open(`${prefix}/edit/${d.id}/general-tab`); }}
        emptyTitle={t("emptyTitle")}
        emptyDescription={t("emptyDescription")}
      />
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={mode === "library" ? t("delete.libraryTitle", { name: toDelete?.name ?? "" }) : t("delete.title")}
        description={mode === "project" ? t("delete.subtitle") : undefined}
        confirmLabel={tg("actions.delete")} onConfirm={handleDelete} />
      <ConfirmDialog open={!!toUpdate} onOpenChange={(o) => { if (!o) setToUpdate(null); }} destructive={false}
        title={t("update.confirm")} confirmLabel={t("actions.update")}
        onConfirm={async () => {
          if (!toUpdate) return;
          const res = await refreshFromLibrary(toUpdate.id);
          if (res.ok) { notify.success(t("update.done")); router.refresh(); }
          else notify.error(res.error === "inconsistent_versions" ? t("update.inconsistent", { documentName: toUpdate.name }) : docError(res.error));
        }} />
      <ConfirmDialog open={updateAll} onOpenChange={setUpdateAll} destructive={false} title={t("update.allConfirm")} description={t("update.allHelp")}
        confirmLabel={t("actions.update")} onConfirm={async () => {
          if (!projectId) return;
          const res = await refreshAllFromLibrary(projectId);
          if (!res.ok) { notify.error(docError(res.error)); return; }
          notify.success(t("update.allDone", { count: res.data.updated }));
          res.data.failed.forEach((name) => notify.error(t("update.inconsistent", { documentName: name })));
          router.refresh();
        }} />
      <ConfirmDialog open={confirmReorg} onOpenChange={setConfirmReorg} destructive={false}
        title={t("reorganize.confirm", {
          type: t(`reorganize.field.${field}`), name: category === "none" ? t("reorganize.none") : categories.find((c) => c.value === category)?.label ?? "",
          count: selected.length,
        })}
        confirmLabel={tg("actions.confirm")} onConfirm={applyReorganize} />
      <AlertDialog open={!!conflicts} onOpenChange={(o) => { if (!o) setConflicts(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{conflicts?.kind === "imported" ? t("delete.imported") : t("follow.errors.invalid_action")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-3 text-sm">
                {conflicts?.kind === "imported" && <ConflictList title={t("delete.importedHelp")} lines={conflicts.details.projects} />}
                {conflicts && conflicts.details.flows.length > 0 && (
                  <ConflictList title={t("delete.inFlows")} lines={conflicts.details.flows.map((l) => t("delete.flowLine", JSON.parse(l)))} />
                )}
                {conflicts && conflicts.details.documents.length > 0 && <ConflictList title={t("delete.inDocuments")} lines={conflicts.details.documents} />}
                {conflicts && conflicts.details.sections.length > 0 && (
                  <ConflictList title={t("delete.inSections")} lines={conflicts.details.sections.map((s) => t("delete.sectionLine", { sectionName: s }))} />
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogAction>{tg("actions.close")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ConflictList({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium text-foreground">{title}</span>
      <ul className="list-disc pl-5">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>
  );
}

function RowActions({ d, mode, permissions, onUpdate, onPdf, onProperties, onDelete }: {
  d: DocumentListItem; mode: "project" | "library"; permissions: DocumentsTablePermissions;
  onUpdate: () => void; onPdf: () => void; onProperties: () => void; onDelete: () => void;
}) {
  const t = useTranslations("documents");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const uploading = useIsUploading(d.id);
  const tip = (label: string, node: React.ReactNode) => (
    <Tooltip><TooltipTrigger asChild>{node}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
  );
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {uploading && tip(t("actions.uploading"), <span className="flex size-8 items-center justify-center"><Spinner /></span>)}
      {mode === "project" && d.library_update_available && permissions.edit && tip(t("actions.update"),
        <Button variant="ghost" size="icon-sm" className="text-warning" aria-label={t("actions.update")} onClick={onUpdate}><RefreshCwIcon /></Button>)}
      {d.generating ? tip(t("actions.pending"), <span className="flex size-8 items-center justify-center text-muted-foreground"><Spinner /></span>)
        : tip(d.hasFile ? (d.is_large_file ? t("actions.download") : t("actions.lastPdf")) : t("actions.noPdf"),
          <span><Button variant="ghost" size="icon-sm" disabled={!d.hasFile} aria-label={t("actions.lastPdf")} onClick={onPdf}>
            {d.is_large_file ? <DownloadIcon /> : <EyeIcon />}
          </Button></span>)}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={onProperties}><InfoIcon />{t("actions.properties")}</DropdownMenuItem>
            {mode === "project" && <DropdownMenuItem onSelect={() => dialog.open(`share/document/${d.id}`)}><Share2Icon />{t("actions.share")}</DropdownMenuItem>}
          </DropdownMenuGroup>
          {permissions.delete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2Icon />{t("actions.delete")}</DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
