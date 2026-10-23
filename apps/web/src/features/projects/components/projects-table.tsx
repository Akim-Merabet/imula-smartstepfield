"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import {
  CopyIcon, EllipsisIcon, EyeIcon, EyeOffIcon, FolderInputIcon, GlobeIcon, HistoryIcon, InfoIcon, LockIcon, PencilIcon, StoreIcon, Trash2Icon,
} from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable, useColumnPreferences } from "@/components/data-table/data-table";
import { ColumnsCustomizer, type ColumnChoice } from "@/components/data-table/columns-customizer";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteProject, setProjectArchived, setProjectPublished } from "../actions";
import { convertToFolder } from "../folder-actions";
import type { ProjectListItem } from "../queries";

const OPTIONAL_COLUMNS = [
  "client", "reference", "location", "responsible", "description", "contractRef", "internalCommand", "externalCommand",
  "marketNumber", "technicalDeal", "keywords", "businessDomain", "nationalProgram", "complementRef1", "complementRef2",
] as const;
const DEFAULT_VISIBLE = new Set(["client", "reference", "location", "responsible"]);

export function ProjectsTable({ items, total, hasMore, limit, permissions }: {
  items: ProjectListItem[]; total: number; hasMore: boolean; limit: number; permissions: { add: boolean; publish: boolean };
}) {
  const t = useTranslations("projects");
  const tg = useTranslations("global");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dialog = useDialog();
  const [toDelete, setToDelete] = useState<ProjectListItem | null>(null);
  const [toConvert, setToConvert] = useState<ProjectListItem | null>(null);

  const openAdd = useCallback(() => dialog.open("project/add/general-tab"), [dialog]);
  useRegisterPageAdd(permissions.add ? openAdd : null);

  const defaults = useMemo<VisibilityState>(
    () => Object.fromEntries(OPTIONAL_COLUMNS.map((c) => [c, DEFAULT_VISIBLE.has(c)])), []);
  const [visibility, setVisibility] = useColumnPreferences("project_columns_configurations", defaults);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    const res = await fn();
    if (res.ok) { notify.success(tg("toast.saved")); router.refresh(); }
    else notify.error(res.error === "forbidden" ? tg("toast.forbidden") : res.error === "has_sub_folders" ? t("delete.hasSubFolders") : tg("toast.error"));
  };

  const columns = useMemo<ColumnDef<ProjectListItem, unknown>[]>(() => {
    const text = (id: (typeof OPTIONAL_COLUMNS)[number], get: (p: ProjectListItem) => string | null | undefined): ColumnDef<ProjectListItem, unknown> => ({
      id, header: t(`columns.${id}`), cell: ({ row }) => <span className="line-clamp-2">{get(row.original) || "—"}</span>,
    });
    return [
      {
        id: "family", header: t("columns.family"), size: 120, meta: { locked: true },
        cell: ({ row }) => <FamilyChip color={row.original.family?.color} shortName={row.original.family?.short_name} longName={row.original.family?.long_name} />,
      },
      {
        id: "designation", header: t("columns.designation"), size: 320, meta: { locked: true },
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex min-w-0 items-center gap-3">
              <EntityIcon kind={p.type} letter={t(`letters.${p.type}`)} size="md" />
              <div className="min-w-0">
                <div className="truncate font-medium group-hover:underline">{p.designation}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {p.published ? <StoreIcon className="size-3" /> : <LockIcon className="size-3" />}
                  {p.published ? t("public", { account: p.account?.name ?? "" }) : t(`types.${p.type}`)}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: "status", header: t("columns.status"), size: 170, meta: { locked: true },
        cell: ({ row }) => <StatusBadge color={row.original.status?.color} label={row.original.status?.name} />,
      },
      text("client", (p) => p.client?.name),
      text("reference", (p) => p.business_ref),
      text("location", (p) => p.location_label),
      text("responsible", (p) => p.members.filter((m) => m.role === "responsible" && m.collaborator)
        .map((m) => `${m.collaborator!.first_name} ${m.collaborator!.last_name}`).join(", ")),
      text("description", (p) => p.description),
      text("contractRef", (p) => p.contract_ref),
      text("internalCommand", (p) => p.internal_command),
      text("externalCommand", (p) => p.external_command),
      text("marketNumber", (p) => p.market_number),
      text("technicalDeal", (p) => p.technical_deal),
      text("keywords", (p) => p.keywords),
      text("businessDomain", (p) => p.business_domain),
      text("nationalProgram", (p) => p.national_program),
      text("complementRef1", (p) => p.complement_ref_1),
      text("complementRef2", (p) => p.complement_ref_2),
      {
        id: "actions", header: tg("list.actions"), size: 110, enableResizing: false, meta: { sticky: true },
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon-sm" aria-label={t("actions.edit")} onClick={() => dialog.open(`project/edit/${p.id}/general-tab`)}>
                <PencilIcon />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onSelect={() => dialog.open(`project/history/${p.id}`)}><HistoryIcon />{t("actions.statusHistory")}</DropdownMenuItem>
                    {p.type !== "pgac" && p.type !== "folder" && (
                      <DropdownMenuItem onSelect={() => dialog.open(`project/duplicate/${p.id}`)}><CopyIcon />{t("actions.duplicate")}</DropdownMenuItem>
                    )}
                    {p.type === "referential" && (
                      <DropdownMenuItem onSelect={() => setToConvert(p)}><FolderInputIcon />{t("actions.convertToFolder")}</DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => dialog.open(`project/properties/${p.id}`)}><InfoIcon />{t("actions.properties")}</DropdownMenuItem>
                    {permissions.publish && p.type !== "pgac" && (
                      <DropdownMenuItem onSelect={() => run(() => setProjectPublished(p.id, !p.published))}>
                        {p.published ? <LockIcon /> : <GlobeIcon />}{p.published ? t("actions.private") : t("actions.publish")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => run(() => setProjectArchived(p.id, !p.archived))}>
                      {p.archived ? <EyeIcon /> : <EyeOffIcon />}{p.archived ? t("actions.show") : t("actions.hide")}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(p)}><Trash2Icon />{t("actions.delete")}</DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ];
  }, [t, tg, dialog, permissions.publish]); // eslint-disable-line react-hooks/exhaustive-deps

  const choices: ColumnChoice[] = [
    ...["family", "designation", "status"].map((id) => ({ id, label: t(`columns.${id}`), locked: true })),
    ...OPTIONAL_COLUMNS.map((id) => ({ id, label: t(`columns.${id}`) })),
  ];

  const loadMoreHref = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("limit", String(limit + 50));
    return `${pathname}?${params.toString()}`;
  })();

  return (
    <>
      <div className="flex items-center justify-between pb-2 text-sm text-muted-foreground">
        <span>{tg("list.counter", { current: items.length, total })}</span>
        <ColumnsCustomizer choices={choices} visibility={visibility} onChange={setVisibility} />
      </div>
      <DataTable
        tableId="projects"
        columns={columns}
        data={items}
        getRowId={(p) => p.id}
        columnVisibility={visibility}
        onRowClick={(p) => router.push(p.type === "folder" && !p.is_sub_folder ? `/explore/folder/${p.id}` : `/explore/projects/${p.id}/dashboard`)}
        emptyTitle={tg("list.emptyTitle")}
        emptyDescription={tg("list.emptySubtitle")}
        footer={hasMore ? <Link href={loadMoreHref} scroll={false} className="text-sm text-info hover:underline">{tg("actions.loadMore")}</Link> : undefined}
      />
      <ConfirmDialog
        open={!!toConvert}
        onOpenChange={(o) => { if (!o) setToConvert(null); }}
        title={t("convert.title", { name: toConvert?.designation ?? "" })}
        description={t("convert.subtitle")}
        destructive={false}
        confirmLabel={t("actions.convertToFolder")}
        onConfirm={async () => {
          if (!toConvert) return;
          const res = await convertToFolder(toConvert.id);
          if (res.ok) { notify.success(t("convert.success")); router.refresh(); }
          else notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error"));
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("delete.title", { name: toDelete?.designation ?? "" })}
        description={t("delete.subtitle")}
        word="SUPPRIMER"
        confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete) await run(() => deleteProject(toDelete.id)); }}
      />
    </>
  );
}
