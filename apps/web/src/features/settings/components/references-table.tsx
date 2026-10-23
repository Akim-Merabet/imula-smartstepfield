"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { EllipsisIcon, PencilIcon, PowerIcon, PowerOffIcon, Trash2Icon } from "lucide-react";
import { FamilyChip } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { ClearFiltersButton, FacetFilter, FilterBar } from "@/components/data-table/filter-bar";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteReference, setReferenceActive } from "../actions/references";
import { REFERENCE_NATURES } from "../meta";
import type { ReferenceRow } from "../queries";
import { ListToolbar } from "./list-toolbar";
import { useRun } from "./use-run";

export function ReferencesTable({ items, total, permissions }: {
  items: ReferenceRow[]; total: number; permissions: { add: boolean; edit: boolean; delete: boolean };
}) {
  const t = useTranslations("settings.references");
  const tn = useTranslations("settings.referenceNatures");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const run = useRun();
  const [toDelete, setToDelete] = useState<ReferenceRow | null>(null);
  const openAdd = useCallback(() => dialog.open("reference/add"), [dialog]);
  useRegisterPageAdd(permissions.add ? openAdd : null);

  const columns = useMemo<ColumnDef<ReferenceRow, unknown>[]>(() => [
    { id: "nature", header: t("columns.nature"), size: 160, cell: ({ row }) => tn(row.original.nature as never) },
    { id: "field", header: t("columns.field"), size: 200, cell: ({ row }) => t(`fieldsByNature.${row.original.nature}.${row.original.field}` as never) },
    {
      id: "link", header: t("columns.link"), size: 200, cell: ({ row }) => {
        const f = row.original.family;
        return f ? <FamilyChip color={f.color} shortName={f.short_name} longName={f.long_name} /> : <span className="text-muted-foreground">{t("links.default")}</span>;
      },
    },
    { id: "nomenclature", header: t("columns.nomenclature"), size: 260, cell: ({ row }) => <code className="text-xs">{row.original.nomenclature}</code> },
    { id: "counter", header: t("columns.counter"), size: 200, cell: ({ row }) => t("counterSummary", { type: t(`counterTypes.${row.original.counter_type}`), digits: row.original.counter_format }) },
    {
      id: "active", header: t("columns.active"), size: 110,
      cell: ({ row }) => <Badge variant={row.original.active ? "secondary" : "outline"}>{row.original.active ? t("active") : t("inactive")}</Badge>,
    },
    {
      id: "actions", header: tg("list.actions"), size: 110, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {permissions.edit && <Button variant="ghost" size="icon-sm" aria-label={tg("actions.edit")} onClick={() => dialog.open(`reference/edit/${r.id}`)}><PencilIcon /></Button>}
            {(permissions.edit || permissions.delete) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {permissions.edit && (
                    <DropdownMenuGroup>
                      <DropdownMenuItem onSelect={() => run(() => setReferenceActive(r.id, !r.active))}>
                        {r.active ? <PowerOffIcon /> : <PowerIcon />}{r.active ? tg("actions.deactivate") : tg("actions.activate")}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  )}
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
      },
    },
  ], [t, tn, tg, dialog, permissions, run]);

  return (
    <>
      <FilterBar end={<ClearFiltersButton params={["nature"]} />}>
        <FacetFilter param="nature" label={t("columns.nature")} options={REFERENCE_NATURES.map((n) => ({ value: n, label: tn(n) }))} />
      </FilterBar>
      <ListToolbar current={items.length} total={total} onAdd={permissions.add ? openAdd : null} addLabel={t("add")} />
      <DataTable tableId="settings-references" columns={columns} data={items} getRowId={(r) => r.id}
        onRowClick={permissions.edit ? (r) => dialog.open(`reference/edit/${r.id}`) : undefined}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={tg("list.emptySubtitle")} />
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("delete.title")} description={tg("confirm.noTrash")} word="SUPPRIMER" confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete) await run(() => deleteReference(toDelete.id), tg("toast.deleted")); }} />
    </>
  );
}
