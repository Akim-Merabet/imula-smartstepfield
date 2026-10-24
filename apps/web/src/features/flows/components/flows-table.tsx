"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import {
  ArrowDownIcon, ArrowUpIcon, CopyIcon, EllipsisIcon, HistoryIcon, InfoIcon, LayersIcon, LockIcon, PencilIcon, QrCodeIcon, Trash2Icon,
} from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { ColumnsCustomizer, type ColumnChoice } from "@/components/data-table/columns-customizer";
import { DataTable, useColumnPreferences } from "@/components/data-table/data-table";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteFlow } from "../actions";
import type { FlowType } from "../meta";
import type { FlowListItem } from "../queries";
import { FlowTypeBadge } from "./flow-type-badge";
import { ReorganizeDialog } from "./reorganize-dialog";
import { StatusPopover } from "./status-popover";
import type { StatusOption } from "./status-select";

const OPTIONAL_COLUMNS = [
  "reference", "description", "family", "category", "reporter", "assignees", "collaborators", "tablet1", "tablet2", "tablet3",
  "startDate", "finishDate", "estimatedStartDate", "estimatedEndDate", "achievedStartDate", "achievedEndDate", "modification",
  "internalSupervisor1", "internalSupervisor2", "internalSupervisor3", "externalSupervisor1", "externalSupervisor2", "externalSupervisor3",
  "site", "area", "local", "elementarySystem", "functionalMarker", "object", "tags",
] as const;
type Optional = (typeof OPTIONAL_COLUMNS)[number];
const DEFAULT_VISIBLE = new Set<Optional>(["reference", "family", "category", "reporter", "assignees", "startDate", "finishDate", "modification"]);
const SORTABLE: Partial<Record<string, string>> = {
  name: "name", reference: "ref_int", startDate: "start_date", finishDate: "finish_date",
  estimatedStartDate: "estimated_start_date", estimatedEndDate: "estimated_end_date",
  achievedStartDate: "achieved_start_date", achievedEndDate: "achieved_end_date", modification: "updated_at",
};

type Person = { first_name: string; last_name: string } | null;
const fullName = (p: Person) => (p ? `${p.first_name} ${p.last_name}` : "");

