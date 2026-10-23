"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { AwardIcon, HardHatIcon, PencilIcon, ShuffleIcon, Trash2Icon, UserPlusIcon, UserRoundIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { DataTable } from "@/components/data-table/data-table";
import { useRegisterPageAdd } from "@/components/shell/page-actions";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { removeMember, reorganizeMembers } from "../actions";
import type { MemberRow } from "../queries";
import { HierarchyPicker, type HierarchyOption } from "./hierarchy-picker";

const EDITABLE_ROLES = ["readonly", "writer", "expert", "responsible"] as const;

export function MembersTable({ projectId, members, total, hierarchies, permissions }: {
  projectId: string; members: MemberRow[]; total: number; hierarchies: HierarchyOption[];
  permissions: { add: boolean; edit: boolean; delete: boolean };
}) {
  const t = useTranslations("dashboard");
  const tg = useTranslations("global");
  const router = useRouter();
  const dialog = useDialog();
  const [selected, setSelected] = useState<string[]>([]);
  const [toDelete, setToDelete] = useState<MemberRow | null>(null);
  const [reorganizeOpen, setReorganizeOpen] = useState(false);

  const openImport = useCallback(() => dialog.open(`project-member/import/${projectId}`), [dialog, projectId]);
  useRegisterPageAdd(permissions.add ? openImport : null);

  const fullName = (m: MemberRow) => (m.collaborator ? `${m.collaborator.first_name} ${m.collaborator.last_name}` : "");

  const columns = useMemo<ColumnDef<MemberRow, unknown>[]>(() => [
    {
      id: "type", header: t("members.columns.type"), size: 80,
      cell: ({ row }) => {
        const op = row.original.collaborator?.kind === "operator";
        const Icon = op ? HardHatIcon : UserRoundIcon;
        return (
          <Tooltip>
            <TooltipTrigger asChild><span className="inline-flex"><Icon className="size-4" aria-label={t(`kinds.${op ? "operator" : "user"}`)} /></span></TooltipTrigger>
            <TooltipContent>{t(`kinds.${op ? "operator" : "user"}`)}</TooltipContent>
          </Tooltip>
        );
      },
    },
    { id: "lastName", header: t("members.columns.lastName"), size: 160, cell: ({ row }) => <span className="font-medium">{row.original.collaborator?.last_name}</span> },
    { id: "firstName", header: t("members.columns.firstName"), size: 160, cell: ({ row }) => row.original.collaborator?.first_name },
    {
      id: "function", header: t("members.columns.function"), size: 140,
      cell: ({ row }) => { const f = row.original.collaborator?.function; return <FamilyChip color={f?.color} shortName={f?.short_name} longName={f?.long_name} />; },
    },
    {
      id: "group", header: t("members.columns.group"), size: 140,
      cell: ({ row }) => { const f = row.original.collaborator?.group; return <FamilyChip color={f?.color} shortName={f?.short_name} longName={f?.long_name} />; },
    },
    { id: "role", header: t("members.columns.role"), size: 130, cell: ({ row }) => t(`roles.${row.original.role}`) },
    {
      id: "hierarchy", header: t("members.columns.hierarchy"), size: 200,
      cell: ({ row }) => {
        const list = row.original.hierarchies.map((h) => h.hierarchy).filter(Boolean);
        if (!list.length) return <span className="text-muted-foreground">—</span>;
        return <div className="flex flex-wrap gap-1">{list.map((h) => <FamilyChip key={h!.id} color={h!.color} shortName={h!.short_name} longName={h!.long_name} />)}</div>;
      },
    },
    { id: "company", header: t("members.columns.company"), size: 160, cell: ({ row }) => row.original.collaborator?.company?.name ?? "—" },
    {
      id: "actions", header: tg("list.actions"), size: 130, enableResizing: false, meta: { sticky: true },
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t("members.actions.skills")} onClick={() => dialog.open(`project-member/skills/${m.collaborator_id}`)}>
                  <AwardIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("members.actions.skills")}</TooltipContent>
            </Tooltip>
            {permissions.edit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t("members.actions.edit")} onClick={() => dialog.open(`project-member/edit/${projectId}/${m.collaborator_id}`)}>
                    <PencilIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("members.actions.edit")}</TooltipContent>
              </Tooltip>
            )}
            {permissions.delete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t("members.actions.delete")} onClick={() => setToDelete(m)}>
                    <Trash2Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("members.actions.delete")}</TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      },
    },
  ], [t, tg, dialog, projectId, permissions.edit, permissions.delete]);

  return (
    <>
      <div className="flex items-center justify-between gap-2 pb-2 text-sm text-muted-foreground">
        <span>{selected.length ? tg("list.selected", { count: selected.length }) : tg("list.counter", { current: members.length, total })}</span>
        <div className="flex gap-2">
          {permissions.edit && (
            <Button variant="secondary" disabled={!selected.length} onClick={() => setReorganizeOpen(true)}>
              <ShuffleIcon data-icon="inline-start" />{t("members.actions.reorganize")}
            </Button>
          )}
          {permissions.add && (
            <Button onClick={openImport}><UserPlusIcon data-icon="inline-start" />{t("members.actions.import")}</Button>
          )}
        </div>
      </div>
      <DataTable
        tableId="project-members"
        columns={columns}
        data={members}
        getRowId={(m) => m.collaborator_id}
        selectable={permissions.edit}
        onSelectionChange={setSelected}
        onRowClick={permissions.edit ? (m) => dialog.open(`project-member/edit/${projectId}/${m.collaborator_id}`) : undefined}
        emptyTitle={tg("list.emptyTitle")}
        emptyDescription={tg("list.emptySubtitle")}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t("members.delete.title", { name: toDelete ? fullName(toDelete) : "" })}
        description={t("members.delete.subtitle")}
        confirmLabel={tg("actions.delete")}
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await removeMember(projectId, toDelete.collaborator_id);
          if (res.ok) { notify.success(tg("toast.deleted")); router.refresh(); return; }
          if (res.error === "in_flows") {
            const flows = (res.details as { flows: string[] } | undefined)?.flows ?? [];
            notify.error(tg("toast.error"), t("members.delete.inFlows", { flows: flows.join(", ") }));
          } else notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error"));
        }}
      />
      {reorganizeOpen && (
        <ReorganizeDialog projectId={projectId} ids={selected} hierarchies={hierarchies}
          hasOperators={members.some((m) => selected.includes(m.collaborator_id) && m.collaborator?.kind === "operator")}
          onClose={() => setReorganizeOpen(false)} />
      )}
    </>
  );
}

