"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { FileSearchIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListToolbar } from "@/features/settings/components/list-toolbar";
import { TEMPLATE_GROUPS } from "../templates";
import { deleteTram, tramPreviewUrl } from "./actions";

export type TramRow = {
  id: string; link_type: string; client: string | null; family: string | null; page_type: string;
  margin_top: number; margin_bottom: number; margin_left: number; margin_right: number;
  page_number_x: number | null; page_number_y: number | null; index_max: number | null; created_at: string;
};
const ALL = "__all__";
const groupOf = (type: string) => TEMPLATE_GROUPS.find((g) => g.types.includes(type))?.group ?? "document";

/** Liste des trames (spec 01 §6.12) : Lien, Type, Trame, Marges, Pos. X/Y, Date de création, Actions. */
export function TramsTable({ items, canEdit }: { items: TramRow[]; canEdit: boolean }) {
  const t = useTranslations("pdf.trams");
  const tg = useTranslations("global");
  const format = useFormatter();
  const dialog = useDialog();
  const router = useRouter();
  const [link, setLink] = useState(ALL);
  const [group, setGroup] = useState(ALL);
  const [toDelete, setToDelete] = useState<TramRow | null>(null);
  const openAdd = useCallback(() => dialog.open("tram/add"), [dialog]);
  useRegisterPageAdd(canEdit ? openAdd : null);
  const shown = items.filter((r) => (link === ALL || r.link_type === link) && (group === ALL || groupOf(r.page_type) === group));

  const preview = async (id: string) => {
    const res = await tramPreviewUrl(id);
    if (res.ok) window.open(res.data.url, "_blank", "noopener"); else notify.error(t("errors.not_found"));
  };

  const columns = useMemo<ColumnDef<TramRow, unknown>[]>(() => [
    {
      id: "link", header: t("columns.link"), size: 220, cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant={row.original.link_type === "default" ? "secondary" : "outline"}>{t(`links.${row.original.link_type}`)}</Badge>
          <span className="truncate">{row.original.client ?? row.original.family ?? ""}</span>
        </div>
      ),
    },
    {
      id: "type", header: t("columns.type"), size: 300, cell: ({ row }) => (
        <div className="min-w-0"><div className="truncate">{t(`types.${row.original.page_type}`)}</div>
          <div className="truncate text-xs text-muted-foreground">{t(`groups.${groupOf(row.original.page_type)}`)}</div></div>
      ),
    },
    {
      id: "file", header: t("columns.file"), size: 110, cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void preview(row.original.id); }}>
          <FileSearchIcon data-icon="inline-start" />{t("preview")}
        </Button>
      ),
    },
    {
      id: "margins", header: t("columns.margins"), size: 170, cell: ({ row }) => {
        const r = row.original;
        return <span className="tabular-nums">{[r.margin_top, r.margin_bottom, r.margin_left, r.margin_right].join(" / ")}</span>;
      },
    },
    {
      id: "position", header: t("columns.position"), size: 110, cell: ({ row }) => (
        <span className="tabular-nums">{row.original.page_number_x ?? "—"} / {row.original.page_number_y ?? "—"}</span>
      ),
    },
    { id: "created", header: t("columns.createdAt"), size: 130, cell: ({ row }) => format.dateTime(new Date(row.original.created_at), { dateStyle: "short" }) },
    {
      id: "actions", header: tg("list.actions"), size: 100, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => canEdit ? (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" aria-label={tg("actions.edit")} onClick={() => dialog.open(`tram/edit/${row.original.id}`)}><PencilIcon /></Button>
          <Button variant="ghost" size="icon-sm" aria-label={tg("actions.delete")} onClick={() => setToDelete(row.original)}><Trash2Icon /></Button>
        </div>
      ) : null,
    },
  ], [t, tg, format, dialog, canEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <Select value={link} onValueChange={setLink}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value={ALL}>{t("filters.allLinks")}</SelectItem>
            {["default", "client", "family"].map((l) => <SelectItem key={l} value={l}>{t(`links.${l}`)}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select>
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value={ALL}>{t("filters.allGroups")}</SelectItem>
            {TEMPLATE_GROUPS.map((g) => <SelectItem key={g.group} value={g.group}>{t(`groups.${g.group}`)}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select>
      </div>
      <ListToolbar current={shown.length} total={items.length} onAdd={canEdit ? openAdd : null} addLabel={t("add")} />
      <DataTable tableId="settings-trams" columns={columns} data={shown} getRowId={(r) => r.id}
        onRowClick={canEdit ? (r) => dialog.open(`tram/edit/${r.id}`) : undefined}
        emptyTitle={t("emptyTitle")} emptyDescription={t("emptyDescription")} />
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("deleteTitle")} description={tg("confirm.noTrash")} word="SUPPRIMER" confirmLabel={tg("actions.delete")}
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteTram(toDelete.id);
          if (res.ok) { notify.success(tg("toast.deleted")); router.refresh(); }
          else notify.error(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : tg("toast.error"));
        }} />
    </>
  );
}
