"use client";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { ClearFiltersButton, FacetFilter, FilterBar } from "@/components/data-table/filter-bar";
import { ListToolbar } from "@/features/settings/components/list-toolbar";
import type { MobileLogRow } from "./queries";

export const LOG_ACTIONS = [
  "SIGN_IN", "SIGN_OUT", "SWITCH_TO_ONLINE", "SWITCH_TO_OFFLINE", "PUSH_SUCCESS", "PUSH_REJECTED", "PUSH_FORBIDDEN",
  "START_CHECKOUT", "DELETE_FLOW_DATA", "SCAN_QRCODE_FLOW_SUCCESS", "SCAN_QRCODE_FLOW_FAIL", "CLICK_TO_SAVE_SIGNATURE",
  "BACKUP_LOCAL", "BACKUP_SUPPORT", "BACKUP_FAIL", "RESET_LOCAL_DATA", "RESTORE_BACKUP",
] as const;

/** « Logs push » (spec 05 §6.5) : journal d'actions envoyé par les appareils. */
export function LogsTable({ items, people }: { items: MobileLogRow[]; people: { value: string; label: string }[] }) {
  const t = useTranslations("mobileSupport.logs");
  const tg = useTranslations("global");
  const format = useFormatter();

  const columns = useMemo<ColumnDef<MobileLogRow, unknown>[]>(() => [
    { id: "date", header: t("columns.date"), size: 180, cell: ({ row }) => format.dateTime(new Date(row.original.occurred_at), { dateStyle: "short", timeStyle: "medium" }) },
    { id: "user", header: t("columns.user"), size: 200, cell: ({ row }) => {
      const p = row.original.principal as { first_name: string; last_name: string } | null;
      return p ? `${p.first_name} ${p.last_name}`.trim() : "—";
    } },
    { id: "action", header: t("columns.action"), size: 240, cell: ({ row }) => (t.has(`actions.${row.original.action}`) ? t(`actions.${row.original.action}` as never) : row.original.action) },
    { id: "detail", header: t("columns.detail"), size: 320, cell: ({ row }) => (
      <span className="line-clamp-2 font-mono text-xs" title={row.original.detail ? JSON.stringify(row.original.detail) : undefined}>
        {row.original.detail ? JSON.stringify(row.original.detail) : "—"}
      </span>
    ) },
    { id: "device", header: t("columns.device"), size: 170, cell: ({ row }) => row.original.device_id ?? "—" },
    { id: "version", header: t("columns.version"), size: 100, cell: ({ row }) => row.original.app_version ?? "—" },
  ], [t, format]);

  return (
    <>
      <FilterBar end={<ClearFiltersButton params={["action", "user"]} />}>
        <FacetFilter param="action" label={t("columns.action")} options={LOG_ACTIONS.map((a) => ({ value: a, label: t(`actions.${a}`) }))} />
        <FacetFilter param="user" label={t("columns.user")} options={people} />
      </FilterBar>
      <ListToolbar current={items.length} total={items.length} />
      <DataTable tableId="settings-mobile-logs" columns={columns} data={items} getRowId={(r) => r.id}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={t("empty")} />
    </>
  );
}
