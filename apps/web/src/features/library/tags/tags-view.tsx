"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRightIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, LinkIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TagRow } from "../queries";
import { LibraryFilterBar, RowActions } from "../shared/filters";
import { useLibraryRun } from "../shared/ui";
import { deleteTag } from "./actions";

type Perms = { add: boolean; edit: boolean; delete: boolean };
type Row = TagRow & { depth: number; hasChildren: boolean; links: number };

const linkCount = (t: TagRow) => (t.flows?.[0]?.count ?? 0) + (t.phases?.[0]?.count ?? 0) + (t.steps?.[0]?.count ?? 0);

function flatten(items: TagRow[], collapsed: Set<string>): Row[] {
  const ids = new Set(items.map((t) => t.id));
  const children = new Map<string | null, TagRow[]>();
  for (const t of items) {
    const key = t.parent_id && ids.has(t.parent_id) ? t.parent_id : null;
    children.set(key, [...(children.get(key) ?? []), t]);
  }
  const out: Row[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const t of children.get(parent) ?? []) {
      const hasChildren = (children.get(t.id) ?? []).length > 0;
      out.push({ ...t, depth, hasChildren, links: linkCount(t) });
      if (hasChildren && !collapsed.has(t.id)) walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Bibliothèque › Étiquettes : arbre parent / enfant coloré, liens en lecture. */
export function TagsView({ items, current, total, accounts, permissions }: {
  items: TagRow[]; current: number; total: number; accounts: { id: string; name: string }[]; permissions: Perms;
}) {
  const t = useTranslations("tags");
  const ts = useTranslations("libraryShared");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const { run } = useLibraryRun("tags");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const openAdd = useCallback(() => dialog.open("library-tag/add"), [dialog]);
  useRegisterPageAdd(permissions.add ? openAdd : null);
  const rows = useMemo(() => flatten(items, collapsed), [items, collapsed]);
  const parents = useMemo(() => new Set(items.filter((x) => x.parent_id).map((x) => x.parent_id!)), [items]);
  const accountName = useCallback((id: string | null) => (id ? accounts.find((a) => a.id === id)?.name ?? "—" : t("organization")), [accounts, t]);
  const toggle = useCallback((id: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => [
    {
      id: "name", header: t("columns.name"), size: 420, meta: { locked: true }, cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex min-w-0 items-center gap-1" style={{ paddingLeft: r.depth * 20 }}>
            {r.hasChildren ? (
              <Button variant="ghost" size="icon-xs" aria-label={collapsed.has(r.id) ? t("tree.expand") : t("tree.reduce")}
                onClick={(e) => { e.stopPropagation(); toggle(r.id); }}>
                <ChevronRightIcon className={cn("transition-transform", !collapsed.has(r.id) && "rotate-90")} />
              </Button>
            ) : <span className="size-6 shrink-0" />}
            <span className="inline-flex max-w-full items-center truncate rounded px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: r.color }}>{r.name}</span>
            {r.description && <span className="truncate text-xs text-muted-foreground">{r.description}</span>}
          </div>
        );
      },
    },
    { id: "applicability", header: t("columns.applicability"), size: 180, cell: ({ row }) => accountName(row.original.account_id) },
    {
      id: "links", header: t("columns.links"), size: 120, cell: ({ row }) => (row.original.links ? (
        <Button variant="link" size="sm" className="px-0" onClick={(e) => { e.stopPropagation(); dialog.open(`library-tag/linked-flows/${row.original.id}`); }}>
          <LinkIcon data-icon="inline-start" />{row.original.links}
        </Button>
      ) : <span className="text-muted-foreground">0</span>),
    },
    {
      id: "actions", header: ts("actions"), size: 80, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => {
        const r = row.original;
        return (
          <RowActions label={tg("actions.more")} actions={[
            { id: "child", label: t("actions.addChild"), icon: PlusIcon, onSelect: () => dialog.open(`library-tag/add-child/${r.id}`), hidden: !permissions.add },
            { id: "edit", label: t("actions.edit"), icon: PencilIcon, onSelect: () => dialog.open(`library-tag/edit/${r.id}`) },
            { id: "links", label: t("actions.linkedFlows"), icon: LinkIcon, onSelect: () => dialog.open(`library-tag/linked-flows/${r.id}`) },
            { id: "delete", label: t("actions.delete"), icon: Trash2Icon, destructive: true, onSelect: () => setToDelete(r), hidden: !permissions.delete },
          ]} />
        );
      },
    },
  ], [t, ts, tg, dialog, permissions, collapsed, toggle, accountName]);

  return (
    <>
      <LibraryFilterBar accounts={accounts} accountsExtra={[{ value: "organization", label: t("organization") }]} />
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
      <DataTable tableId="library-tags" columns={columns} data={rows} getRowId={(r) => r.id}
        onRowClick={(r) => dialog.open(`library-tag/edit/${r.id}`)}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={tg("list.emptySubtitle")} />
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }} title={t("delete.title", { name: toDelete?.name ?? "" })}
        description={tg("confirm.noTrash")} word="SUPPRIMER" confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete) await run(() => deleteTag(toDelete.id), t("delete.success")); }} />
    </>
  );
}
