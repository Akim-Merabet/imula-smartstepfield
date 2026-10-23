"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckIcon, LockIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteWording } from "../actions/wording";
import { ListToolbar } from "./list-toolbar";
import { useRun } from "./use-run";

type Row = { id: string; name: string; description: string | null; is_default: boolean; read_only: boolean; languages: { language: string }[] };

export function WordingTable({ items }: { items: Row[] }) {
  const t = useTranslations("settings.wording");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const run = useRun();
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const openAdd = useCallback(() => dialog.open("wording/add/configuration-tab"), [dialog]);
  useRegisterPageAdd(openAdd);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    {
      id: "name", header: t("fields.name"), size: 280, cell: ({ row }) => (
        <span className="flex items-center gap-2 font-medium">{row.original.read_only && <LockIcon className="size-3.5 text-muted-foreground" />}{row.original.name}</span>
      ),
    },
    { id: "description", header: t("fields.description"), size: 300, cell: ({ row }) => <span className="line-clamp-2">{row.original.description ?? "—"}</span> },
    { id: "default", header: t("columns.default"), size: 110, cell: ({ row }) => row.original.is_default ? <CheckIcon className="size-4 text-success" /> : "—" },
    {
      id: "languages", header: t("columns.languages"), size: 200, cell: ({ row }) => (
        <div className="flex gap-1">{row.original.languages.map((l) => <Badge key={l.language} variant="secondary">{l.language.toUpperCase()}</Badge>)}</div>
      ),
    },
    {
      id: "actions", header: tg("list.actions"), size: 110, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" aria-label={tg("actions.edit")} onClick={() => dialog.open(`wording/edit/${row.original.id}/configuration-tab`)}><PencilIcon /></Button>
          <Button variant="ghost" size="icon-sm" disabled={row.original.read_only} aria-label={tg("actions.delete")} onClick={() => setToDelete(row.original)}><Trash2Icon /></Button>
        </div>
      ),
    },
  ], [t, tg, dialog]);

  return (
    <>
      <ListToolbar current={items.length} total={items.length} onAdd={openAdd} addLabel={t("add")} />
      <DataTable tableId="settings-wording" columns={columns} data={items} getRowId={(r) => r.id}
        onRowClick={(r) => dialog.open(`wording/edit/${r.id}/configuration-tab`)}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={tg("list.emptySubtitle")} />
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("delete.title", { name: toDelete?.name ?? "" })} description={tg("confirm.noTrash")} word="SUPPRIMER"
        confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete) await run(() => deleteWording(toDelete.id), tg("toast.deleted")); }} />
    </>
  );
}