export function FlowsTable({ projectId, items, total, hasMore, limit, statuses, permissions, reorganizeOptions }: {
  projectId: string; items: FlowListItem[]; total: number; hasMore: boolean; limit: number; statuses: StatusOption[];
  permissions: { add: boolean; edit: boolean; delete: boolean; duplicate: boolean; editStatus: boolean };
  reorganizeOptions: { categories: { value: string; label: string }[]; members: { value: string; label: string }[]; tablets: { value: string; label: string }[] };
}) {
  const t = useTranslations("flows");
  const tg = useTranslations("global");
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dialog = useDialog();
  const [toDelete, setToDelete] = useState<FlowListItem | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [reorganize, setReorganize] = useState(false);
  const [tableKey, setTableKey] = useState(0);

  const openAdd = useCallback(() => dialog.open("flow/add/general-tab"), [dialog]);
  useRegisterPageAdd(permissions.add ? openAdd : null);

  const defaults = useMemo<VisibilityState>(() => Object.fromEntries(OPTIONAL_COLUMNS.map((c) => [c, DEFAULT_VISIBLE.has(c)])), []);
  const [visibility, setVisibility] = useColumnPreferences(`columns_configurations_${projectId}`, defaults);

  const sortBy = searchParams.get("sortBy");
  const direction = searchParams.get("direction");
  const sortHref = (col: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const dir = sortBy === col && direction !== "desc" ? "desc" : "asc";
    params.set("sortBy", col); params.set("direction", dir);
    return `${pathname}?${params.toString()}`;
  };
  const header = (id: string) => {
    const col = SORTABLE[id];
    const label = t(`columns.${id}`);
    if (!col) return label;
    return (
      <Link href={sortHref(col)} scroll={false} className="inline-flex items-center gap-1 hover:underline">
        {label}
        {sortBy === col && (direction === "desc" ? <ArrowDownIcon className="size-3.5" /> : <ArrowUpIcon className="size-3.5" />)}
      </Link>
    );
  };
  const date = (v: string | null) => (v ? format.dateTime(new Date(v), { dateStyle: "short", timeStyle: "short" }) : "—");

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    const res = await fn();
    if (res.ok) { notify.success(tg("toast.deleted")); router.refresh(); return; }
    const key = res.error && ["linked_to_steps", "in_diagram", "imported"].includes(res.error) ? `delete.errors.${res.error}` : null;
    notify.error(res.error === "forbidden" ? tg("toast.forbidden") : key ? t(key as never) : tg("toast.error"));
  };

  const columns = useMemo<ColumnDef<FlowListItem, unknown>[]>(() => {
    const text = (id: Optional, get: (f: FlowListItem) => string | null | undefined): ColumnDef<FlowListItem, unknown> => ({
      id, header: () => header(id), cell: ({ row }) => <span className="line-clamp-2">{get(row.original) || "—"}</span>,
    });
    return [
      {
        id: "type", header: t("columns.type"), size: 70, meta: { locked: true },
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1">
            <FlowTypeBadge type={row.original.flow_type as FlowType} />
            {row.original.origin === "derived_from_standard" && !row.original.unlocked && <LockIcon className="size-3.5 text-muted-foreground" />}
          </span>
        ),
      },
      {
        id: "name", header: () => header("name"), size: 280, meta: { locked: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium group-hover:underline">{row.original.name}</div>
            {row.original.ref_int && <div className="truncate text-xs text-muted-foreground">{row.original.ref_int}</div>}
          </div>
        ),
      },
      {
        id: "status", header: t("columns.status"), size: 180, meta: { locked: true },
        cell: ({ row }) => (
          <StatusPopover flowId={row.original.id} currentId={row.original.custom_status_id} statuses={statuses} disabled={!permissions.editStatus}>
            <StatusBadge color={row.original.status?.color} label={row.original.status?.name} />
          </StatusPopover>
        ),
      },
      text("reference", (f) => f.ref_int),
      text("description", (f) => f.description),
      {
        id: "family", header: t("columns.family"), size: 120,
        cell: ({ row }) => <FamilyChip color={row.original.family?.color} shortName={row.original.family?.short_name} longName={row.original.family?.long_name} />,
      },
      {
        id: "category", header: t("columns.category"), size: 120,
        cell: ({ row }) => <FamilyChip color={row.original.category?.color} shortName={row.original.category?.short_name} longName={row.original.category?.long_name} />,
      },
      text("reporter", (f) => fullName(f.reporter)),
      text("assignees", (f) => f.assignees.map((a) => fullName(a.collaborator)).filter(Boolean).join(", ")),
      text("collaborators", (f) => f.collaborators.map((a) => fullName(a.collaborator)).filter(Boolean).join(", ")),
      text("tablet1", (f) => f.tablet1?.name),
      text("tablet2", (f) => f.tablet2?.name),
      text("tablet3", (f) => f.tablet3?.name),
      text("startDate", (f) => date(f.start_date)),
      text("finishDate", (f) => date(f.finish_date)),
      text("estimatedStartDate", (f) => date(f.estimated_start_date)),
      text("estimatedEndDate", (f) => date(f.estimated_end_date)),
      text("achievedStartDate", (f) => date(f.achieved_start_date)),
      text("achievedEndDate", (f) => date(f.achieved_end_date)),
      text("modification", (f) => date(f.content_updated_at && f.content_updated_at > f.updated_at ? f.content_updated_at : f.updated_at)),
      text("internalSupervisor1", (f) => f.internal_supervisor_name_1),
      text("internalSupervisor2", (f) => f.internal_supervisor_name_2),
      text("internalSupervisor3", (f) => f.internal_supervisor_name_3),
      text("externalSupervisor1", (f) => f.external_supervisor_name_1),
      text("externalSupervisor2", (f) => f.external_supervisor_name_2),
      text("externalSupervisor3", (f) => f.external_supervisor_name_3),
      text("site", (f) => f.location_site),
      text("area", (f) => f.location_area),
      text("local", (f) => f.location_local),
      text("elementarySystem", (f) => f.elementary_system),
      text("functionalMarker", (f) => f.functional_marker),
      text("object", (f) => f.technical_object_label),
      {
        id: "tags", header: t("columns.tags"),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.tags.map((x) => x.tag && (
              <span key={x.tag.id} className="rounded px-1.5 py-0.5 text-xs text-white" style={{ backgroundColor: x.tag.color }}>{x.tag.name}</span>
            ))}
          </div>
        ),
      },
      {
        id: "actions", header: tg("list.actions"), size: 120, enableResizing: false, meta: { sticky: true },
        cell: ({ row }) => {
          const f = row.original;
          return (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              {permissions.edit && (
                <Button variant="ghost" size="icon-sm" aria-label={t("actions.edit")} onClick={() => dialog.open(`flow/edit/${f.id}/general-tab`)}>
                  <PencilIcon />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem asChild>
                      <Link href={`/explore/projects/${projectId}/flow/${f.id}/content-view`}><LayersIcon />{t("actions.openContent")}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => dialog.open(`flow/properties/${f.id}`)}><InfoIcon />{t("actions.properties")}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => dialog.open(`flow/history/${f.id}`)}><HistoryIcon />{t("actions.history")}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => dialog.open(`qr-code/flow/${f.id}`)}><QrCodeIcon />{t("actions.qrCode")}</DropdownMenuItem>
                    {permissions.duplicate && (
                      <DropdownMenuItem onSelect={() => dialog.open(`flow/duplicate/${f.id}`)}><CopyIcon />{t("actions.duplicate")}</DropdownMenuItem>
                    )}
                  </DropdownMenuGroup>
                  {permissions.delete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(f)}><Trash2Icon />{t("actions.delete")}</DropdownMenuItem>
                      </DropdownMenuGroup>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ];
  }, [t, tg, dialog, statuses, permissions, projectId, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const choices: ColumnChoice[] = [
    ...["type", "name", "status"].map((id) => ({ id, label: t(`columns.${id}`), locked: true })),
    ...OPTIONAL_COLUMNS.map((id) => ({ id, label: t(`columns.${id}`) })),
  ];

  const loadMoreHref = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("limit", String(limit + 100));
    return `${pathname}?${params.toString()}`;
  })();

  return (
    <>
      <div className="flex items-center justify-between gap-2 pb-2 text-sm text-muted-foreground">
        <span>{tg("list.counter", { current: items.length, total })}</span>
        <div className="flex items-center gap-2">
          {selection.length > 0 && (
            <>
              <span>{tg("list.selected", { count: selection.length })}</span>
              {permissions.edit && <Button size="sm" variant="secondary" onClick={() => setReorganize(true)}>{t("reorganize.button")}</Button>}
              <Button size="sm" variant="ghost" onClick={() => { setSelection([]); setTableKey((k) => k + 1); }}>{t("reorganize.clearSelection")}</Button>
            </>
          )}
          <ColumnsCustomizer choices={choices} visibility={visibility} onChange={setVisibility} />
        </div>
      </div>
      <DataTable
        key={tableKey}
        tableId={`flows_${projectId}`}
        columns={columns}
        data={items}
        getRowId={(f) => f.id}
        columnVisibility={visibility}
        selectable={permissions.edit}
        onSelectionChange={(ids) => queueMicrotask(() => setSelection(ids))}
        onRowClick={(f) => router.push(`/explore/projects/${projectId}/flow/${f.id}/content-view`)}
        emptyTitle={t("list.emptyTitle")}
        emptyDescription={t("list.emptySubtitle")}
        footer={hasMore ? <Link href={loadMoreHref} scroll={false} className="text-sm text-info hover:underline">{tg("actions.loadMore")}</Link> : undefined}
      />
      <ReorganizeDialog open={reorganize} onOpenChange={setReorganize} projectId={projectId} flowIds={selection}
        options={{ ...reorganizeOptions, statuses }} onDone={() => { setSelection([]); setTableKey((k) => k + 1); }} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("delete.title", { name: toDelete?.name ?? "" })}
        description={t("delete.subtitle")}
        confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete) await run(() => deleteFlow(toDelete.id)); }}
      />
    </>
  );
}
