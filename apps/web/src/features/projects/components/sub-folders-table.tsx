"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { CopyIcon, EllipsisIcon, HistoryIcon, InfoIcon, PackageOpenIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteProject } from "../actions";
import type { SubFolderItem } from "../folder-queries";

/** Liste des sous-dossiers d'un dossier référentiel (création, édition, duplication, préparation). */
export function SubFoldersTable({ folder, items, permissions }: {
  folder: { id: string; designation: string };
  items: SubFolderItem[];
  permissions: { add: boolean; edit: boolean; duplicate: boolean; delete: boolean; prepare: boolean };
}) {
  const t = useTranslations("folders");
  const tp = useTranslations("projects");
  const tg = useTranslations("global");
  const router = useRouter();
  const dialog = useDialog();
  const [toDelete, setToDelete] = useState<SubFolderItem | null>(null);

  const openAdd = useCallback(() => dialog.open(`project/add-sub-folder/${folder.id}/general-tab`), [dialog, folder.id]);
  useRegisterPageAdd(permissions.add ? openAdd : null);

  const columns = useMemo<ColumnDef<SubFolderItem, unknown>[]>(() => [
    {
      id: "family", header: tp("columns.family"), size: 120,
      cell: ({ row }) => <FamilyChip color={row.original.family?.color} shortName={row.original.family?.short_name} longName={row.original.family?.long_name} />,
    },
    {
      id: "designation", header: tp("columns.designation"), size: 320,
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <EntityIcon kind="folder" letter={tp("letters.folder")} size="md" />
          <div className="min-w-0">
            <div className="truncate font-medium group-hover:underline">{row.original.designation}</div>
            <div className="text-xs text-muted-foreground">{t("subFolder")}</div>
          </div>
        </div>
      ),
    },
    { id: "index", header: t("columns.index"), size: 90, cell: ({ row }) => row.original.project_index || "—" },
    { id: "status", header: tp("columns.status"), size: 170, cell: ({ row }) => <StatusBadge color={row.original.status?.color} label={row.original.status?.name} /> },
    { id: "client", header: tp("columns.client"), size: 160, cell: ({ row }) => row.original.client?.name ?? "—" },
    { id: "reference", header: tp("columns.reference"), size: 140, cell: ({ row }) => row.original.business_ref || "—" },
    {
      id: "responsible", header: tp("columns.responsible"), size: 180,
      cell: ({ row }) => row.original.members.filter((m) => m.role === "responsible" && m.collaborator)
        .map((m) => `${m.collaborator!.first_name} ${m.collaborator!.last_name}`).join(", ") || "—",
    },
    { id: "flows", header: t("columns.flows"), size: 90, cell: ({ row }) => row.original.flowCount },
    {
      id: "actions", header: tg("list.actions"), size: 110, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {permissions.edit && (
              <Button variant="ghost" size="icon-sm" aria-label={tp("actions.edit")} onClick={() => dialog.open(`project/edit/${p.id}/general-tab`)}>
                <PencilIcon />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  {permissions.prepare && (
                    <DropdownMenuItem onSelect={() => dialog.open(`project/prepare/${p.id}`)}><PackageOpenIcon />{t("prepare.action")}</DropdownMenuItem>
                  )}
                  {permissions.duplicate && (
                    <DropdownMenuItem onSelect={() => dialog.open(`project/duplicate/${p.id}`)}><CopyIcon />{tp("actions.duplicate")}</DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => dialog.open(`project/history/${p.id}`)}><HistoryIcon />{tp("actions.statusHistory")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => dialog.open(`project/properties/${p.id}`)}><InfoIcon />{tp("actions.properties")}</DropdownMenuItem>
                </DropdownMenuGroup>
                {permissions.delete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(p)}><Trash2Icon />{tp("actions.delete")}</DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], [t, tp, tg, dialog, permissions]);

  return (
    <>
      <div className="flex items-center justify-between pb-2 text-sm text-muted-foreground">
        <span>{tg("list.counter", { current: items.length, total: items.length })}</span>
        {permissions.add && <Button size="sm" onClick={openAdd}>{t("addSubFolder")}</Button>}
      </div>
      <DataTable
        tableId={`folder-${folder.id}`}
        columns={columns}
        data={items}
        getRowId={(p) => p.id}
        onRowClick={(p) => router.push(`/explore/projects/${p.id}/dashboard`)}
        emptyTitle={t("emptyTitle")}
        emptyDescription={t("emptySubtitle")}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={tp("delete.title", { name: toDelete?.designation ?? "" })}
        description={tp("delete.subtitle")}
        word="SUPPRIMER"
        confirmLabel={tg("actions.delete")}
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteProject(toDelete.id);
          if (res.ok) { notify.success(tg("toast.saved")); router.refresh(); }
          else notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error"));
        }}
      />
    </>
  );
}
