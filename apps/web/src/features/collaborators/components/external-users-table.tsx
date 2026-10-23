"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { EllipsisIcon, PencilIcon, Trash2Icon, UserPlusIcon } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteExternalUser } from "../actions";
import { COLLABORATOR_STATUS_COLORS } from "../meta";
import type { ExternalUserItem } from "../queries";
import { useActionRunner } from "./action-runner";

export function ExternalUsersTable({ items, total, permissions }: {
  items: ExternalUserItem[]; total: number; permissions: { edit: boolean; delete: boolean; convert: boolean };
}) {
  const t = useTranslations("collaborators");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const { run } = useActionRunner();
  const [toDelete, setToDelete] = useState<ExternalUserItem | null>(null);

  const columns = useMemo<ColumnDef<ExternalUserItem, unknown>[]>(() => [
    { id: "name", header: t("columns.name"), size: 220, cell: ({ row }) => <span className="font-medium">{row.original.last_name} {row.original.first_name}</span> },
    { id: "email", header: t("columns.email"), size: 240, cell: ({ row }) => row.original.email },
    { id: "company", header: t("columns.company"), size: 180, cell: ({ row }) => row.original.company_name },
    { id: "profession", header: t("columns.profession"), size: 160, cell: ({ row }) => row.original.profession },
    {
      id: "status", header: t("columns.status"), size: 130,
      cell: ({ row }) => <StatusBadge color={COLLABORATOR_STATUS_COLORS[row.original.status]} label={t(`status.${row.original.status}`)} />,
    },
    {
      id: "actions", header: tg("list.actions"), size: 110, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {permissions.edit && (
              <Button variant="ghost" size="icon-sm" aria-label={t("actions.edit")} onClick={() => dialog.open(`external-user/edit/${u.id}`)}><PencilIcon /></Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  {permissions.convert && (
                    <DropdownMenuItem onSelect={() => dialog.open(`user/convert/${u.id}/general-tab`)}><UserPlusIcon />{t("actions.convert")}</DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                {permissions.delete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(u)}><Trash2Icon />{t("actions.delete")}</DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], [t, tg, dialog, permissions]);

  return (
    <>
      <div className="pb-2 text-sm text-muted-foreground">{tg("list.counter", { current: items.length, total })}</div>
      <DataTable tableId="external-users" columns={columns} data={items} getRowId={(u) => u.id}
        onRowClick={permissions.edit ? (u) => dialog.open(`external-user/edit/${u.id}`) : undefined}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={t("external.createInfo")} />
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("confirm.deleteTitle", { name: toDelete ? `${toDelete.first_name} ${toDelete.last_name}` : "" })}
        description={t("confirm.deleteHardText")} word={t("confirm.word")} confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete) await run(() => deleteExternalUser(toDelete.id), t("toast.deleted")); }} />
    </>
  );
}
