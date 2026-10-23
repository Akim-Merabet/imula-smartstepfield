"use client";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { InfoIcon } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/data-table/data-table";
import { ClearFiltersButton, FacetFilter, FilterBar } from "@/components/data-table/filter-bar";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import type { BackgroundTaskRow } from "../queries";
import { ListToolbar } from "./list-toolbar";

export const TASK_STATUS_COLORS: Record<string, string> = {
  acknowledged: "#ffb141", in_progress: "#1f5086", to_retry: "#d76e13", done: "#57b09d", error: "#af1018",
};

export function durationMs(a?: string | null, b?: string | null) {
  if (!a || !b) return null;
  return Math.max(0, new Date(b).getTime() - new Date(a).getTime());
}

export function useDuration() {
  const t = useTranslations("settings.backgroundTasks");
  return (ms: number | null) => {
    if (ms === null) return "—";
    const s = Math.round(ms / 1000);
    return s < 60 ? t("seconds", { s }) : t("minutes", { m: Math.floor(s / 60), s: s % 60 });
  };
}

export function BackgroundTasksTable({ items, total }: { items: BackgroundTaskRow[]; total: number }) {
  const t = useTranslations("settings.backgroundTasks");
  const tg = useTranslations("global");
  const format = useFormatter();
  const dialog = useDialog();
  const duration = useDuration();
  const date = (v: string | null) => (v ? format.dateTime(new Date(v), { dateStyle: "short", timeStyle: "medium" }) : "—");

  const columns = useMemo<ColumnDef<BackgroundTaskRow, unknown>[]>(() => [
    { id: "kind", header: t("columns.kind"), size: 200, cell: ({ row }) => (t.has(`kinds.${row.original.kind}`) ? t(`kinds.${row.original.kind}` as never) : row.original.kind) },
    { id: "type", header: t("columns.type"), size: 90, cell: ({ row }) => row.original.file_type?.toUpperCase() ?? "—" },
    { id: "name", header: t("columns.name"), size: 260, cell: ({ row }) => <span className="truncate">{row.original.name ?? "—"}</span> },
    { id: "status", header: t("columns.status"), size: 150, cell: ({ row }) => <StatusBadge color={TASK_STATUS_COLORS[row.original.status]} label={t(`statuses.${row.original.status}`)} /> },
    { id: "user", header: t("columns.user"), size: 180, cell: ({ row }) => row.original.user ? `${row.original.user.first_name} ${row.original.user.last_name}` : "—" },
    { id: "project", header: t("columns.project"), size: 200, cell: ({ row }) => row.original.project?.designation ?? "—" },
    { id: "created", header: t("columns.createdAt"), size: 170, cell: ({ row }) => date(row.original.created_at) },
    { id: "duration", header: t("columns.duration"), size: 120, cell: ({ row }) => duration(durationMs(row.original.started_at, row.original.finished_at)) },
    { id: "attempts", header: t("columns.attempts"), size: 100, cell: ({ row }) => row.original.attempts },
    {
      id: "actions", header: tg("list.actions"), size: 90, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => (
        <Button variant="ghost" size="icon-sm" aria-label={tg("actions.properties")} onClick={(e) => { e.stopPropagation(); dialog.open(`background-task/properties/${row.original.id}`); }}>
          <InfoIcon />
        </Button>
      ),
    },
  ], [t, tg, dialog, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <FilterBar end={<ClearFiltersButton params={["status"]} />}>
        <FacetFilter param="status" label={t("columns.status")}
          options={Object.keys(TASK_STATUS_COLORS).map((s) => ({ value: s, label: t(`statuses.${s}` as never), color: TASK_STATUS_COLORS[s] }))} />
      </FilterBar>
      <ListToolbar current={items.length} total={total} />
      <DataTable tableId="settings-background-tasks" columns={columns} data={items} getRowId={(r) => r.id}
        onRowClick={(r) => dialog.open(`background-task/properties/${r.id}`)}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={t("empty")} />
    </>
  );
}
