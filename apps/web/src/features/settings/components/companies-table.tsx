"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { PencilIcon, StarIcon, Trash2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { FilterBar, SearchFilter } from "@/components/data-table/filter-bar";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { deleteCompany } from "../actions/clients";
import { ListToolbar } from "./list-toolbar";
import { useRun } from "./use-run";

type Row = { id: string; name: string; activity_area: string | null; is_parent_company: boolean };

export function CompaniesTable({ items, total, canAdd, canDelete }: { items: Row[]; total: number; canAdd: boolean; canDelete: boolean }) {
  const t = useTranslations("settings.companies");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const run = useRun();
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const openAdd = useCallback(() => dialog.open("company/add"), [dialog]);
  useRegisterPageAdd(canAdd ? openAdd : null);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    {
      id: "name", header: t("columns.name"), size: 320, cell: ({ row }) => (
        <span className="flex items-center gap-2 font-medium">{row.original.name}
          {row.original.is_parent_company && <Badge variant="secondary"><StarIcon data-icon="inline-start" />{t("parent")}</Badge>}
        </span>
      ),
    },
    { id: "activity", header: t("columns.activityArea"), size: 280, cell: ({ row }) => row.original.activity_area ?? "—" },
    {
      id: "actions", header: tg("list.actions"), size: 110, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" aria-label={tg("actions.edit")} onClick={() => dialog.open(`company/edit/${row.original.id}`)}><PencilIcon /></Button>
          {canDelete && (row.original.is_parent_company ? (
            <Tooltip>
              <TooltipTrigger asChild><span><Button variant="ghost" size="icon-sm" disabled aria-label={tg("actions.delete")}><Trash2Icon /></Button></span></TooltipTrigger>
              <TooltipContent>{t("errors.parentNotDeletable")}</TooltipContent>
            </Tooltip>
          ) : (
            <Button variant="ghost" size="icon-sm" aria-label={tg("actions.delete")} onClick={() => setToDelete(row.original)}><Trash2Icon /></Button>
          ))}
        </div>
      ),
    },
  ], [t, tg, dialog, canDelete]);

  return (
    <>
      <FilterBar><SearchFilter /></FilterBar>
      <ListToolbar current={items.length} total={total} onAdd={canAdd ? openAdd : null} addLabel={t("add")} />
      <DataTable tableId="settings-companies" columns={columns} data={items} getRowId={(r) => r.id}
        onRowClick={(r) => dialog.open(`company/edit/${r.id}`)}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={tg("list.emptySubtitle")} />
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("delete.title", { name: toDelete?.name ?? "" })} description={t("delete.subtitle")} word="SUPPRIMER"
        confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete) await run(() => deleteCompany(toDelete.id), tg("toast.deleted")); }} />
    </>
  );
}
