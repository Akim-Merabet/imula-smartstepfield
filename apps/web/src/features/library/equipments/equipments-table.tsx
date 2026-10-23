"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { BadgeCheckIcon, CalendarX2Icon, CopyIcon, InfoIcon, PackageOpenIcon, PencilIcon, PowerIcon, PowerOffIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { FamilyChip } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { FacetFilter } from "@/components/data-table/filter-bar";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EquipmentRow, LibraryOptions } from "../queries";
import { LibraryFilterBar, RowActions } from "../shared/filters";
import { ImportExcelDialog, ReorganizeBar, useImportNotifier, useLibraryRun } from "../shared/ui";
import { isExpired } from "./meta";
import { deleteEquipment, duplicateEquipment, importEquipments, reorganizeEquipments, setEquipmentActive } from "./actions";

type Perms = { add: boolean; edit: boolean; duplicate: boolean; delete: boolean; deactivate: boolean; import: boolean };


/** Badges d'un moyen : consommable, soumis à vérification, date de validité dépassée. */
export function EquipmentBadges({ e }: { e: Pick<EquipmentRow, "consumable" | "subject_to_verification" | "validity_date"> }) {
  const t = useTranslations("libraryEquipments.badges");
  const badge = (icon: React.ReactNode, label: string, className?: string) => (
    <Tooltip>
      <TooltipTrigger asChild><span aria-label={label} className={cn("inline-flex size-5 items-center justify-center rounded", className)}>{icon}</span></TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
  return (
    <span className="inline-flex items-center gap-1">
      {e.consumable && badge(<PackageOpenIcon className="size-4" />, t("consumable"), "text-muted-foreground")}
      {e.subject_to_verification && badge(<BadgeCheckIcon className="size-4" />, t("verified"), "text-primary")}
      {isExpired(e) && badge(<CalendarX2Icon className="size-4" />, t("expired"), "text-destructive")}
    </span>
  );
}

export function EquipmentsTable({ items, current, total, options, permissions }: {
  items: EquipmentRow[]; current: number; total: number; options: LibraryOptions; permissions: Perms;
}) {
  const t = useTranslations("libraryEquipments");
  const ts = useTranslations("libraryShared");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const { run } = useLibraryRun("libraryEquipments");
  const notifyImported = useImportNotifier();
  const [selected, setSelected] = useState<string[]>([]);
  const [toDelete, setToDelete] = useState<EquipmentRow | null>(null);
  const [toDuplicate, setToDuplicate] = useState<EquipmentRow | null>(null);
  const [importing, setImporting] = useState(false);
  const openAdd = useCallback(() => dialog.open("library-equipment/add/general-tab"), [dialog]);
  useRegisterPageAdd(permissions.add ? openAdd : null);

  const columns = useMemo<ColumnDef<EquipmentRow, unknown>[]>(() => [
    { id: "family", header: t("columns.family"), size: 140, cell: ({ row }) => <FamilyChip color={row.original.family?.color} shortName={row.original.family?.short_name} longName={row.original.family?.long_name} /> },
    {
      id: "name", header: t("columns.name"), size: 320, meta: { locked: true }, cell: ({ row }) => (
        <div className={cn("flex min-w-0 items-center gap-2", !row.original.active && "text-muted-foreground")}>
          <span className="truncate font-medium">{row.original.name}</span>
          <EquipmentBadges e={row.original} />
          {!row.original.active && <Badge variant="outline">{ts("deactivated")}</Badge>}
        </div>
      ),
    },
    { id: "reference", header: t("columns.reference"), size: 180, cell: ({ row }) => row.original.reference ?? "—" },
    { id: "provider", header: t("columns.provider"), size: 180, cell: ({ row }) => row.original.provider ?? "—" },
    { id: "unit", header: t("columns.unit"), size: 100, cell: ({ row }) => row.original.quantity_unit ?? "—" },
    {
      id: "actions", header: ts("actions"), size: 80, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => {
        const r = row.original;
        return (
          <RowActions label={tg("actions.more")} actions={[
            { id: "edit", label: t("actions.edit"), icon: PencilIcon, onSelect: () => dialog.open(`library-equipment/edit/${r.id}/general-tab`) },
            { id: "duplicate", label: t("actions.duplicate"), icon: CopyIcon, onSelect: () => setToDuplicate(r), hidden: !permissions.duplicate },
            { id: "properties", label: t("actions.properties"), icon: InfoIcon, onSelect: () => dialog.open(`library-equipment/properties/${r.id}`) },
            { id: "active", label: r.active ? t("actions.deactivate") : t("actions.activate"), icon: r.active ? PowerOffIcon : PowerIcon, hidden: !permissions.deactivate,
              onSelect: () => run(() => setEquipmentActive(r.id, !r.active), r.active ? t("deactivated") : t("activated")) },
            { id: "delete", label: t("actions.delete"), icon: Trash2Icon, destructive: true, onSelect: () => setToDelete(r), hidden: !permissions.delete },
          ]} />
        );
      },
    },
  ], [t, ts, tg, dialog, permissions, run]);

  return (
    <>
      <LibraryFilterBar families={options.families} accounts={options.accounts} extraParams={["verification"]}
        extra={<FacetFilter param="verification" label={t("filters.verification")}
          options={[{ value: "subjectToVerify", label: t("filters.subjectToVerify") }, { value: "expired", label: t("filters.expired") }]} />}
        end={permissions.import && <Button variant="outline" onClick={() => setImporting(true)}><UploadIcon data-icon="inline-start" />{t("actions.import")}</Button>} />
      <div className="flex items-center justify-between pb-2 text-sm text-muted-foreground">
        <span>{ts("counter", { current, total })}</span>
        {permissions.add && <Button size="sm" onClick={openAdd}>{t("add")}</Button>}
      </div>
      {permissions.edit && (
        <ReorganizeBar families={options.families} count={selected.length}
          onApply={async (familyId) => (await run(() => reorganizeEquipments(selected, familyId), ts("reorganize.success"))).ok} />
      )}
      <DataTable tableId="library-equipments" columns={columns} data={items} getRowId={(r) => r.id} selectable={permissions.edit}
        onSelectionChange={setSelected} onRowClick={(r) => dialog.open(`library-equipment/edit/${r.id}/general-tab`)}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={tg("list.emptySubtitle")} />
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }} title={t("delete.title", { name: toDelete?.name ?? "" })}
        description={tg("confirm.noTrash")} word="SUPPRIMER" confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete) await run(() => deleteEquipment(toDelete.id), t("delete.success")); }} />
      <ConfirmDialog open={!!toDuplicate} onOpenChange={(o) => { if (!o) setToDuplicate(null); }} destructive={false}
        title={t("duplicate.title", { name: toDuplicate?.name ?? "" })} confirmLabel={tg("actions.duplicate")}
        onConfirm={async () => { if (toDuplicate) await run(() => duplicateEquipment(toDuplicate.id, t("duplicate.copySuffix")), t("duplicate.success")); }} />
      {importing && (
        <ImportExcelDialog title={t("import.title")} templateHref="/explore/library/equipments/template" onClose={() => setImporting(false)}
          onImport={async (fd) => {
            const res = await run(() => importEquipments(fd), false);
            if (res.ok) notifyImported(res.data);
            return res.ok;
          }} />
      )}
    </>
  );
}
