"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArchiveIcon, ArchiveRestoreIcon, CopyIcon, EllipsisIcon, EyeIcon, HistoryIcon, InfoIcon, LayoutListIcon, PencilIcon, Trash2Icon,
} from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteLibraryForm, setLibraryFormArchived } from "../actions";
import type { LibraryFormItem } from "../queries";
import { FormFlags, NatureChip, useActionError } from "./form-chips";

type Rights = { isAdmin: boolean; model: boolean; generic: boolean };

export function LibraryFormsTable({ items, total, hasMore, limit, rights, permissions }: {
  items: LibraryFormItem[]; total: number; hasMore: boolean; limit: number; rights: Rights;
  permissions: { add: boolean; edit: boolean; duplicate: boolean; archive: boolean; delete: boolean };
}) {
  const t = useTranslations("forms");
  const tg = useTranslations("global");
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dialog = useDialog();
  const errorText = useActionError();
  const [toDelete, setToDelete] = useState<LibraryFormItem | null>(null);
  const [blocked, setBlocked] = useState<{ name: string; projects: string[] } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const openAdd = useCallback(() => dialog.open("form-lib/add/general-tab"), [dialog]);
  useRegisterPageAdd(permissions.add ? openAdd : null);

  const canWrite = useCallback((f: LibraryFormItem) =>
    rights.isAdmin || (f.nature === "model" && rights.model) || (f.nature === "generic" && rights.generic), [rights]);
  const builderHref = (f: LibraryFormItem, view?: boolean) =>
    `/form/${f.id}?${new URLSearchParams({ ...(view ? { mode: "view" } : {}), returnTo: `${pathname}?${searchParams.toString()}` })}`;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    const res = await fn();
    if (res.ok) { notify.success(success); router.refresh(); } else notify.error(errorText(res.error ?? "unknown"));
  };

  const columns = useMemo<ColumnDef<LibraryFormItem, unknown>[]>(() => [
    {
      id: "family", header: t("columns.family"), size: 120,
      cell: ({ row }) => <FamilyChip color={row.original.family?.color} shortName={row.original.family?.short_name} longName={row.original.family?.long_name} />,
    },
    {
      id: "name", header: t("columns.name"), size: 340,
      cell: ({ row }) => {
        const f = row.original;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <NatureChip nature={f.nature} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium group-hover:underline">{f.name}</span>
                <FormFlags pdfTemplate={!!f.pdf_template?.enabled} objectLink={f.object_attributes_link !== "disabled"} />
              </div>
              {f.description && <div className="truncate text-xs text-muted-foreground">{f.description}</div>}
              {f.archived && <div className="text-xs text-warning">{t("tooltips.archived")}</div>}
            </div>
          </div>
        );
      },
    },
    { id: "reference", header: t("columns.reference"), size: 140, cell: ({ row }) => row.original.reference || "—" },
    { id: "index", header: t("columns.index"), size: 90, cell: ({ row }) => row.original.index_label || "—" },
    {
      id: "updatedAt", header: t("columns.updatedAt"), size: 150,
      cell: ({ row }) => format.dateTime(new Date(row.original.updated_at), { dateStyle: "short", timeStyle: "short" }),
    },
    { id: "status", header: t("columns.status"), size: 150, cell: ({ row }) => <StatusBadge color={row.original.status?.color} label={row.original.status?.name} /> },
    {
      id: "company", header: t("columns.company"), size: 170,
      cell: ({ row }) => <span className="line-clamp-2">{row.original.companies.map((c) => c.company?.name).filter(Boolean).join(", ") || "—"}</span>,
    },
    {
      id: "actions", header: tg("list.actions"), size: 110, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => {
        const f = row.original;
        const writable = canWrite(f);
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {permissions.edit && writable && (
              <Button variant="ghost" size="icon-sm" aria-label={t("actions.editInfo")} onClick={() => dialog.open(`form-lib/edit/${f.id}/general-tab`)}>
                <PencilIcon />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  {permissions.edit && writable && (
                    <DropdownMenuItem onSelect={() => dialog.open(`form-lib/edit/${f.id}/general-tab`)}><PencilIcon />{t("actions.editInfo")}</DropdownMenuItem>
                  )}
                  {writable && (
                    <DropdownMenuItem asChild><Link href={builderHref(f)}><LayoutListIcon />{t("actions.editContent")}</Link></DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild><Link href={builderHref(f, true)}><EyeIcon />{t("actions.overview")}</Link></DropdownMenuItem>
                  {permissions.duplicate && (
                    <DropdownMenuItem onSelect={() => dialog.open(`form-lib/duplicate/${f.id}`)}><CopyIcon />{t("actions.duplicate")}</DropdownMenuItem>
                  )}
                  {permissions.archive && writable && (
                    <DropdownMenuItem onSelect={() => run(() => setLibraryFormArchived(f.id, !f.archived), f.archived ? t("toasts.unarchived") : t("toasts.archived"))}>
                      {f.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}{f.archived ? t("actions.unarchive") : t("actions.archive")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => dialog.open(`form-lib/history/${f.id}`)}><HistoryIcon />{t("actions.history")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => dialog.open(`form-lib/properties/${f.id}`)}><InfoIcon />{t("actions.properties")}</DropdownMenuItem>
                </DropdownMenuGroup>
                {permissions.delete && writable && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem variant="destructive" onSelect={() => {
                        if (!f.already_imported) { setToDelete(f); return; }
                        // Vérification serveur (liste des entités) : la suppression est refusée avant toute écriture.
                        void deleteLibraryForm(f.id).then((res) => {
                          if (res.ok) { notify.success(t("toasts.deleted")); router.refresh(); }
                          else setBlocked({ name: f.name, projects: res.error === "form_imported" ? (res.details as string[]) ?? [] : [] });
                        });
                      }}>
                        <Trash2Icon />{t("actions.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], [t, tg, format, dialog, permissions, canWrite]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMoreHref = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("limit", String(limit + 50));
    return `${pathname}?${params.toString()}`;
  })();

  return (
    <>
      <div className="flex items-center justify-between pb-2 text-sm text-muted-foreground">
        <span>{tg("list.counter", { current: items.length, total })}</span>
        {selected.length > 0 && <span>{tg("list.selected", { count: selected.length })}</span>}
      </div>
      <DataTable
        tableId="library-forms"
        columns={columns}
        data={items}
        getRowId={(f) => f.id}
        selectable
        onSelectionChange={setSelected}
        onRowClick={(f) => router.push(builderHref(f, !canWrite(f)))}
        emptyTitle={tg("list.emptyTitle")}
        emptyDescription={tg("list.emptySubtitle")}
        footer={hasMore ? <Link href={loadMoreHref} scroll={false} className="text-sm text-info hover:underline">{tg("actions.loadMore")}</Link> : undefined}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("delete.title", { name: toDelete?.name ?? "" })}
        description={t("delete.subtitleLibrary")}
        word="SUPPRIMER"
        confirmLabel={tg("actions.delete")}
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteLibraryForm(toDelete.id);
          if (res.ok) { notify.success(t("toasts.deleted")); router.refresh(); return; }
          if (res.error === "form_imported") setBlocked({ name: toDelete.name, projects: (res.details as string[]) ?? [] });
          else notify.error(errorText(res.error));
        }}
      />
      <AlertDialog open={!!blocked} onOpenChange={(o) => { if (!o) setBlocked(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.importedTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete.importedBody", { name: blocked?.name ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          {!!blocked?.projects.length && (
            <ul className="list-disc pl-6 text-sm">{blocked.projects.map((p, i) => <li key={`${p}-${i}`}>{p}</li>)}</ul>
          )}
          <AlertDialogFooter><AlertDialogAction>{tg("actions.close")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
