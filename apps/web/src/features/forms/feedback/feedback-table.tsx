"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import {
  CopyIcon, EllipsisIcon, FileSpreadsheetIcon, FileTextIcon, GlobeIcon, HistoryIcon, NetworkIcon, PencilIcon, RotateCcwIcon, Share2Icon, SmartphoneIcon, Trash2Icon,
} from "lucide-react";
import { notify } from "@/components/common/notify";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { useDialog } from "@/components/shell/use-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Field, FieldLabel } from "@/components/ui/field";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GenerateDocumentDialog } from "@/features/documents/pdf/generate-document-dialog";
import { useActionError } from "../components/form-chips";
import { deleteResponse, duplicateResponse, setResponseInProgress } from "../responses/actions";
import type { FeedbackItem } from "./queries";

type Permissions = { edit: boolean; duplicate: boolean; delete: boolean; export: boolean };

export function FeedbackTable({ projectId, items, total, limit, permissions }: {
  projectId: string; items: FeedbackItem[]; total: number; limit: number; permissions: Permissions;
}) {
  const t = useTranslations("forms.feedback");
  const tr = useTranslations("forms.responses");
  const tg = useTranslations("global");
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dialog = useDialog();
  const errorText = useActionError();
  const [selected, setSelected] = useState<string[]>([]);
  const [toDelete, setToDelete] = useState<FeedbackItem | null>(null);
  const [toEdit, setToEdit] = useState<FeedbackItem | null>(null);
  const [toReset, setToReset] = useState<FeedbackItem | null>(null);
  const [toGenerate, setToGenerate] = useState<FeedbackItem | null>(null);
  const tPdf = useTranslations("pdf.generate");
  const tShare = useTranslations("share.actions");
  const [exportMode, setExportMode] = useState<"all" | "xls">("all");

  const returnTo = `${pathname}?${searchParams.toString()}`;
  const responseHref = (r: FeedbackItem) => `/explore/projects/${projectId}/responses/${r.id}?${new URLSearchParams({ returnTo })}`;
  const date = (d: string | null) => (d ? format.dateTime(new Date(d), { dateStyle: "short", timeStyle: "short" }) : "—");

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    const res = await fn();
    if (res.ok) { notify.success(success); router.refresh(); } else notify.error(errorText(res.error ?? "unknown"));
    return res.ok;
  };

  const columns = useMemo<ColumnDef<FeedbackItem, unknown>[]>(() => [
    {
      id: "provenance", header: t("columns.provenance"), size: 110,
      cell: ({ row }) => {
        const r = row.original;
        const Icon = r.provenance === "mobile" ? SmartphoneIcon : GlobeIcon;
        return (
          <span className="inline-flex items-center gap-2">
            <Tooltip><TooltipTrigger asChild><Icon className="size-4 text-muted-foreground" /></TooltipTrigger>
              <TooltipContent>{t(`filters.sources.${r.provenance === "mobile" ? "mobile" : "webapp"}`)}</TooltipContent></Tooltip>
            {r.context === "flow" && (
              <Tooltip><TooltipTrigger asChild><NetworkIcon className="size-4 rotate-270 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent>{t("filters.sources.flow")}</TooltipContent></Tooltip>
            )}
          </span>
        );
      },
    },
    {
      id: "reference", header: t("columns.reference"), size: 280,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium group-hover:underline">{row.original.reference}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.form?.name ?? "—"}</div>
        </div>
      ),
    },
    {
      id: "flow", header: t("columns.flow"), size: 220,
      cell: ({ row }) => {
        const r = row.original;
        if (!r.flow) return <span className="text-muted-foreground">{t("projectContext")}</span>;
        return (
          <div className="min-w-0">
            <div className="truncate">{r.flow.ref_int ? `${r.flow.ref_int} - ${r.flow.name}` : r.flow.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {r.phase ? `P${r.phase.position} ${r.phase.name}` : ""}{r.step ? ` › E${r.step.position} ${r.step.name}` : ""}
              {!r.block_link_id && ` · ${t("orphan")}`}
            </div>
          </div>
        );
      },
    },
    { id: "index", header: t("columns.index"), size: 80, cell: ({ row }) => row.original.form_index_label || "—" },
    {
      id: "state", header: t("columns.state"), size: 110,
      cell: ({ row }) => <Badge variant={row.original.state === "done" ? "default" : "secondary"}>{tr(`state.${row.original.state}`)}</Badge>,
    },
    { id: "status", header: t("columns.status"), size: 140, cell: ({ row }) => <StatusBadge color={row.original.status?.color} label={row.original.status?.name} /> },
    { id: "updatedAt", header: t("columns.updatedAt"), size: 150, cell: ({ row }) => date(row.original.updated_at) },
    {
      id: "actions", header: tg("list.actions"), size: 110, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {permissions.edit && (
              <Button variant="ghost" size="icon-sm" aria-label={tr("actions.edit")} onClick={() => r.state === "done" ? setToEdit(r) : router.push(responseHref(r))}>
                <PencilIcon />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild><Link href={responseHref(r)}><PencilIcon />{tr("actions.open")}</Link></DropdownMenuItem>
                  {permissions.edit && r.state === "done" && (
                    <DropdownMenuItem onSelect={() => setToReset(r)}><RotateCcwIcon />{tr("actions.backToInProgress")}</DropdownMenuItem>
                  )}
                  {permissions.duplicate && (
                    <DropdownMenuItem onSelect={() => run(() => duplicateResponse(r.id), tr("toasts.duplicated"))}><CopyIcon />{tr("actions.duplicate")}</DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => setToGenerate(r)}><FileTextIcon />{tPdf("button")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => dialog.open(`form-lib/response-history/${r.id}`)}><HistoryIcon />{tr("actions.history")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => dialog.open(`share/response/${r.id}`)}><Share2Icon />{tShare("share")}</DropdownMenuItem>
                </DropdownMenuGroup>
                {permissions.delete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(r)}><Trash2Icon />{tr("actions.delete")}</DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], [t, tr, tg, tPdf, tShare, dialog, permissions, returnTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportSelection = () => {
    if (!selected.length) { notify.warning(t("export.selectFirst")); return; }
    const exportable = items.filter((i) => selected.includes(i.id) && (i.status?.exportable ?? true));
    if (!exportable.length) { notify.warning(t("export.unauthorized")); return; }
    const params = new URLSearchParams({ ids: exportable.map((i) => i.id).join(","), mode: exportMode });
    window.location.assign(`/explore/projects/${projectId}/dashboard/fields-feedback/export?${params}`);
  };

  const hasFilters = ["textSearch", "flow", "form", "source", "state", "status", "from", "to"].some((p) => searchParams.has(p));
  const loadMoreHref = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("limit", String(limit + 100));
    return `${pathname}?${params.toString()}`;
  })();

  return (
    <>
      <div className="flex items-center justify-between gap-2 pb-2 text-sm text-muted-foreground">
        <span>
          {tg("list.counter", { current: items.length, total })}
          {selected.length > 0 && ` · ${tg("list.selected", { count: selected.length })}`}
        </span>
        {permissions.export && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm"><FileSpreadsheetIcon data-icon="inline-start" />{t("export.button")}</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-72 flex-col gap-3">
              <span className="font-medium">{t("export.title")}</span>
              <RadioGroup value={exportMode} onValueChange={(v) => setExportMode(v as "all" | "xls")}>
                <Field orientation="horizontal"><RadioGroupItem value="all" id="exp-all" /><FieldLabel htmlFor="exp-all" className="font-normal">{t("export.all")}</FieldLabel></Field>
                <Field orientation="horizontal"><RadioGroupItem value="xls" id="exp-xls" /><FieldLabel htmlFor="exp-xls" className="font-normal">{t("export.xlsOnly")}</FieldLabel></Field>
              </RadioGroup>
              <Button size="sm" onClick={exportSelection}>{tg("actions.export")}</Button>
            </PopoverContent>
          </Popover>
        )}
      </div>
      <DataTable
        tableId="fields-feedback"
        columns={columns}
        data={items}
        getRowId={(r) => r.id}
        selectable
        onSelectionChange={setSelected}
        onRowClick={(r) => router.push(responseHref(r))}
        emptyTitle={hasFilters ? tg("list.emptyTitle") : t("emptyTitle")}
        emptyDescription={hasFilters ? t("emptyFiltered") : t("emptySubtitle")}
        footer={total > items.length ? <Link href={loadMoreHref} scroll={false} className="text-sm text-info hover:underline">{tg("actions.loadMore")}</Link> : undefined}
      />
      {toGenerate && (
        <GenerateDocumentDialog open onOpenChange={(o) => { if (!o) setToGenerate(null); }}
          response={{ id: toGenerate.id, reference: toGenerate.reference, projectId }} />
      )}
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("delete.title", { name: toDelete?.reference ?? "" })} description={t("delete.subtitle")} word="SUPPRIMER"
        confirmLabel={tg("actions.delete")}
        onConfirm={async () => { if (toDelete) await run(() => deleteResponse(toDelete.id), tr("toasts.deleted")); }} />
      <ConfirmDialog open={!!toEdit} onOpenChange={(o) => { if (!o) setToEdit(null); }}
        title={t("edit.title")} description={t("edit.subtitle")} destructive={false} confirmLabel={tg("actions.edit")}
        onConfirm={async () => {
          if (!toEdit) return;
          const res = await setResponseInProgress(toEdit.id);
          if (res.ok) router.push(responseHref(toEdit)); else notify.error(errorText(res.error));
        }} />
      <ConfirmDialog open={!!toReset} onOpenChange={(o) => { if (!o) setToReset(null); }}
        title={t("reset.title")} description={t("reset.subtitle")} word="REVENIR" destructive={false} confirmLabel={tr("actions.backToInProgress")}
        onConfirm={async () => { if (toReset) await run(() => setResponseInProgress(toReset.id), tg("toast.saved")); }} />
    </>
  );
}
