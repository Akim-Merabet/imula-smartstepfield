"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckIcon, EllipsisIcon, PencilIcon, PowerIcon, PowerOffIcon, Trash2Icon } from "lucide-react";
import { FamilyChip } from "@/components/common/status-badge";
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
import { activateAllCustomFields, deleteCustomField, setCustomFieldActive } from "../actions/custom-fields";
import { FIELD_NATURES, type FieldNature } from "../meta";
import type { CustomFieldRow } from "../queries";
import { ListToolbar } from "./list-toolbar";
import { useRun } from "./use-run";

export function CustomFieldsTable({ nature, items, total, permissions }: {
  nature: FieldNature; items: CustomFieldRow[]; total: number; permissions: { add: boolean; edit: boolean; delete: boolean };
}) {
  const t = useTranslations("settings.customFields");
  const tn = useTranslations("settings.fieldNatures");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const run = useRun();
  const [toDelete, setToDelete] = useState<CustomFieldRow | null>(null);
  const openAdd = useCallback(() => dialog.open(`custom-field/add/${nature}`), [dialog, nature]);
  useRegisterPageAdd(permissions.add ? openAdd : null);

  const columns = useMemo<ColumnDef<CustomFieldRow, unknown>[]>(() => [
    {
      id: "name", header: t("columns.name"), size: 320, cell: ({ row }) => (
        <span><span className="font-medium">{row.original.name}</span><span className="text-muted-foreground"> - {t(`types.${row.original.type}`)}</span></span>
      ),
    },
    {
      id: "family", header: t("columns.family"), size: 160, cell: ({ row }) => {
        const f = row.original.family;
        return f ? <FamilyChip color={f.color} shortName={f.short_name} longName={f.long_name} /> : <span className="text-muted-foreground">{t("linkDefault")}</span>;
      },
    },
    { id: "variable", header: t("columns.variable"), size: 180, cell: ({ row }) => row.original.variable_name ? <code className="text-xs">{row.original.variable_name}</code> : "—" },
    { id: "required", header: t("columns.required"), size: 120, cell: ({ row }) => row.original.required ? <CheckIcon className="size-4 text-success" /> : "—" },
    {
      id: "active", header: t("columns.active"), size: 110,
      cell: ({ row }) => <Badge variant={row.original.active ? "secondary" : "outline"}>{row.original.active ? t("active") : t("inactive")}</Badge>,
    },
    {
      id: "actions", header: tg("list.actions"), size: 110, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => {
        const f = row.original;
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {permissions.edit && <Button variant="ghost" size="icon-sm" aria-label={tg("actions.edit")} onClick={() => dialog.open(`custom-field/edit/${f.id}`)}><PencilIcon /></Button>}
            {(permissions.edit || permissions.delete) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {permissions.edit && (
                    <DropdownMenuGroup>
                      <DropdownMenuItem onSelect={() => run(() => setCustomFieldActive(f.id, !f.active))}>
                        {f.active ? <PowerOffIcon /> : <PowerIcon />}{f.active ? tg("actions.deactivate") : tg("actions.activate")}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  )}
                  {permissions.delete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(f)}><Trash2Icon />{tg("actions.delete")}</DropdownMenuItem>
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
  ], [t, tg, dialog, permissions, run]);

  return (
    <>
      <FilterBar>
        <ToggleFilter param="type" defaultValue="project" options={FIELD_NATURES.map((n) => ({ value: n, label: tn(n) }))} />
        <ToggleFilter param="state" defaultValue="all" options={[
          { value: "all", label: t("filters.all") }, { value: "active", label: t("filters.active") }, { value: "inactive", label: t("filters.inactive") },
        ]} />
      </FilterBar>
      <ListToolbar current={items.length} total={total} onAdd={permissions.add ? openAdd : null} addLabel={t("add")}>
        {permissions.edit && items.some((i) => !i.active) && (
          <Button variant="secondary" size="sm" onClick={() => run(() => activateAllCustomFields(nature))}><PowerIcon data-icon="inline-start" />{t("activateAll")}</Button>
        )}
      </ListToolbar>
      <DataTable tableId={`settings-custom-fields-${nature}`} columns={columns} data={items} getRowId={(r) => r.id}
        onRowClick={permissions.edit ? (r) => dialog.open(`custom-field/edit/${r.id}`) : undefined}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={tg("list.emptySubtitle")} />
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("delete.title", { name: toDelete?.name ?? "" })} description={tg("confirm.noTrash")} word="SUPPRIMER"
        confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete) await run(() => deleteCustomField(toDelete.id), tg("toast.deleted")); }} />
    </>
  );
}
