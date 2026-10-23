"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { ArchiveRestoreIcon } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { ClearFiltersButton, FacetFilter, FilterBar, SearchFilter } from "@/components/data-table/filter-bar";
import { Button } from "@/components/ui/button";
import { restoreTrashItem } from "../actions/trash";
import type { TrashItem } from "../trash";
import { ListToolbar } from "./list-toolbar";
import { useRun } from "./use-run";

const NATURES = ["entity", "flow", "category", "form", "form_response"] as const;

export function TrashTable({ items, canRestore }: { items: TrashItem[]; canRestore: boolean }) {
  const t = useTranslations("settings.trash");
  const tg = useTranslations("global");
  const format = useFormatter();
  const run = useRun();
  const sp = useSearchParams();
  const natures = (sp.get("nature") ?? "").split(",").filter(Boolean);
  const users = (sp.get("user") ?? "").split(",").filter(Boolean);
  const search = (sp.get("textSearch") ?? "").toLowerCase();

  const filtered = items.filter((i) => (!natures.length || natures.includes(i.nature))
    && (!users.length || (i.deletedBy && users.includes(i.deletedBy)))
    && (!search || i.name.toLowerCase().includes(search)));
  const userOptions = [...new Map(items.filter((i) => i.deletedBy).map((i) => [i.deletedBy!, i.userName ?? "—"])).entries()]
    .map(([value, label]) => ({ value, label }));

  const columns = useMemo<ColumnDef<TrashItem, unknown>[]>(() => [
    { id: "nature", header: t("columns.nature"), size: 160, cell: ({ row }) => t(`natures.${row.original.nature}`) },
    {
      id: "name", header: t("columns.name"), size: 340, cell: ({ row }) => (
        <div className="min-w-0"><div className="truncate font-medium">{row.original.name}</div>
          {row.original.context && <div className="truncate text-xs text-muted-foreground">{row.original.context}</div>}</div>
      ),
    },
    { id: "date", header: t("columns.deletedAt"), size: 200, cell: ({ row }) => format.dateTime(new Date(row.original.deletedAt), { dateStyle: "short", timeStyle: "short" }) },
    { id: "user", header: t("columns.user"), size: 200, cell: ({ row }) => row.original.userName ?? "—" },
    {
      id: "actions", header: tg("list.actions"), size: 140, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => canRestore ? (
        <Button variant="ghost" size="sm" onClick={() => run(() => restoreTrashItem(row.original.nature, row.original.id), t("restored"))}>
          <ArchiveRestoreIcon data-icon="inline-start" />{t("restore")}
        </Button>
      ) : null,
    },
  ], [t, tg, format, canRestore, run]);

  return (
    <>
      <FilterBar end={<ClearFiltersButton params={["textSearch", "nature", "user"]} />}>
        <SearchFilter />
        <FacetFilter param="nature" label={t("columns.nature")} options={NATURES.map((n) => ({ value: n, label: t(`natures.${n}`) }))} />
        <FacetFilter param="user" label={t("columns.user")} options={userOptions} />
      </FilterBar>
      <ListToolbar current={filtered.length} total={items.length} />
      <DataTable tableId="settings-trash" columns={columns} data={filtered} getRowId={(r) => `${r.nature}-${r.id}`}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={t("empty")} />
    </>
  );
}
