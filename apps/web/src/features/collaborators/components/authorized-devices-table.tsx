"use client";

import { useCallback, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import { deleteAuthorizedDevice } from "../actions";
import type { AuthorizedDeviceItem } from "../queries";
import { useActionRunner } from "./action-runner";

export function AuthorizedDevicesTable({ items, total, permissions }: {
  items: AuthorizedDeviceItem[]; total: number; permissions: { add: boolean; edit: boolean; delete: boolean };
}) {
  const t = useTranslations("collaborators");
  const tg = useTranslations("global");
  const format = useFormatter();
  const dialog = useDialog();
  const { run } = useActionRunner();
  const [toDelete, setToDelete] = useState<AuthorizedDeviceItem | null>(null);
  const openAdd = useCallback(() => dialog.open("authorized-device/add"), [dialog]);
  useRegisterPageAdd(permissions.add ? openAdd : null);

  const columns = useMemo<ColumnDef<AuthorizedDeviceItem, unknown>[]>(() => [
    { id: "designation", header: t("columns.designation"), size: 280, cell: ({ row }) => <span className="font-medium">{row.original.designation}</span> },
    { id: "deviceId", header: t("columns.deviceId"), size: 260, cell: ({ row }) => <span className="font-mono text-xs">{row.original.device_id}</span> },
    { id: "createdAt", header: t("columns.createdAt"), size: 180,
      cell: ({ row }) => format.dateTime(new Date(row.original.created_at), { dateStyle: "short", timeStyle: "short" }) },
    {
      id: "actions", header: tg("list.actions"), size: 110, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {permissions.edit && (
            <Button variant="ghost" size="icon-sm" aria-label={t("actions.edit")} onClick={() => dialog.open(`authorized-device/edit/${row.original.id}`)}><PencilIcon /></Button>
          )}
          {permissions.delete && (
            <Button variant="ghost" size="icon-sm" aria-label={t("actions.delete")} onClick={() => setToDelete(row.original)}><Trash2Icon /></Button>
          )}
        </div>
      ),
    },
  ], [t, tg, format, dialog, permissions]);

  return (
    <>
      <div className="flex items-center justify-between gap-2 pb-2">
        <span className="text-sm text-muted-foreground">{tg("list.counter", { current: items.length, total })}</span>
        {permissions.add && <Button onClick={openAdd}><PlusIcon data-icon="inline-start" />{t("toolbar.create")}</Button>}
      </div>
      <DataTable tableId="authorized-devices" columns={columns} data={items} getRowId={(d) => d.id}
        onRowClick={permissions.edit ? (d) => dialog.open(`authorized-device/edit/${d.id}`) : undefined}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={tg("list.emptySubtitle")} />
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("confirm.deleteTitle", { name: toDelete?.designation ?? "" })}
        description={t("confirm.deviceDeleteText")} word={t("confirm.word")} confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete) await run(() => deleteAuthorizedDevice(toDelete.id), t("toast.deleted")); }} />
    </>
  );
}
