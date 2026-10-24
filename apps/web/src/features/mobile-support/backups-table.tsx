"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { DownloadIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ListToolbar } from "@/features/settings/components/list-toolbar";
import { downloadMobileBackup } from "./actions";
import type { MobileBackupRow } from "./queries";

const size = (n: number | null) => (n == null ? "—" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1)} Mo`);

/** « Liste des backups MobileApp » (spec 05 §6.1) : Date, Rapporteur, Action utilisateur, Télécharger. */
export function BackupsTable({ items }: { items: MobileBackupRow[] }) {
  const t = useTranslations("mobileSupport.backups");
  const tg = useTranslations("global");
  const format = useFormatter();
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (id: string) => {
    setBusy(id);
    const res = await downloadMobileBackup(id);
    setBusy(null);
    if (!res.ok) return notify.error(t(res.error === "corrupted" ? "corrupted" : "downloadError"));
    const url = URL.createObjectURL(new Blob([res.data.json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = res.data.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = useMemo<ColumnDef<MobileBackupRow, unknown>[]>(() => [
    { id: "date", header: t("columns.date"), size: 180, cell: ({ row }) => format.dateTime(new Date(row.original.created_at), { dateStyle: "short", timeStyle: "medium" }) },
    { id: "reporter", header: t("columns.reporter"), size: 220, cell: ({ row }) => {
      const p = row.original.principal as { first_name: string; last_name: string } | null;
      return p ? `${p.first_name} ${p.last_name}`.trim() : "—";
    } },
    { id: "trigger", header: t("columns.trigger"), size: 200, cell: ({ row }) => t(`triggers.${row.original.trigger}` as never) },
    { id: "device", header: t("columns.device"), size: 180, cell: ({ row }) => row.original.device_id ?? "—" },
    { id: "version", header: t("columns.version"), size: 110, cell: ({ row }) => row.original.app_version ?? "—" },
    { id: "size", header: t("columns.size"), size: 100, cell: ({ row }) => size(row.original.size) },
    {
      id: "actions", header: tg("list.actions"), size: 120, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => void download(row.original.id)} disabled={!!busy}>
          {busy === row.original.id ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}{t("download")}
        </Button>
      ),
    },
  ], [t, tg, format, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <ListToolbar current={items.length} total={items.length} />
      <DataTable tableId="settings-mobile-backups" columns={columns} data={items} getRowId={(r) => r.id}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={t("empty")} />
    </>
  );
}
