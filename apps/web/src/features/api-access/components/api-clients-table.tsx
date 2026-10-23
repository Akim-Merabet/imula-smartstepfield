"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { BanIcon, EllipsisVerticalIcon, KeyRoundIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteApiClient, revokeApiClient, rotateApiClientSecret, type IssuedCredentials } from "../actions";
import { clientState, type ApiClientItem, type ApiClientState } from "../meta";
import { SecretReveal } from "./secret-reveal";
import { useApiErrorMessage } from "./use-error-message";

const STATE_VARIANT: Record<ApiClientState, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default", inactive: "secondary", expired: "outline", revoked: "destructive",
};

type Pending = { kind: "rotate" | "revoke" | "delete"; item: ApiClientItem } | null;

export function ApiClientsTable({ items, total, permissions }: {
  items: ApiClientItem[]; total: number; permissions: { add: boolean; edit: boolean; delete: boolean };
}) {
  const t = useTranslations("apiAccess");
  const tg = useTranslations("global");
  const format = useFormatter();
  const router = useRouter();
  const dialog = useDialog();
  const message = useApiErrorMessage();
  const [pending, setPending] = useState<Pending>(null);
  const [issued, setIssued] = useState<(IssuedCredentials & { name: string }) | null>(null);
  const openAdd = useCallback(() => dialog.open("api-key/add"), [dialog]);
  useRegisterPageAdd(permissions.add ? openAdd : null);

  const date = useCallback((v: string | null, empty: string) =>
    v ? format.dateTime(new Date(v), { dateStyle: "short", timeStyle: "short" }) : <span className="text-muted-foreground">{empty}</span>, [format]);

  const columns = useMemo<ColumnDef<ApiClientItem, unknown>[]>(() => [
    { id: "name", header: t("columns.name"), size: 220, meta: { locked: true },
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: "type", header: t("columns.type"), size: 130, cell: ({ row }) => t(`keyType.${row.original.key_type}`) },
    { id: "account", header: t("columns.account"), size: 170,
      cell: ({ row }) => row.original.account_name ?? <span className="text-muted-foreground">{t("allAccounts")}</span> },
    { id: "class", header: t("columns.class"), size: 130, cell: ({ row }) => t(`class.${row.original.service_class}`) },
    { id: "clientId", header: t("columns.clientId"), size: 300,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.client_id}</span> },
    { id: "state", header: t("columns.state"), size: 110, cell: ({ row }) => {
      const s = clientState(row.original);
      return <Badge variant={STATE_VARIANT[s]}>{t(`state.${s}`)}</Badge>;
    } },
    { id: "expiresAt", header: t("columns.expiresAt"), size: 150, cell: ({ row }) => date(row.original.expires_at, t("noExpiry")) },
    { id: "lastUsedAt", header: t("columns.lastUsedAt"), size: 170, cell: ({ row }) => date(row.original.last_used_at, t("never")) },
    { id: "calls", header: t("columns.calls"), size: 110, cell: ({ row }) => format.number(row.original.calls_24h) },
    { id: "createdAt", header: t("columns.createdAt"), size: 150, cell: ({ row }) => date(row.original.created_at, "—") },
    {
      id: "actions", header: tg("list.actions"), size: 80, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => {
        const item = row.original;
        const revoked = !!item.revoked_at;
        if (!permissions.edit && !permissions.delete) return null;
        return (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={tg("list.actions")}><EllipsisVerticalIcon /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  {permissions.edit && !revoked && (
                    <DropdownMenuItem onSelect={() => dialog.open(`api-key/edit/${item.id}`)}><PencilIcon />{t("actions.edit")}</DropdownMenuItem>
                  )}
                  {permissions.edit && !revoked && (
                    <DropdownMenuItem onSelect={() => setPending({ kind: "rotate", item })}><RefreshCwIcon />{t("actions.rotate")}</DropdownMenuItem>
                  )}
                  {permissions.delete && !revoked && (
                    <DropdownMenuItem onSelect={() => setPending({ kind: "revoke", item })}><BanIcon />{t("actions.revoke")}</DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                {permissions.delete && (
                  <>
                    {!revoked && <DropdownMenuSeparator />}
                    <DropdownMenuGroup>
                      <DropdownMenuItem variant="destructive" onSelect={() => setPending({ kind: "delete", item })}>
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
  ], [t, tg, format, dialog, permissions, date]);

  const confirm = async () => {
    if (!pending) return;
    const { kind, item } = pending;
    if (kind === "rotate") {
      const res = await rotateApiClientSecret(item.id);
      if (!res.ok) { notify.error(message(res.error)); return; }
      setIssued({ ...res.data, name: item.name });
      notify.success(t("toast.rotated"));
    } else {
      const res = kind === "revoke" ? await revokeApiClient(item.id) : await deleteApiClient(item.id);
      if (!res.ok) { notify.error(message(res.error)); return; }
      notify.success(t(kind === "revoke" ? "toast.revoked" : "toast.deleted"));
    }
    setPending(null);
    router.refresh();
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 pb-2">
        <span className="text-sm text-muted-foreground">{tg("list.counter", { current: items.length, total })}</span>
        {permissions.add && <Button onClick={openAdd}><PlusIcon data-icon="inline-start" />{t("v2.create")}</Button>}
      </div>
      <DataTable tableId="api-clients-v2" columns={columns} data={items} getRowId={(d) => d.id}
        onRowClick={permissions.edit ? (d) => { if (!d.revoked_at) dialog.open(`api-key/edit/${d.id}`); } : undefined}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={tg("list.emptySubtitle")} />
      <ConfirmDialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}
        title={pending ? t(`confirm.${pending.kind}Title`, { name: pending.item.name }) : ""}
        description={pending ? t(`confirm.${pending.kind}Text`) : undefined}
        word={pending?.kind === "delete" ? t("confirm.word") : undefined}
        destructive={pending?.kind !== "rotate"}
        confirmLabel={pending ? (pending.kind === "delete" ? tg("actions.delete") : t(`confirm.${pending.kind}`)) : undefined}
        onConfirm={confirm} />
      {issued && (
        <ModalShell size="md" onClose={() => setIssued(null)} icon={<EntityIcon kind="contributors" icon={KeyRoundIcon} size="md" />}
          title={t("secret.title", { name: issued.name })}
          footer={<Button onClick={() => setIssued(null)}>{t("secret.done")}</Button>}>
          <SecretReveal clientId={issued.clientId} clientSecret={issued.clientSecret} />
        </ModalShell>
      )}
    </>
  );
}
