"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CopyPlusIcon, DownloadIcon, EllipsisIcon, EyeIcon, HistoryIcon, InfoIcon, LayoutListIcon, PencilIcon, PowerIcon, PowerOffIcon,
  RefreshCwIcon, SendIcon, Share2Icon, Trash2Icon,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  createLocalCopy, deleteProjectForm, refreshAllProjectForms, refreshProjectForm, setProjectFormEnabled, type DeleteBlockers,
} from "../actions";
import type { ProjectFormItem } from "../queries";
import { FormFlags, NatureChip, useActionError } from "./form-chips";

type Permissions = { import: boolean; edit: boolean; editContent: boolean; duplicate: boolean; deactivate: boolean; delete: boolean; reply: boolean; share?: boolean };

export function ProjectFormsTable({ projectId, items, permissions }: { projectId: string; items: ProjectFormItem[]; permissions: Permissions }) {
  const t = useTranslations("forms");
  const tg = useTranslations("global");
  const tShare = useTranslations("share.actions");
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dialog = useDialog();
  const errorText = useActionError();
  const [toDelete, setToDelete] = useState<ProjectFormItem | null>(null);
  const [toRefresh, setToRefresh] = useState<ProjectFormItem | "all" | null>(null);
  const [blockers, setBlockers] = useState<(DeleteBlockers & { name: string }) | null>(null);

  const openImport = useCallback(() => dialog.open(`form-lib/import/${projectId}`), [dialog, projectId]);
  useRegisterPageAdd(permissions.import ? openImport : null);

  const returnTo = `${pathname}?${searchParams.toString()}`;
  const builderHref = (f: ProjectFormItem, view?: boolean) => `/form/${f.id}?${new URLSearchParams({ ...(view ? { mode: "view" } : {}), returnTo })}`;
  const canReply = (f: ProjectFormItem) => permissions.reply && f.enabled && (f.nature === "generic" || f.nature === "local");
  const updatable = items.filter((f) => f.update_available && f.enabled);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    const res = await fn();
    if (res.ok) { notify.success(success); router.refresh(); } else notify.error(errorText(res.error ?? "unknown"));
  };

  const columns = useMemo<ColumnDef<ProjectFormItem, unknown>[]>(() => [
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
              <div className="text-xs text-muted-foreground">{t(`provenance.${f.origin ?? "imported"}` as never)}</div>
            </div>
          </div>
        );
      },
    },
    { id: "reference", header: t("columns.reference"), size: 140, cell: ({ row }) => row.original.reference || "—" },
    { id: "index", header: t("columns.index"), size: 80, cell: ({ row }) => row.original.index_label || "—" },
    {
      id: "updatedAt", header: t("columns.updatedAt"), size: 150,
      cell: ({ row }) => format.dateTime(new Date(row.original.updated_at), { dateStyle: "short", timeStyle: "short" }),
    },
    { id: "status", header: t("columns.status"), size: 140, cell: ({ row }) => <StatusBadge color={row.original.status?.color} label={row.original.status?.name} /> },
    {
      id: "state", header: t("columns.state"), size: 100,
      cell: ({ row }) => <Badge variant={row.original.enabled ? "secondary" : "outline"}>{row.original.enabled ? t("state.enabled") : t("state.disabled")}</Badge>,
    },
    {
      id: "actions", header: tg("list.actions"), size: 150, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => {
        const f = row.original;
        const local = f.origin === "local";
        return (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {f.update_available && permissions.import && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="text-warning" aria-label={t("actions.refresh")}
                    onClick={() => f.enabled ? setToRefresh(f) : notify.warning(t("errors.disabled_refresh"))}>
                    <RefreshCwIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("tooltips.updateAvailable")}</TooltipContent>
              </Tooltip>
            )}
            {canReply(f) && (
              <Button variant="ghost" size="icon-sm" aria-label={t("actions.reply")} onClick={() => dialog.open(`form-lib/reply/${f.id}`)}><SendIcon /></Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  {canReply(f) && <DropdownMenuItem onSelect={() => dialog.open(`form-lib/reply/${f.id}`)}><SendIcon />{t("actions.reply")}</DropdownMenuItem>}
                  {permissions.edit && <DropdownMenuItem onSelect={() => dialog.open(`form-lib/edit/${f.id}/general-tab`)}><PencilIcon />{t("actions.editInfo")}</DropdownMenuItem>}
                  {local && permissions.editContent && (
                    <DropdownMenuItem asChild><Link href={builderHref(f)}><LayoutListIcon />{t("actions.editContent")}</Link></DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild><Link href={builderHref(f, true)}><EyeIcon />{t("actions.overview")}</Link></DropdownMenuItem>
                  {!local && permissions.duplicate && (
                    <DropdownMenuItem onSelect={() => run(() => createLocalCopy(f.id), t("toasts.localCopy"))}><CopyPlusIcon />{t("actions.localCopy")}</DropdownMenuItem>
                  )}
                  {!local && permissions.import && (
                    <DropdownMenuItem disabled={!f.update_available} onSelect={() => f.enabled ? setToRefresh(f) : notify.warning(t("errors.disabled_refresh"))}>
                      <RefreshCwIcon />{t("actions.refresh")}
                    </DropdownMenuItem>
                  )}
                  {permissions.deactivate && (
                    <DropdownMenuItem onSelect={() => run(() => setProjectFormEnabled(f.id, !f.enabled), f.enabled ? t("toasts.disabled") : t("toasts.enabled"))}>
                      {f.enabled ? <PowerOffIcon /> : <PowerIcon />}{f.enabled ? t("actions.deactivate") : t("actions.activate")}
                    </DropdownMenuItem>
                  )}
                  {(permissions.share ?? permissions.edit) && (
                    <DropdownMenuItem onSelect={() => dialog.open(`share/form/${f.id}`)}><Share2Icon />{tShare("share")}</DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => dialog.open(`form-lib/history/${f.id}`)}><HistoryIcon />{t("actions.history")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => dialog.open(`form-lib/properties/${f.id}`)}><InfoIcon />{t("actions.properties")}</DropdownMenuItem>
                </DropdownMenuGroup>
                {permissions.delete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(f)}><Trash2Icon />{t("actions.delete")}</DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], [t, tg, tShare, format, dialog, permissions]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="flex items-center justify-between gap-2 pb-2 text-sm text-muted-foreground">
        <span>{tg("list.counter", { current: items.length, total: items.length })}</span>
        <div className="flex items-center gap-2">
          {permissions.import && updatable.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setToRefresh("all")}>
              <RefreshCwIcon data-icon="inline-start" className="text-warning" />{t("actions.refreshAll", { count: updatable.length })}
            </Button>
          )}
          {permissions.import && (
            <Button size="sm" onClick={openImport}><DownloadIcon data-icon="inline-start" />{t("actions.import")}</Button>
          )}
        </div>
      </div>
      <DataTable
        tableId="project-forms"
        columns={columns}
        data={items}
        getRowId={(f) => f.id}
        onRowClick={(f) => router.push(builderHref(f, !(f.origin === "local" && permissions.editContent)))}
        emptyTitle={tg("list.emptyTitle")}
        emptyDescription={t("emptyProject")}
      />
      <ConfirmDialog
        open={!!toRefresh}
        onOpenChange={(o) => { if (!o) setToRefresh(null); }}
        title={t("refresh.title")}
        description={<>{t("refresh.subtitle")}<br />{t("refresh.flows")}</>}
        word="METTRE A JOUR"
        destructive={false}
        confirmLabel={t("actions.refresh")}
        onConfirm={async () => {
          if (!toRefresh) return;
          if (toRefresh === "all") {
            const res = await refreshAllProjectForms(projectId, updatable.map((f) => f.id));
            if (res.ok) { notify.success(t("toasts.refreshedMany", { count: res.data.updated })); router.refresh(); } else notify.error(errorText(res.error));
          } else await run(() => refreshProjectForm(toRefresh.id), t("toasts.refreshed"));
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("delete.title", { name: toDelete?.name ?? "" })}
        description={tg("confirm.noTrash")}
        word="SUPPRIMER"
        confirmLabel={tg("actions.delete")}
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteProjectForm(toDelete.id);
          if (res.ok) { notify.success(t("toasts.deleted")); router.refresh(); return; }
          if (res.error === "form_in_use") setBlockers({ ...((res.details as DeleteBlockers) ?? { steps: [], responses: 0 }), name: toDelete.name });
          else notify.error(errorText(res.error));
        }}
      />
      <AlertDialog open={!!blockers} onOpenChange={(o) => { if (!o) setBlockers(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.inUseTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {blockers?.responses ? t("delete.inUseResponses") : t("delete.inUseSteps", { name: blockers?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!!blockers?.steps.length && (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>{t("delete.flow")}</th><th>{t("delete.phase")}</th><th>{t("delete.step")}</th></tr></thead>
              <tbody>{blockers.steps.map((s, i) => <tr key={i}><td>{s.flow}</td><td>{s.phase}</td><td>{s.step}</td></tr>)}</tbody>
            </table>
          )}
          <AlertDialogFooter><AlertDialogAction>{tg("actions.close")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
