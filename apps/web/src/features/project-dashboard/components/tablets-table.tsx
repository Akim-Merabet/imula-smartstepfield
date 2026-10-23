"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { BatteryIcon, MapPinIcon, QrCodeIcon, TabletIcon, Trash2Icon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { removeTablet } from "../actions";
import type { ProjectTabletRow } from "../queries";

type Tablet = NonNullable<ProjectTabletRow["tablet"]>;
const STATUS_COLORS: Record<string, string> = { active: "#57b09d", disabled: "#af1018", broken: "#af1018", down: "#ffb141", maintenance: "#ffb141" };

export function TabletsTable({ projectId, tablets, permissions }: {
  projectId: string; tablets: Tablet[]; permissions: { add: boolean; delete: boolean };
}) {
  const t = useTranslations("dashboard.tablets");
  const tg = useTranslations("global");
  const router = useRouter();
  const dialog = useDialog();
  const [toDelete, setToDelete] = useState<Tablet | null>(null);
  const openImport = useCallback(() => dialog.open(`project-tablet/import/${projectId}`), [dialog, projectId]);
  useRegisterPageAdd(permissions.add ? openImport : null);

  const columns = useMemo<ColumnDef<Tablet, unknown>[]>(() => [
    { id: "family", header: t("columns.family"), size: 130, cell: ({ row }) => <FamilyChip color={row.original.family?.color} shortName={row.original.family?.short_name} longName={row.original.family?.long_name} /> },
    { id: "name", header: t("columns.name"), size: 240, cell: ({ row }) => <span className="flex items-center gap-2 font-medium"><TabletIcon className="size-4" />{row.original.name}</span> },
    {
      id: "battery", header: t("columns.battery"), size: 140,
      cell: ({ row }) => row.original.battery_level == null ? "—" : <span className="flex items-center gap-1"><BatteryIcon className="size-4" />{row.original.battery_level} %</span>,
    },
    {
      id: "position", header: t("columns.position"), size: 140,
      cell: ({ row }) => {
        const { last_latitude: lat, last_longitude: lng } = row.original;
        if (lat == null || lng == null) return "—";
        return (
          <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-info hover:underline" onClick={(e) => e.stopPropagation()}>
            <MapPinIcon className="size-4" />{t("showOnMap")}
          </a>
        );
      },
    },
    { id: "company", header: t("columns.company"), size: 160, cell: ({ row }) => row.original.company?.name ?? "—" },
    {
      id: "status", header: t("columns.status"), size: 140,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-[2px]" style={{ backgroundColor: STATUS_COLORS[row.original.status] }} />{t(`status.${row.original.status}`)}
        </span>
      ),
    },
    {
      id: "actions", header: tg("list.actions"), size: 110, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}><Button variant="ghost" size="icon-sm" disabled aria-label={t("actions.qr")}><QrCodeIcon /></Button></span>
            </TooltipTrigger>
            <TooltipContent>{t("actions.qrUnavailable")}</TooltipContent>
          </Tooltip>
          {permissions.delete && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t("actions.delete")} onClick={() => setToDelete(row.original)}><Trash2Icon /></Button>
              </TooltipTrigger>
              <TooltipContent>{t("actions.delete")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
    },
  ], [t, tg, permissions.delete]);

  return (
    <>
      <div className="flex items-center justify-between pb-2 text-sm text-muted-foreground">
        <span>{tg("list.counter", { current: tablets.length, total: tablets.length })}</span>
        {permissions.add && <Button onClick={openImport}><TabletIcon data-icon="inline-start" />{t("actions.import")}</Button>}
      </div>
      <DataTable tableId="project-tablets" columns={columns} data={tablets} getRowId={(x) => x.id}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={tg("list.emptySubtitle")} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("delete.title", { name: toDelete?.name ?? "" })}
        description={t("delete.subtitle")}
        confirmLabel={tg("actions.delete")}
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await removeTablet(projectId, toDelete.id);
          if (res.ok) { notify.success(tg("toast.deleted")); router.refresh(); return; }
          if (res.error === "in_flows") {
            notify.error(tg("toast.error"), t("delete.inFlows", { flows: ((res.details as { flows: string[] } | undefined)?.flows ?? []).join(", ") }));
          } else notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error"));
        }}
      />
    </>
  );
}
