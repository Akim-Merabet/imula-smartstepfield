"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowRightLeftIcon, AwardIcon, BanIcon, EllipsisIcon, FileSpreadsheetIcon, InfoIcon, LockOpenIcon, PencilIcon, PlusIcon,
  PowerIcon, QrCodeIcon, RefreshCwIcon, RotateCcwIcon, ShuffleIcon, Trash2Icon,
} from "lucide-react";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  deleteCollaborator, resendActivation, setCollaboratorStatus,
} from "../actions";
import QRCode from "qrcode";
import { notify } from "@/components/common/notify";
import { collaboratorQrPayload, printQrSheet } from "@/features/mobile-qr/payloads";
import { COLLABORATOR_STATUS_COLORS, familyLabel, type CollaboratorKind } from "../meta";
import type { CollaboratorListItem, CollaboratorOptions } from "../queries";
import { DependenciesDialog, useActionRunner } from "./action-runner";
import { MoveDialog } from "./move-dialog";
import { ReorganizeDialog } from "./reorganize-dialog";

type Confirm = { type: "deactivate" | "activate" | "resend" | "delete" | "restore" | "unlock"; item: CollaboratorListItem };

/** Un bouton désactivé avec infobulle (fonctionnalité non disponible). */
function SoonButton({ icon: Icon, label, tooltip }: { icon: typeof PlusIcon; label: string; tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}><Button variant="secondary" disabled><Icon data-icon="inline-start" />{label}</Button></span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
export { SoonButton };

export function CollaboratorsTable({ kind, items, total, currentId, options, permissions }: {
  kind: CollaboratorKind; items: CollaboratorListItem[]; total: number; currentId: string; options: CollaboratorOptions;
  permissions: { add: boolean; edit: boolean; delete: boolean; restore: boolean; unlock: boolean; move: boolean; skills: boolean };
}) {
  const t = useTranslations("collaborators");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const tq = useTranslations("mobileQr");
  const { run, deps, clearDeps } = useActionRunner();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [reorganizeOpen, setReorganizeOpen] = useState(false);
  const [moving, setMoving] = useState<CollaboratorListItem | null>(null);
  const isUser = kind === "user";

  const openAdd = useCallback(() => dialog.open(`${kind}/add/general-tab`), [dialog, kind]);
  useRegisterPageAdd(permissions.add ? openAdd : null);

  const name = (c: CollaboratorListItem) => `${c.first_name} ${c.last_name}`;

  const columns = useMemo<ColumnDef<CollaboratorListItem, unknown>[]>(() => [
    {
      id: "function", header: t("columns.function"), size: 120,
      cell: ({ row }) => <FamilyChip color={row.original.function?.color} shortName={row.original.function?.short_name} longName={row.original.function?.long_name} />,
    },
    {
      id: "name", header: t("columns.name"), size: 260,
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="min-w-0">
            <div className="truncate font-medium group-hover:underline">{name(c)}</div>
            <div className="truncate text-xs text-muted-foreground">{[c.trigram, c.email].filter(Boolean).join(" · ")}</div>
          </div>
        );
      },
    },
    {
      id: "hierarchy", header: t("columns.hierarchy"), size: 160,
      cell: ({ row }) => <span className="line-clamp-2">{row.original.hierarchies.map((h) => h.hierarchy?.short_name).filter(Boolean).join(" ; ") || "—"}</span>,
    },
    ...(isUser ? [{
      id: "authority", header: t("columns.authority"), size: 150,
      cell: ({ row }) => (row.original.authority ? t(`authority.${row.original.authority}`) : "—"),
    } as ColumnDef<CollaboratorListItem, unknown>] : []),
    {
      id: "status", header: t("columns.status"), size: 140,
      cell: ({ row }) => {
        const c = row.original;
        const badge = <StatusBadge color={COLLABORATOR_STATUS_COLORS[c.status]} label={t(`status.${c.status}`)} />;
        if (c.status !== "onboarding" || !isUser || !permissions.edit) return badge;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1 hover:underline"
                onClick={(e) => { e.stopPropagation(); setConfirm({ type: "resend", item: c }); }}>
                {badge}<RefreshCwIcon className="size-3.5 text-warning" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("actions.resendTooltip")}</TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      id: "skills", header: t("columns.skills"), size: 180,
      cell: ({ row }) => {
        const label = row.original.skills.map((s) => familyLabel(s.skill)).filter(Boolean).join(" ; ");
        return label ? <span className="line-clamp-2" title={label}>{label}</span> : "—";
      },
    },
    { id: "company", header: t("columns.company"), size: 160, cell: ({ row }) => row.original.company?.name ?? "—" },
    {
      id: "actions", header: tg("list.actions"), size: 110, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => {
        const c = row.original;
        const deleted = c.status === "deleted";
        const self = c.id === currentId;
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {permissions.edit && !deleted && (
              <Button variant="ghost" size="icon-sm" aria-label={t("actions.edit")} onClick={() => dialog.open(`${kind}/edit/${c.id}/general-tab`)}>
                <PencilIcon />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  {permissions.skills && !deleted && (
                    <DropdownMenuItem onSelect={() => dialog.open(`skills/list/${c.id}`)}><AwardIcon />{t("actions.skills")}</DropdownMenuItem>
                  )}
                  {isUser && c.status === "active" && (
                    <DropdownMenuItem onSelect={() => dialog.open(`quick-connection/user/${c.id}`)}><QrCodeIcon />{t("actions.quickConnection")}</DropdownMenuItem>
                  )}
                  {permissions.move && !deleted && options.accounts.length > 1 && (
                    <DropdownMenuItem onSelect={() => setMoving(c)}><ArrowRightLeftIcon />{t("actions.move")}</DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => dialog.open(`${kind}/properties/${c.id}`)}><InfoIcon />{t("actions.properties")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => dialog.open(`qr-code/collaborator/${c.id}`)}><QrCodeIcon />{t("actions.qrCode")}</DropdownMenuItem>
                </DropdownMenuGroup>
                {permissions.edit && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      {c.status === "active" && !self && (
                        <DropdownMenuItem onSelect={() => setConfirm({ type: "deactivate", item: c })}><BanIcon />{t("actions.deactivate")}</DropdownMenuItem>
                      )}
                      {isUser && (c.status === "inactive" || c.status === "onboarding") && (
                        <DropdownMenuItem onSelect={() => setConfirm({ type: "resend", item: c })}><PowerIcon />{t("actions.activate")}</DropdownMenuItem>
                      )}
                      {!isUser && c.status === "inactive" && (
                        <DropdownMenuItem onSelect={() => setConfirm({ type: "activate", item: c })}><PowerIcon />{t("actions.activate")}</DropdownMenuItem>
                      )}
                      {permissions.unlock && c.status === "blocked" && (
                        <DropdownMenuItem onSelect={() => setConfirm({ type: "unlock", item: c })}><LockOpenIcon />{t("actions.unlock")}</DropdownMenuItem>
                      )}
                    </DropdownMenuGroup>
                  </>
                )}
                {(permissions.restore && deleted) || (permissions.delete && !deleted && !self) ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      {permissions.restore && deleted && (
                        <DropdownMenuItem onSelect={() => setConfirm({ type: "restore", item: c })}><RotateCcwIcon />{t("actions.restore")}</DropdownMenuItem>
                      )}
                      {permissions.delete && !deleted && !self && (
                        <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ type: "delete", item: c })}><Trash2Icon />{t("actions.delete")}</DropdownMenuItem>
                      )}
                    </DropdownMenuGroup>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], [t, tg, dialog, kind, isUser, permissions, currentId, options.accounts.length]);

  const onConfirm = async () => {
    if (!confirm) return;
    const { type, item } = confirm;
    if (type === "delete") await run(() => deleteCollaborator(item.id), t("toast.deleted"));
    else if (type === "resend") await run(() => resendActivation(item.id), t("toast.resent"));
    else {
      const msg = { deactivate: "toast.deactivated", activate: "toast.activated", restore: "toast.restored", unlock: "toast.unlocked" } as const;
      await run(() => setCollaboratorStatus(item.id, type), t(msg[type]));
    }
  };

  const confirmTitle = confirm ? ({
    deactivate: t("confirm.deactivateTitle", { name: name(confirm.item) }),
    activate: t("confirm.activateTitle", { name: name(confirm.item) }),
    resend: t("confirm.activateTitle", { name: name(confirm.item) }),
    delete: t("confirm.deleteTitle", { name: name(confirm.item) }),
    restore: t("confirm.restoreTitle", { name: name(confirm.item) }),
    unlock: t("confirm.unlockTitle", { name: name(confirm.item) }),
  })[confirm.type] : "";
  const confirmText = confirm ? ({
    deactivate: t("confirm.deactivateText"),
    resend: t("confirm.resendText", { email: confirm.item.email ?? "" }),
    delete: t("confirm.deleteText"),
  } as Record<string, string>)[confirm.type] : undefined;

  // « Exporter les QR Code ID des … activé(e)s » : page imprimable (et exportable en PDF) des collaborateurs actifs listés.
  const exportQrCodes = async () => {
    const active = items.filter((c) => c.status === "active");
    if (!active.length) return notify.error(tq("exportEmpty"));
    const images = await Promise.all(active.map((c) => QRCode.toDataURL(collaboratorQrPayload(c.id), { width: 360, margin: 1 })));
    const ok = printQrSheet(tq("exportTitle"), active.map((c, i) => ({ label: `${c.first_name} ${c.last_name}`, sublabel: c.trigram, image: images[i] })));
    if (!ok) notify.error(tq("popupBlocked"));
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 pb-2">
        <span className="text-sm text-muted-foreground">{tg("list.counter", { current: items.length, total })}</span>
        <div className="flex items-center gap-2">
          {permissions.add && <Button onClick={openAdd}><PlusIcon data-icon="inline-start" />{t("toolbar.create")}</Button>}
          {permissions.add && <SoonButton icon={FileSpreadsheetIcon} label={t("toolbar.import")} tooltip={t("toolbar.importSoon")} />}
          {permissions.edit && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button variant="secondary" disabled={selected.length === 0} onClick={() => setReorganizeOpen(true)}>
                    <ShuffleIcon data-icon="inline-start" />{t("toolbar.reorganize")}
                  </Button>
                </span>
              </TooltipTrigger>
              {selected.length === 0 && <TooltipContent>{t("toolbar.reorganizeHint")}</TooltipContent>}
            </Tooltip>
          )}
          <Button variant="secondary" onClick={() => void exportQrCodes()}><QrCodeIcon data-icon="inline-start" />{t("toolbar.qrExport")}</Button>
        </div>
      </div>
      <DataTable
        tableId={`collaborators-${kind}`}
        columns={columns}
        data={items}
        getRowId={(c) => c.id}
        selectable={permissions.edit}
        onSelectionChange={setSelected}
        onRowClick={(c) => dialog.open(permissions.edit && c.status !== "deleted" ? `${kind}/edit/${c.id}/general-tab` : `${kind}/properties/${c.id}`)}
        emptyTitle={tg("list.emptyTitle")}
        emptyDescription={tg("list.emptySubtitle")}
      />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title={confirmTitle}
        description={confirmText}
        word={confirm?.type === "delete" ? t("confirm.word") : undefined}
        destructive={confirm?.type === "delete" || confirm?.type === "deactivate"}
        confirmLabel={confirm ? t(`actions.${confirm.type === "resend" ? "activate" : confirm.type}`) : undefined}
        onConfirm={onConfirm}
      />
      <DependenciesDialog deps={deps} onClose={clearDeps} />
      <ReorganizeDialog open={reorganizeOpen} onOpenChange={setReorganizeOpen} kind={kind} ids={selected} options={options} />
      <MoveDialog item={moving} onClose={() => setMoving(null)} accounts={options.accounts} />
    </>
  );
}
