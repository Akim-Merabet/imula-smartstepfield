"use client";

import { useCallback, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRightIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, CopyIcon, InfoIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { FacetFilter } from "@/components/data-table/filter-bar";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LibraryOptions, ObjectRow } from "../queries";
import { LibraryFilterBar, RowActions } from "../shared/filters";
import { useLibraryRun } from "../shared/ui";
import { deleteObject } from "./actions";

type Perms = { add: boolean; edit: boolean; duplicate: boolean; delete: boolean };
type TreeRow = ObjectRow & { depth: number; hasChildren: boolean };

/** Ordre d'affichage en profondeur (parent puis enfants), en ne gardant que les branches dépliées. */
function flatten(items: ObjectRow[], collapsed: Set<string>): TreeRow[] {
  const ids = new Set(items.map((o) => o.id));
  const children = new Map<string | null, ObjectRow[]>();
  for (const o of items) {
    const key = o.parent_id && ids.has(o.parent_id) ? o.parent_id : null;
    children.set(key, [...(children.get(key) ?? []), o]);
  }
  const out: TreeRow[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const o of children.get(parent) ?? []) {
      const hasChildren = (children.get(o.id) ?? []).length > 0;
      out.push({ ...o, depth, hasChildren });
      if (hasChildren && !collapsed.has(o.id)) walk(o.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function ObjectsTable({ items, current, total, options, statuses, permissions }: {
  items: ObjectRow[]; current: number; total: number; options: LibraryOptions; statuses: { id: string; name: string; color: string }[]; permissions: Perms;
}) {
  const t = useTranslations("technicalObjects");
  const ts = useTranslations("libraryShared");
  const tg = useTranslations("global");
  const format = useFormatter();
  const dialog = useDialog();
  const { run } = useLibraryRun("technicalObjects");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<ObjectRow | null>(null);
  const openAdd = useCallback(() => dialog.open("library-object/add/general-tab"), [dialog]);
  useRegisterPageAdd(permissions.add ? openAdd : null);
  const rows = useMemo(() => flatten(items, collapsed), [items, collapsed]);
  const parents = useMemo(() => new Set(items.filter((o) => o.parent_id).map((o) => o.parent_id!)), [items]);
  const toggle = useCallback((id: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);

  const columns = useMemo<ColumnDef<TreeRow, unknown>[]>(() => [
    {
      id: "name", header: t("columns.name"), size: 360, meta: { locked: true }, cell: ({ row }) => {
        const o = row.original;
        return (
          <div className="flex min-w-0 items-center gap-1" style={{ paddingLeft: o.depth * 20 }}>
            {o.hasChildren ? (
              <Button variant="ghost" size="icon-xs" aria-label={collapsed.has(o.id) ? t("tree.expand") : t("tree.reduce")}
                onClick={(e) => { e.stopPropagation(); toggle(o.id); }}>
                <ChevronRightIcon className={cn("transition-transform", !collapsed.has(o.id) && "rotate-90")} />
              </Button>
            ) : <span className="size-6 shrink-0" />}
            <div className="min-w-0">
              <div className="truncate font-medium">{o.name}</div>
              {o.identification_number && <div className="truncate text-xs text-muted-foreground">{o.identification_number}</div>}
            </div>
          </div>
        );
      },
    },
    { id: "family", header: t("columns.family"), size: 130, cell: ({ row }) => <FamilyChip color={row.original.family?.color} shortName={row.original.family?.short_name} longName={row.original.family?.long_name} /> },
    { id: "itemCode", header: t("columns.itemCode"), size: 150, cell: ({ row }) => row.original.item_code ?? "—" },
    { id: "externalReference", header: t("columns.externalReference"), size: 170, cell: ({ row }) => row.original.external_reference ?? "—" },
    { id: "index", header: t("columns.index"), size: 80, cell: ({ row }) => row.original.object_index ?? "—" },
    { id: "status", header: t("columns.status"), size: 150, cell: ({ row }) => <StatusBadge color={row.original.status?.color} label={row.original.status?.name} /> },
    { id: "lastUpdate", header: t("columns.lastUpdate"), size: 130, cell: ({ row }) => format.dateTime(new Date(row.original.updated_at), { dateStyle: "short" }) },
    {
      id: "actions", header: ts("actions"), size: 80, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => {
        const o = row.original;
        return (
          <RowActions label={tg("actions.more")} actions={[
            { id: "edit", label: t("actions.edit"), icon: PencilIcon, onSelect: () => dialog.open(`library-object/edit/${o.id}/general-tab`) },
            { id: "child", label: t("actions.addChild"), icon: PlusIcon, onSelect: () => dialog.open(`library-object/add-child/${o.id}/general-tab`), hidden: !permissions.add },
            { id: "duplicate", label: t("actions.duplicate"), icon: CopyIcon, onSelect: () => dialog.open(`library-object/duplicate/${o.id}`), hidden: !permissions.duplicate },
            { id: "properties", label: t("actions.properties"), icon: InfoIcon, onSelect: () => dialog.open(`library-object/properties/${o.id}`) },
            { id: "delete", label: t("actions.delete"), icon: Trash2Icon, destructive: true, onSelect: () => setToDelete(o), hidden: !permissions.delete },
          ]} />
        );
      },
    },
  ], [t, ts, tg, format, dialog, permissions, collapsed, toggle]);

  return (
    <>
      <LibraryFilterBar families={options.families} accounts={options.accounts} extraParams={["status"]}
        extra={<FacetFilter param="status" label={t("filters.status")} options={statuses.map((s) => ({ value: s.id, label: s.name, color: s.color }))} />} />
      <div className="flex items-center justify-between pb-2 text-sm text-muted-foreground">
        <span>{ts("counter", { current, total })}</span>
        <div className="flex items-center gap-2">
          {parents.size > 0 && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setCollapsed(new Set())}><ChevronsUpDownIcon data-icon="inline-start" />{t("tree.expandAll")}</Button>
              <Button variant="ghost" size="sm" onClick={() => setCollapsed(new Set(parents))}><ChevronsDownUpIcon data-icon="inline-start" />{t("tree.reduceAll")}</Button>
            </>
          )}
          {permissions.add && <Button size="sm" onClick={openAdd}>{t("add")}</Button>}
        </div>
      </div>
      <DataTable tableId="library-objects" columns={columns} data={rows} getRowId={(r) => r.id}
        onRowClick={(r) => dialog.open(`library-object/edit/${r.id}/general-tab`)}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={tg("list.emptySubtitle")} />
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }} title={t("delete.title", { name: toDelete?.name ?? "" })}
        description={tg("confirm.noTrash")} word="SUPPRIMER" confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete) await run(() => deleteObject(toDelete.id), t("delete.success")); }} />
    </>
  );
}
