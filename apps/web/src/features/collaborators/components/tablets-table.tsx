"use client";

import { useCallback, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import {
  BanIcon, CaravanIcon, EllipsisIcon, HouseIcon, InfoIcon, MapPinIcon, PencilIcon, PlusIcon, PowerIcon, QrCodeIcon, Trash2Icon,
} from "lucide-react";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { ClearFiltersButton, FacetFilter, FilterBar, SearchFilter } from "@/components/data-table/filter-bar";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { deleteTablet, setTabletActive } from "../actions";
import { COLLABORATOR_STATUS_COLORS, TABLET_NATURES, TABLET_STATUS_COLORS, TABLET_STATUSES, familyLabel } from "../meta";
import type { TabletListItem } from "../queries";
import { DependenciesDialog, useActionRunner } from "./action-runner";

type Opts = { accounts: { id: string; name: string }[]; companies: { id: string; name: string }[];
  families: { id: string; short_name: string; long_name: string | null; color: string }[] };

export function TabletsFilters({ options }: { options: Opts }) {
  const t = useTranslations("collaborators");
  return (
    <FilterBar end={<ClearFiltersButton params={["textSearch", "account", "company", "family", "nature", "status", "state"]} />}>
      <SearchFilter />
      {options.accounts.length > 1 && <FacetFilter param="account" label={t("filters.applicability")} options={options.accounts.map((a) => ({ value: a.id, label: a.name }))} />}
      <FacetFilter param="company" label={t("filters.company")} options={options.companies.map((c) => ({ value: c.id, label: c.name }))} />
      <FacetFilter param="family" label={t("filters.family")} options={options.families.map((f) => ({ value: f.id, label: familyLabel(f), color: f.color }))} />
      <FacetFilter param="nature" label={t("filters.type")} options={TABLET_NATURES.map((n) => ({ value: n, label: t(`tablet.natures.${n}`) }))} />
      <FacetFilter param="status" label={t("filters.status")} options={TABLET_STATUSES.map((s) => ({ value: s, label: t(`tablet.statuses.${s}`) }))} />
      <FacetFilter param="state" label={t("filters.state")} options={(["active", "inactive"] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} />
    </FilterBar>
  );
}

type Confirm = { type: "delete" | "deactivate" | "activate"; item: TabletListItem };

export function TabletsTable({ items, total, permissions }: {
  items: TabletListItem[]; total: number; permissions: { add: boolean; edit: boolean; delete: boolean };
}) {
  const t = useTranslations("collaborators");
  const tg = useTranslations("global");
  const format = useFormatter();
  const dialog = useDialog();
  const { run, deps, clearDeps } = useActionRunner();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const openAdd = useCallback(() => dialog.open("tablet/add/general-tab"), [dialog]);
  useRegisterPageAdd(permissions.add ? openAdd : null);

  const columns = useMemo<ColumnDef<TabletListItem, unknown>[]>(() => [
    { id: "family", header: t("columns.family"), size: 110,
      cell: ({ row }) => <FamilyChip color={row.original.family?.color} shortName={row.original.family?.short_name} longName={row.original.family?.long_name} /> },
    { id: "name", header: t("columns.name"), size: 220, cell: ({ row }) => (
      <span className="flex items-center gap-2 font-medium">
        {row.original.nature === "external" ? <CaravanIcon className="size-4 text-muted-foreground" /> : <HouseIcon className="size-4 text-muted-foreground" />}
        <span className="truncate group-hover:underline">{row.original.name}</span>
      </span>
    ) },
    { id: "appVersion", header: t("columns.appVersion"), size: 140, cell: ({ row }) => row.original.app_version ?? "—" },
    { id: "lastPush", header: t("columns.lastPush"), size: 150,
      cell: ({ row }) => (row.original.last_push_at ? format.dateTime(new Date(row.original.last_push_at), { dateStyle: "short", timeStyle: "short" }) : "—") },
    { id: "position", header: t("columns.position"), size: 110, cell: ({ row }) => {
      const { last_latitude: lat, last_longitude: lng } = row.original;
      if (lat == null || lng == null) return "—";
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" asChild onClick={(e) => e.stopPropagation()}>
              <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`} target="_blank" rel="noreferrer" aria-label={t("actions.showMap")}><MapPinIcon /></a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("actions.showMap")}</TooltipContent>
        </Tooltip>
      );
    } },
    { id: "status", header: t("columns.status"), size: 140,
      cell: ({ row }) => <StatusBadge color={TABLET_STATUS_COLORS[row.original.status]} label={t(`tablet.statuses.${row.original.status}`)} /> },
    { id: "state", header: t("columns.state"), size: 120,
      cell: ({ row }) => <StatusBadge color={COLLABORATOR_STATUS_COLORS[row.original.profile_status]} label={t(`status.${row.original.profile_status}`)} /> },
    { id: "company", header: t("columns.company"), size: 160, cell: ({ row }) => row.original.company?.name ?? "—" },
    {
      id: "actions", header: tg("list.actions"), size: 110, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => {
        const x = row.original;
        const inactive = x.profile_status === "inactive";
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {permissions.edit && !inactive && (
              <Button variant="ghost" size="icon-sm" aria-label={t("actions.edit")} onClick={() => dialog.open(`tablet/edit/${x.id}/general-tab`)}><PencilIcon /></Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => dialog.open(`tablet/properties/${x.id}`)}><InfoIcon />{t("actions.properties")}</DropdownMenuItem>
                  {permissions.edit && !inactive && (
                    <DropdownMenuItem onSelect={() => dialog.open(`quick-connection/tablet/${x.id}`)}><QrCodeIcon />{t("actions.quickConnection")}</DropdownMenuItem>
                  )}
                  {permissions.edit && (inactive
                    ? <DropdownMenuItem onSelect={() => setConfirm({ type: "activate", item: x })}><PowerIcon />{t("actions.activate")}</DropdownMenuItem>
                    : <DropdownMenuItem onSelect={() => setConfirm({ type: "deactivate", item: x })}><BanIcon />{t("actions.deactivate")}</DropdownMenuItem>)}
                </DropdownMenuGroup>
                {permissions.delete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ type: "delete", item: x })}><Trash2Icon />{t("actions.delete")}</DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], [t, tg, format, dialog, permissions]);

  const onConfirm = async () => {
    if (!confirm) return;
    const { type, item } = confirm;
    if (type === "delete") await run(() => deleteTablet(item.id), t("toast.deleted"));
    else await run(() => setTabletActive(item.id, type === "activate"), t(type === "activate" ? "toast.activated" : "toast.deactivated"));
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 pb-2">
        <span className="text-sm text-muted-foreground">{tg("list.counter", { current: items.length, total })}</span>
        {permissions.add && <Button onClick={openAdd}><PlusIcon data-icon="inline-start" />{t("toolbar.create")}</Button>}
      </div>
      <DataTable tableId="tablets" columns={columns} data={items} getRowId={(x) => x.id}
        onRowClick={(x) => dialog.open(permissions.edit && x.profile_status !== "inactive" ? `tablet/edit/${x.id}/general-tab` : `tablet/properties/${x.id}`)}
        emptyTitle={tg("list.emptyTitle")} emptyDescription={tg("list.emptySubtitle")} />
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title={confirm ? t(confirm.type === "delete" ? "confirm.deleteTitle" : confirm.type === "activate" ? "confirm.activateTitle" : "confirm.deactivateTitle", { name: confirm.item.name }) : ""}
        description={confirm?.type === "delete" ? t("confirm.deleteHardText") : confirm?.type === "deactivate" ? t("confirm.deactivateText") : undefined}
        word={confirm?.type === "delete" ? t("confirm.word") : undefined}
        destructive={confirm?.type !== "activate"}
        confirmLabel={confirm ? t(`actions.${confirm.type}`) : undefined}
        onConfirm={onConfirm} />
      <DependenciesDialog deps={deps} onClose={clearDeps} />
    </>
  );
}
