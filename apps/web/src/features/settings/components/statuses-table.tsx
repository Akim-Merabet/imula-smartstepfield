"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckIcon, EllipsisIcon, PencilIcon, PowerIcon, PowerOffIcon, Trash2Icon } from "lucide-react";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { FilterBar, ToggleFilter } from "@/components/data-table/filter-bar";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { deleteStatus, setStatusActive } from "../actions/statuses";
import { STATUS_NATURES, statusRules, type StatusNature } from "../meta";
import type { StatusRow } from "../queries";
import { ListToolbar } from "./list-toolbar";
import { useRun } from "./use-run";

const yes = (v: boolean) => (v ? <CheckIcon className="size-4 text-success" /> : <span className="text-muted-foreground">—</span>);

export function StatusesTable({ nature, items, total, permissions }: {
  nature: StatusNature; items: StatusRow[]; total: number; permissions: { add: boolean; edit: boolean; delete: boolean };
}) {
  const t = useTranslations("settings.statuses");
  const tn = useTranslations("settings.statusNatures");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const run = useRun();
  const rules = statusRules(nature);
  const [toDelete, setToDelete] = useState<StatusRow | null>(null);
  const openAdd = useCallback(() => dialog.open(`status/add/${nature}`), [dialog, nature]);
  useRegisterPageAdd(permissions.add ? openAdd : null);

  const columns = useMemo<ColumnDef<StatusRow, unknown>[]>(() => {
    const cols: ColumnDef<StatusRow, unknown>[] = [];
    if (rules.family) {
      cols.push({
        id: "family", header: t("columns.family"), size: 140, cell: ({ row }) => {
          const f = row.original.family;
          if (!f) return <span className="text-muted-foreground">{t("linkDefault")}</span>;
          return <span className="flex items-center gap-1"><FamilyChip color={f.color} shortName={f.short_name} longName={f.long_name} />
            <span className="text-xs text-muted-foreground">{t(`familyLetter.${f.relative_nature}`)}</span></span>;
        },
      });
    }
    cols.push({
      id: "name", header: t("columns.name"), size: 300, cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1">
              <StatusBadge color={row.original.color} label={row.original.name} />
              {row.original.is_default && <span className="text-xs text-muted-foreground">{t("defaultSuffix")}</span>}
            </span>
          </TooltipTrigger>
          {row.original.description && <TooltipContent>{row.original.description}</TooltipContent>}
        </Tooltip>
      ),
    });
    if (rules.importable) cols.push({ id: "importable", header: t("columns.importable"), size: 120, cell: ({ row }) => yes(row.original.importable) });
    if (rules.exportable) cols.push({ id: "exportable", header: t("columns.exportable"), size: 120, cell: ({ row }) => yes(row.original.exportable) });
    if (rules.downloadable) cols.push({ id: "downloadable", header: t("columns.mobile"), size: 120, cell: ({ row }) => yes(row.original.downloadable) });
    if (rules.hideEntity) cols.push({ id: "hidden", header: t("columns.hidden"), size: 110, cell: ({ row }) => yes(row.original.hide_entity) });
    if (rules.category) cols.push({ id: "category", header: t("columns.category"), size: 150, cell: ({ row }) => t(`categories.${row.original.category}`) });
    cols.push({
      id: "active", header: t("columns.active"), size: 110,
      cell: ({ row }) => <Badge variant={row.original.active ? "secondary" : "outline"}>{row.original.active ? t("active") : t("inactive")}</Badge>,
    });
    cols.push({
      id: "actions", header: tg("list.actions"), size: 110, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {permissions.edit && <Button variant="ghost" size="icon-sm" aria-label={tg("actions.edit")} onClick={() => dialog.open(`status/edit/${s.id}`)}><PencilIcon /></Button>}
            {(permissions.edit || permissions.delete) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {permissions.edit && (
                    <DropdownMenuGroup>
                      <DropdownMenuItem disabled={s.active && s.is_default} onSelect={() => run(() => setStatusActive(s.id, !s.active))}>
                        {s.active ? <PowerOffIcon /> : <PowerIcon />}{s.active ? tg("actions.deactivate") : tg("actions.activate")}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  )}
                  {permissions.delete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem variant="destructive" disabled={s.is_default} onSelect={() => setToDelete(s)}><Trash2Icon />{tg("actions.delete")}</DropdownMenuItem>
                      </DropdownMenuGroup>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      },
    });
    return cols;
  }, [t, tg, dialog, rules, permissions, run]);

  return (
    <>
      <FilterBar>
        <ToggleFilter param="type" defaultValue="flow" options={STATUS_NATURES.map((n) => ({ value: n, label: tn(n) }))} />
        <ToggleFilter param="state" defaultValue="all" options={[
          { value: "all", label: t("filters.all") }, { value: "active", label: t("filters.active") }, { value: "inactive", label: t("filters.inactive") },
        ]} />
      </FilterBar>
      <ListToolbar current={items.length} total={total} onAdd={permissions.add ? openAdd : null} addLabel={t("add")} />
      <DataTable tableId={`settings-statuses-${nature}`} columns={columns} data={items} getRowId={(r) => r.id}
        onRowClick={permissions.edit ? (r) => dialog.open(`status/edit/${r.id}`) : undefined}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={tg("list.emptySubtitle")} />
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("delete.title", { name: toDelete?.name ?? "" })} description={tg("confirm.noTrash")} word="SUPPRIMER"
        confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete) await run(() => deleteStatus(toDelete.id), tg("toast.deleted")); }} />
    </>
  );
}