function ReorganizeDialog({ projectId, ids, hierarchies, hasOperators, onClose }: {
  projectId: string; ids: string[]; hierarchies: HierarchyOption[]; hasOperators: boolean; onClose: () => void;
}) {
  const t = useTranslations("dashboard");
  const tg = useTranslations("global");
  const router = useRouter();
  const [kind, setKind] = useState<"role" | "hierarchy">("role");
  const [role, setRole] = useState<string>("writer");
  const [hier, setHier] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const categoryLabel = kind === "role" ? t("members.columns.role") : t("members.columns.hierarchy");

  const submit = () => start(async () => {
    const res = await reorganizeMembers(projectId, ids, kind === "role" ? { kind, role } : { kind, hierarchyIds: hier });
    if (!res.ok) { notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error")); return; }
    notify.success(tg("toast.saved"));
    router.refresh();
    onClose();
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("members.reorganize.title")}</DialogTitle>
          <DialogDescription>{t("members.reorganize.sentence", { category: categoryLabel.toLowerCase(), count: ids.length })}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>{t("members.reorganize.category")}</FieldLabel>
            <Select value={kind} onValueChange={(v) => setKind(v as "role" | "hierarchy")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="role">{t("members.columns.role")}</SelectItem>
                  <SelectItem value="hierarchy">{t("members.columns.hierarchy")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {kind === "role" ? (
            <Field>
              <FieldLabel>{t("members.reorganize.value")}</FieldLabel>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>{EDITABLE_ROLES.map((r) => <SelectItem key={r} value={r}>{t(`roles.${r}`)}</SelectItem>)}</SelectGroup>
                </SelectContent>
              </Select>
              {hasOperators && <FieldDescription>{t("members.reorganize.operatorsSkipped")}</FieldDescription>}
            </Field>
          ) : (
            <Field>
              <FieldLabel>{t("members.reorganize.value")}</FieldLabel>
              <HierarchyPicker options={hierarchies} value={hier} onChange={setHier} />
            </Field>
          )}
        </FieldGroup>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
          <Button onClick={submit} disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{t("members.reorganize.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
