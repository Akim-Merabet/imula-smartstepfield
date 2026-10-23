"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { CopyIcon, InfoIcon, PencilIcon, PowerIcon, PowerOffIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { FamilyChip } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LibraryOptions, RiskRow } from "../queries";
import { LibraryFilterBar, RowActions } from "../shared/filters";
import { Pictogram } from "../shared/pictogram";
import { ImportExcelDialog, ReorganizeBar, useImportNotifier, useLibraryRun } from "../shared/ui";
import { deleteRisk, duplicateRisk, importRisks, reorganizeRisks, setRiskActive } from "./actions";

type Perms = { add: boolean; edit: boolean; duplicate: boolean; delete: boolean; deactivate: boolean; import: boolean };

export function RisksTable({ items, current, total, options, permissions }: {
  items: RiskRow[]; current: number; total: number; options: LibraryOptions; permissions: Perms;
}) {
  const t = useTranslations("libraryRisks");
  const ts = useTranslations("libraryShared");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const { run } = useLibraryRun("libraryRisks");
  const [selected, setSelected] = useState<string[]>([]);
  const [toDelete, setToDelete] = useState<RiskRow | null>(null);
  const [toDuplicate, setToDuplicate] = useState<RiskRow | null>(null);
  const [importing, setImporting] = useState(false);
  const notifyImported = useImportNotifier();
  const openAdd = useCallback(() => dialog.open("library-risk/add/general-tab"), [dialog]);
  useRegisterPageAdd(permissions.add ? openAdd : null);

  const columns = useMemo<ColumnDef<RiskRow, unknown>[]>(() => [
    { id: "family", header: t("columns.family"), size: 140, cell: ({ row }) => <FamilyChip color={row.original.family?.color} shortName={row.original.family?.short_name} longName={row.original.family?.long_name} /> },
    {
      id: "name", header: t("columns.name"), size: 320, meta: { locked: true }, cell: ({ row }) => (
        <div className={cn("min-w-0", !row.original.active && "text-muted-foreground")}>
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{row.original.name}</span>
            {!row.original.active && <Badge variant="outline">{ts("deactivated")}</Badge>}
          </div>
          {row.original.reference && <div className="truncate text-xs text-muted-foreground">{row.original.reference}</div>}
        </div>
      ),
    },
    { id: "source", header: t("columns.source"), size: 220, cell: ({ row }) => row.original.source ?? "—" },
    { id: "major", header: t("columns.major"), size: 100, cell: ({ row }) => (row.original.major ? <Badge variant="destructive">{tg("yes")}</Badge> : tg("no")) },
    { id: "pictogram", header: t("columns.pictogram"), size: 120, cell: ({ row }) => <Pictogram value={row.original.pictogram} /> },
    { id: "parades", header: t("columns.parades"), size: 110, cell: ({ row }) => row.original.parades?.[0]?.count ?? 0 },
    {
      id: "actions", header: ts("actions"), size: 80, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => {
        const r = row.original;
        return (
          <RowActions label={tg("actions.more")} actions={[
            { id: "edit", label: t("actions.edit"), icon: PencilIcon, onSelect: () => dialog.open(`library-risk/edit/${r.id}/general-tab`) },
            { id: "duplicate", label: t("actions.duplicate"), icon: CopyIcon, onSelect: () => setToDuplicate(r), hidden: !permissions.duplicate },
            { id: "properties", label: t("actions.properties"), icon: InfoIcon, onSelect: () => dialog.open(`library-risk/properties/${r.id}`) },
            { id: "active", label: r.active ? t("actions.deactivate") : t("actions.activate"), icon: r.active ? PowerOffIcon : PowerIcon, hidden: !permissions.deactivate,
              onSelect: () => run(() => setRiskActive(r.id, !r.active), r.active ? t("deactivated") : t("activated")) },
            { id: "delete", label: t("actions.delete"), icon: Trash2Icon, destructive: true, onSelect: () => setToDelete(r), hidden: !permissions.delete },
          ]} />
        );
      },
    },
  ], [t, ts, tg, dialog, permissions, run]);

  return (
    <>
      <LibraryFilterBar families={options.families} accounts={options.accounts}
        end={permissions.import && <Button variant="outline" onClick={() => setImporting(true)}><UploadIcon data-icon="inline-start" />{t("actions.import")}</Button>} />
      <div className="flex items-center justify-between pb-2 text-sm text-muted-foreground">
        <span>{ts("counter", { current, total })}</span>
        {permissions.add && <Button size="sm" onClick={openAdd}>{t("add")}</Button>}
      </div>
      {permissions.edit && (
        <ReorganizeBar families={options.families} count={selected.length}
          onApply={async (familyId) => (await run(() => reorganizeRisks(selected, familyId), ts("reorganize.success"))).ok} />
      )}
      <DataTable tableId="library-risks" columns={columns} data={items} getRowId={(r) => r.id} selectable={permissions.edit}
        onSelectionChange={setSelected} onRowClick={(r) => dialog.open(`library-risk/edit/${r.id}/general-tab`)}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={tg("list.emptySubtitle")} />
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }} title={t("delete.title", { name: toDelete?.name ?? "" })}
        description={tg("confirm.noTrash")} word="SUPPRIMER" confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete) await run(() => deleteRisk(toDelete.id), t("delete.success")); }} />
      <ConfirmDialog open={!!toDuplicate} onOpenChange={(o) => { if (!o) setToDuplicate(null); }} destructive={false}
        title={t("duplicate.title", { name: toDuplicate?.name ?? "" })} confirmLabel={tg("actions.duplicate")}
        onConfirm={async () => { if (toDuplicate) await run(() => duplicateRisk(toDuplicate.id, t("duplicate.copySuffix")), t("duplicate.success")); }} />
      {importing && (
        <ImportExcelDialog title={t("import.title")} templateHref="/explore/library/risks/template" onClose={() => setImporting(false)}
          onImport={async (fd) => {
            const res = await run(() => importRisks(fd), false);
            if (res.ok) notifyImported(res.data);
            return res.ok;
          }} />
      )}
    </>
  );
}
