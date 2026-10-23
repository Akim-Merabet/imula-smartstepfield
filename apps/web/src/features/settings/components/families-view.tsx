"use client";

import { Fragment, useCallback, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronDownIcon, ChevronRightIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, EllipsisIcon, PencilIcon, PlusIcon,
  PowerIcon, PowerOffIcon, Trash2Icon,
} from "lucide-react";
import { FamilyChip } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { ClearFiltersButton, FacetFilter, FilterBar, SearchFilter } from "@/components/data-table/filter-bar";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { deleteFamily, setFamilyActive } from "../actions/families";
import type { FamilyRow } from "../queries";
import { ListToolbar } from "./list-toolbar";
import { useRun } from "./use-run";

export type FamilyScope = { kind: "family" | "category"; projectId: string | null };

/** Jeton de portée transmis à la modale (« family », « category » ou « category~<projectId> »). */
export function scopeToken(scope: FamilyScope) {
  return scope.kind === "family" ? "family" : scope.projectId ? `category~${scope.projectId}` : "category";
}

/** Arbre Nature › parent › enfant des familles / catégories (spec 01 §6.6, §5.13). */
export function FamiliesView({ rows, scope, natures, permissions, toolbar }: {
  rows: FamilyRow[]; scope: FamilyScope; natures: string[];
  permissions: { add: boolean; edit: boolean; delete: boolean; archive: boolean };
  toolbar?: ReactNode;
}) {
  const t = useTranslations("settings.families");
  const tn = useTranslations("settings.natures");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const run = useRun();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<FamilyRow | null>(null);
  const token = scopeToken(scope);
  const isCategory = scope.kind === "category";

  const natureFilter = (searchParams.get("nature") ?? "").split(",").filter(Boolean);
  const search = (searchParams.get("textSearch") ?? "").trim().toLowerCase();

  const openAdd = useCallback((nature?: string, parentId?: string) => {
    dialog.open(["family/add", token, nature, parentId].filter(Boolean).join("/"));
  }, [dialog, token]);
  useRegisterPageAdd(permissions.add ? () => openAdd(natureFilter[0]) : null);

  const tree = useMemo(() => {
    const matches = (r: FamilyRow) => !search || r.short_name.toLowerCase().includes(search)
      || (r.long_name ?? "").toLowerCase().includes(search) || (r.code ?? "").toLowerCase().includes(search);
    const byParent = new Map<string, FamilyRow[]>();
    for (const r of rows) if (r.parent_id) byParent.set(r.parent_id, [...(byParent.get(r.parent_id) ?? []), r]);
    return natures
      .filter((n) => natureFilter.length === 0 || natureFilter.includes(n))
      .map((nature) => {
        const parents = rows.filter((r) => r.nature === nature && r.relative_nature === "parent")
          .map((p) => {
            const children = (byParent.get(p.id) ?? []).filter((c) => matches(c) || matches(p));
            return { parent: p, children, visible: matches(p) || children.length > 0 };
          })
          .filter((x) => x.visible);
        return { nature, parents };
      })
      .filter((g) => g.parents.length > 0 || (!search && natureFilter.includes(g.nature)));
  }, [rows, natures, natureFilter, search]);

  const visibleCount = tree.reduce((n, g) => n + g.parents.reduce((m, p) => m + 1 + p.children.length, 0), 0);
  const allParents = tree.flatMap((g) => g.parents.map((p) => p.parent.id));
  const allCollapsed = allParents.length > 0 && allParents.every((id) => collapsed.has(id));
  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const actions = (r: FamilyRow) => (
    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {permissions.edit && (
        <Button variant="ghost" size="icon-sm" aria-label={tg("actions.edit")} onClick={() => dialog.open(`family/edit/${r.id}`)}><PencilIcon /></Button>
      )}
      {(permissions.add || permissions.archive || permissions.delete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {permissions.add && r.relative_nature === "parent" && (
                <DropdownMenuItem onSelect={() => openAdd(r.nature, r.id)}><PlusIcon />{t(isCategory ? "actions.addChildCategory" : "actions.addChild")}</DropdownMenuItem>
              )}
              {permissions.archive && (
                <DropdownMenuItem onSelect={() => run(() => setFamilyActive(r.id, !r.active))}>
                  {r.active ? <PowerOffIcon /> : <PowerIcon />}{r.active ? tg("actions.deactivate") : tg("actions.activate")}
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            {permissions.delete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(r)}><Trash2Icon />{tg("actions.delete")}</DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  const line = (r: FamilyRow, depth: number, expandable: boolean, open: boolean) => (
    <tr key={r.id} className={cn("group hover:bg-row-hover", !r.active && "opacity-60", permissions.edit && "cursor-pointer")}
      onClick={permissions.edit ? () => dialog.open(`family/edit/${r.id}`) : undefined}>
      <td className="h-14 border-b border-row-hover px-4">
        <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * 20 }}>
          {expandable ? (
            <button type="button" className="rounded p-0.5 hover:bg-accent" aria-label={open ? t("collapse") : t("expand")}
              onClick={(e) => { e.stopPropagation(); toggle(r.id); }}>
              {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
            </button>
          ) : <span className="size-5" />}
          <FamilyChip color={r.color} shortName={r.short_name} longName={r.long_name} />
          <span className="truncate">{r.long_name}</span>
          {r.nature === "document" && !isCategory && !r.client_supervision && r.relative_nature === "child" && (
            <span className="truncate text-xs text-muted-foreground">{t("noClientFeedback")}</span>
          )}
        </div>
      </td>
      <td className="border-b border-row-hover px-4 text-muted-foreground">{r.code ?? "—"}</td>
      <td className="border-b border-row-hover px-4 text-muted-foreground">{t(`relative.${r.relative_nature}`)}</td>
      {isCategory && <td className="border-b border-row-hover px-4">{r.provenance ? t(`provenance.${r.provenance}`) : "—"}</td>}
      <td className="border-b border-row-hover px-4">
        <Badge variant={r.active ? "secondary" : "outline"}>{r.active ? t("active") : t("inactive")}</Badge>
      </td>
      <td className="sticky right-0 border-b border-row-hover bg-white px-2 group-hover:bg-row-hover">{actions(r)}</td>
    </tr>
  );

  return (
    <>
      <FilterBar end={<ClearFiltersButton params={["textSearch", "nature"]} />}>
        <SearchFilter />
        <FacetFilter param="nature" label={t("filters.nature")} options={natures.map((n) => ({ value: n, label: tn(n as never) }))} />
      </FilterBar>
      <ListToolbar current={visibleCount} total={rows.length} onAdd={permissions.add ? () => openAdd(natureFilter[0]) : null}
        addLabel={t(isCategory ? "addCategory" : "add")}>
        {toolbar}
        <Button variant="ghost" size="sm" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(allParents))}>
          {allCollapsed ? <ChevronsUpDownIcon data-icon="inline-start" /> : <ChevronsDownUpIcon data-icon="inline-start" />}
          {allCollapsed ? t("expandAll") : t("collapseAll")}
        </Button>
      </ListToolbar>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-card">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20 bg-white">
            <tr className="text-left text-[0.9rem] font-semibold text-table-head">
              <th className="h-12 border-b-2 px-4">{t("columns.name")}</th>
              <th className="w-40 border-b-2 px-4">{t("columns.code")}</th>
              <th className="w-32 border-b-2 px-4">{t("columns.type")}</th>
              {isCategory && <th className="w-32 border-b-2 px-4">{t("columns.provenance")}</th>}
              <th className="w-32 border-b-2 px-4">{t("columns.state")}</th>
              <th className="sticky right-0 w-28 border-b-2 bg-white px-4 text-right">{tg("list.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {tree.map((group) => (
              <Fragment key={group.nature}>
                <tr>
                  <td colSpan={isCategory ? 6 : 5} className="border-b bg-muted/50 px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <div className="flex items-center justify-between">
                      <span>{tn(group.nature as never)} · {group.parents.length}</span>
                      {permissions.add && (
                        <Button variant="ghost" size="xs" onClick={() => openAdd(group.nature)}><PlusIcon data-icon="inline-start" />{t(isCategory ? "addCategory" : "add")}</Button>
                      )}
                    </div>
                  </td>
                </tr>
                {group.parents.map(({ parent, children }) => {
                  const open = !collapsed.has(parent.id) || !!search;
                  return (
                    <Fragment key={parent.id}>
                      {line(parent, 0, children.length > 0, open)}
                      {open && children.map((c) => line(c, 1, false, false))}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
        {tree.length === 0 && (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyTitle>{search ? tg("list.emptySearch") : tg("list.emptyTitle")}</EmptyTitle>
              <EmptyDescription>{tg("list.emptySubtitle")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("delete.title", { name: toDelete?.short_name ?? "" })}
        description={isCategory ? t("delete.toTrash") : tg("confirm.noTrash")} word="SUPPRIMER" confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete) await run(() => deleteFamily(toDelete.id), tg("toast.deleted")); }} />
    </>
  );
}
