"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { FilterBar, SearchFilter } from "@/components/data-table/filter-bar";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import { deleteClient } from "../actions/clients";
import { ListToolbar } from "./list-toolbar";
import { useRun } from "./use-run";

type Row = { id: string; name: string; name_2: string | null; address: string; zip_code: string; city: string; country: string | null };

export function ClientsTable({ items, total, canEdit, canDelete }: { items: Row[]; total: number; canEdit: boolean; canDelete: boolean }) {
  const t = useTranslations("settings.clients");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const run = useRun();
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const openAdd = useCallback(() => dialog.open("client/add/general-tab"), [dialog]);
  useRegisterPageAdd(canEdit ? openAdd : null);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    {
      id: "name", header: t("columns.name"), size: 280, cell: ({ row }) => (
        <div className="min-w-0"><div className="truncate font-medium">{row.original.name}</div>
          {row.original.name_2 && <div className="truncate text-xs text-muted-foreground">{row.original.name_2}</div>}</div>
      ),
    },
    { id: "address", header: t("columns.address"), size: 260, cell: ({ row }) => row.original.address },
    { id: "zip", header: t("columns.zipCode"), size: 120, cell: ({ row }) => row.original.zip_code },
    { id: "city", header: t("columns.city"), cell: ({ row }) => row.original.city },
    { id: "country", header: t("columns.country"), cell: ({ row }) => row.original.country ?? "—" },
    {
      id: "actions", header: tg("list.actions"), size: 110, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" aria-label={tg("actions.edit")} onClick={() => dialog.open(`client/edit/${row.original.id}/general-tab`)}><PencilIcon /></Button>
          {canDelete && <Button variant="ghost" size="icon-sm" aria-label={tg("actions.delete")} onClick={() => setToDelete(row.original)}><Trash2Icon /></Button>}
        </div>
      ),
    },
  ], [t, tg, dialog, canDelete]);

  return (
    <>
      <FilterBar><SearchFilter /></FilterBar>
      <ListToolbar current={items.length} total={total} onAdd={canEdit ? openAdd : null} addLabel={t("add")} />
      <DataTable tableId="settings-clients" columns={columns} data={items} getRowId={(r) => r.id}
        onRowClick={(r) => dialog.open(`client/edit/${r.id}/general-tab`)}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={tg("list.emptySubtitle")} />
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("delete.title", { name: toDelete?.name ?? "" })} description={tg("confirm.noTrash")} word="SUPPRIMER"
        confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete) await run(() => deleteClient(toDelete.id), tg("toast.deleted")); }} />
    </>
  );
}
