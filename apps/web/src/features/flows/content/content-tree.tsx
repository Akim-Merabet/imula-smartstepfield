"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDownIcon, ChevronRightIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, CopyIcon, EllipsisVerticalIcon, GripVerticalIcon,
  LinkIcon, MoveIcon, PencilIcon, PlusIcon, PowerIcon, PowerOffIcon, SearchIcon, Trash2Icon,
} from "lucide-react";
import { notify } from "@/components/common/notify";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  deletePhase, deleteStep, duplicatePhase, duplicateStep, moveStep, reorderPhases, setPhaseDisabled, setStepDisabled,
} from "../content-actions";
import type { ContentPhase, ContentStep, ProgressStatus } from "../queries";
import { contentError } from "./errors";
import { CommentDialog, PlacementDialog } from "./tree-dialogs";

export type TreePermissions = { edit: boolean; delete: boolean; deactivate: boolean };

const DOT: Record<ProgressStatus, string> = {
  todo: "bg-muted-foreground/40", opened: "bg-info", in_progress: "bg-warning", done: "bg-success", disabled: "border border-muted-foreground bg-transparent",
};

export function ProgressDot({ status }: { status: ProgressStatus }) {
  const t = useTranslations("flowContent.status");
  return (
    <Tooltip>
      <TooltipTrigger asChild><span className={cn("size-2.5 shrink-0 rounded-full", DOT[status])} aria-label={t(status)} /></TooltipTrigger>
      <TooltipContent>{t(status)}</TooltipContent>
    </Tooltip>
  );
}

type Pending =
  | { kind: "toggle-phase"; phase: ContentPhase } | { kind: "toggle-step"; step: ContentStep }
  | { kind: "delete-phase"; phase: ContentPhase } | { kind: "delete-step"; step: ContentStep }
  | { kind: "dup-phase"; phase: ContentPhase } | { kind: "move-phase"; phase: ContentPhase }
  | { kind: "dup-step"; step: ContentStep } | { kind: "move-step"; step: ContentStep };

function SortableRow({ id, disabled, children }: { id: string; disabled: boolean; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const handle = disabled ? null : (
    <button type="button" className="cursor-grab text-muted-foreground opacity-0 group-hover/row:opacity-100" {...attributes} {...listeners} aria-label="drag">
      <GripVerticalIcon className="size-3.5" />
    </button>
  );
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "z-10 opacity-70")}>
      {children(handle)}
    </div>
  );
}

/** Menu arborescent phases P{n} / étapes E{n} avec pastilles, actions et glisser-déposer (§4.1-4.3). */
export function ContentTree({ flowId, phases, numbers, selectedStepId, onSelectStep, permissions }: {
  flowId: string; phases: ContentPhase[]; numbers: Map<string, string>; selectedStepId: string | null;
  onSelectStep: (id: string) => void; permissions: TreePermissions;
}) {
  const t = useTranslations("flowContent");
  const tg = useTranslations("global");
  const router = useRouter();
  const dialog = useDialog();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState<string | null>(null);
  const [phasesOnly, setPhasesOnly] = useState(false);
  const [order, setOrder] = useState<string[] | null>(null);
  const [stepOrder, setStepOrder] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const orderedPhases = useMemo(() => {
    if (!order) return phases;
    const map = new Map(phases.map((p) => [p.id, p]));
    return order.map((id) => map.get(id)).filter(Boolean) as ContentPhase[];
  }, [order, phases]);
  const stepsOf = (p: ContentPhase) => {
    const o = stepOrder[p.id];
    if (!o) return p.steps;
    const map = new Map(p.steps.map((s) => [s.id, s]));
    return o.map((id) => map.get(id)).filter(Boolean) as ContentStep[];
  };

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, success = tg("toast.saved")) => {
    const res = await fn();
    if (!res.ok) { notify.error(contentError(t, tg, res.error)); return false; }
    notify.success(success);
    setPending(null);
    router.refresh();
    return true;
  };

  const onPhaseDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = orderedPhases.map((p) => p.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    setOrder(next);
    const res = await reorderPhases(flowId, next);
    if (!res.ok) { notify.error(contentError(t, tg, res.error)); setOrder(null); return; }
    router.refresh();
  };
  const onStepDragEnd = (phase: ContentPhase) => async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = stepsOf(phase).map((s) => s.id);
    const to = ids.indexOf(String(e.over.id));
    setStepOrder((o) => ({ ...o, [phase.id]: arrayMove(ids, ids.indexOf(String(e.active.id)), to) }));
    const res = await moveStep(String(e.active.id), phase.id, to + 1);
    if (!res.ok) { notify.error(contentError(t, tg, res.error)); setStepOrder((o) => ({ ...o, [phase.id]: ids })); return; }
    router.refresh();
  };

  const q = search?.trim().toLowerCase() ?? "";
  const matches = (name: string, num?: string) => !q || name.toLowerCase().includes(q) || (num ?? "").toLowerCase().includes(q);
  const phaseOptions = orderedPhases.map((p) => ({ value: p.id, label: `${numbers.get(p.id)} - ${p.name}` }));
  const stepOptions = Object.fromEntries(orderedPhases.map((p) => [p.id, stepsOf(p).map((s) => ({ value: s.id, label: `${numbers.get(s.id)} - ${s.name}` }))]));
  const canDrag = permissions.edit && !q;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b px-2 py-2">
        <span className="flex-1 truncate px-1 text-sm font-medium">{t("tree.title")}</span>
        <Button variant="ghost" size="icon-sm" aria-label={t("tree.search")} onClick={() => setSearch((s) => (s === null ? "" : null))}><SearchIcon /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={collapsed.size ? t("tree.expandAll") : t("tree.collapseAll")}
          onClick={() => setCollapsed((c) => (c.size ? new Set() : new Set(phases.map((p) => p.id))))}>
          {collapsed.size ? <ChevronsUpDownIcon /> : <ChevronsDownUpIcon />}
        </Button>
        {permissions.edit && (
          <Button variant="ghost" size="icon-sm" aria-label={t("tree.addPhase")} onClick={() => dialog.open(`flow-content/phase-add/${flowId}/general-tab`)}><PlusIcon /></Button>
        )}
      </div>
      {search !== null && (
        <div className="flex flex-col gap-2 border-b p-2">
          <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tg("list.searchPlaceholder")} />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={phasesOnly} onChange={(e) => setPhasesOnly(e.target.checked)} />{t("tree.phasesOnly")}
          </label>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {phases.length === 0 ? (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyTitle>{t("tree.emptyTitle")}</EmptyTitle>
              <EmptyDescription>{t("tree.emptySubtitle")}</EmptyDescription>
            </EmptyHeader>
            {permissions.edit && <Button size="sm" onClick={() => dialog.open(`flow-content/phase-add/${flowId}/general-tab`)}><PlusIcon data-icon="inline-start" />{t("tree.addPhase")}</Button>}
          </Empty>
        ) : (
          <DndContext id={`phases-${flowId}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onPhaseDragEnd}>
            <SortableContext items={orderedPhases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              {orderedPhases.map((p) => {
                const steps = stepsOf(p);
                const visibleSteps = steps.filter((s) => matches(s.name, numbers.get(s.id)));
                if (q && !matches(p.name, numbers.get(p.id)) && visibleSteps.length === 0) return null;
                const open = !collapsed.has(p.id) && !phasesOnly;
                return (
                  <SortableRow key={p.id} id={p.id} disabled={!canDrag}>
                    {(handle) => (
                      <div className="mb-1">
                        <div className={cn("group/row flex items-center gap-1 rounded px-1 py-1.5 text-sm hover:bg-accent", p.disabled && "text-muted-foreground line-through")}>
                          {handle}
                          <button type="button" aria-label={open ? t("tree.collapse") : t("tree.expand")} className="text-muted-foreground"
                            onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}>
                            {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
                          </button>
                          <ProgressDot status={p.progress} />
                          <span className="shrink-0 font-semibold">{numbers.get(p.id)}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                          {!p.mandatory && <span className="rounded bg-muted px-1 text-[0.65rem] no-underline">{t("tree.optional")}</span>}
                          <NodeMenu>
                            {permissions.edit && <DropdownMenuItem onSelect={() => dialog.open(`flow-content/phase-edit/${p.id}/general-tab`)}><PencilIcon />{t("tree.editPhase")}</DropdownMenuItem>}
                            {permissions.edit && <DropdownMenuItem onSelect={() => dialog.open(`flow-content/step-add/${p.id}/general-tab`)}><PlusIcon />{t("tree.addStep")}</DropdownMenuItem>}
                            {permissions.edit && <DropdownMenuItem onSelect={() => setPending({ kind: "dup-phase", phase: p })}><CopyIcon />{tg("actions.duplicate")}</DropdownMenuItem>}
                            {permissions.edit && <DropdownMenuItem onSelect={() => setPending({ kind: "move-phase", phase: p })}><MoveIcon />{t("tree.move")}</DropdownMenuItem>}
                            {permissions.deactivate && (
                              <DropdownMenuItem onSelect={() => setPending({ kind: "toggle-phase", phase: p })}>
                                {p.disabled ? <PowerIcon /> : <PowerOffIcon />}{p.disabled ? tg("actions.activate") : tg("actions.deactivate")}
                              </DropdownMenuItem>
                            )}
                            {permissions.delete && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setPending({ kind: "delete-phase", phase: p })}><Trash2Icon />{tg("actions.delete")}</DropdownMenuItem></>}
                          </NodeMenu>
                        </div>
                        {open && (
                          <div className="ml-5 border-l pl-2">
                            {steps.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">{t("tree.noStep")}</p>}
                            <DndContext id={`steps-${p.id}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onStepDragEnd(p)}>
                              <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                                {visibleSteps.map((s) => (
                                  <SortableRow key={s.id} id={s.id} disabled={!canDrag}>
                                    {(stepHandle) => (
                                      <div className={cn("group/row flex items-center gap-1 rounded px-1 py-1 text-sm",
                                        s.id === selectedStepId ? "bg-row-focus" : "hover:bg-accent", (s.disabled || p.disabled) && "text-muted-foreground line-through")}>
                                        {stepHandle}
                                        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelectStep(s.id)}>
                                          <ProgressDot status={s.progress} />
                                          <span className="shrink-0 font-medium">{numbers.get(s.id)}</span>
                                          <span className="truncate">{s.name}</span>
                                          {s.linked_flow && <LinkIcon className="size-3 shrink-0 text-muted-foreground" />}
                                        </button>
                                        <NodeMenu>
                                          {permissions.edit && <DropdownMenuItem onSelect={() => dialog.open(`flow-content/step-edit/${s.id}/general-tab`)}><PencilIcon />{t("tree.editStep")}</DropdownMenuItem>}
                                          {permissions.edit && <DropdownMenuItem onSelect={() => setPending({ kind: "dup-step", step: s })}><CopyIcon />{tg("actions.duplicate")}</DropdownMenuItem>}
                                          {permissions.edit && <DropdownMenuItem onSelect={() => setPending({ kind: "move-step", step: s })}><MoveIcon />{t("tree.move")}</DropdownMenuItem>}
                                          {permissions.deactivate && (
                                            <DropdownMenuItem onSelect={() => setPending({ kind: "toggle-step", step: s })}>
                                              {s.disabled ? <PowerIcon /> : <PowerOffIcon />}{s.disabled ? tg("actions.activate") : tg("actions.deactivate")}
                                            </DropdownMenuItem>
                                          )}
                                          {permissions.delete && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setPending({ kind: "delete-step", step: s })}><Trash2Icon />{tg("actions.delete")}</DropdownMenuItem></>}
                                        </NodeMenu>
                                      </div>
                                    )}
                                  </SortableRow>
                                ))}
                              </SortableContext>
                            </DndContext>
                          </div>
                        )}
                      </div>
                    )}
                  </SortableRow>
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {(pending?.kind === "toggle-phase" || pending?.kind === "toggle-step") && (() => {
        const target = pending.kind === "toggle-phase" ? pending.phase : pending.step;
        const isPhase = pending.kind === "toggle-phase";
        const title = t(`${isPhase ? "phase" : "step"}.${target.disabled ? "activateTitle" : "deactivateTitle"}`);
        return (
          <CommentDialog title={title} onClose={() => setPending(null)} onConfirm={async (comment) => {
            await run(() => (isPhase ? setPhaseDisabled(target.id, !target.disabled, comment) : setStepDisabled(target.id, !target.disabled, comment)));
          }} />
        );
      })()}
      {pending?.kind === "dup-phase" && (
        <PlacementDialog title={t("phase.duplicateTitle")} mode="before" phases={phaseOptions} onClose={() => setPending(null)}
          onConfirm={async (_p, ref) => { await run(() => duplicatePhase(pending.phase.id, ref), t("phase.duplicated")); }} />
      )}
      {pending?.kind === "move-phase" && (
        <PlacementDialog title={t("phase.moveTitle")} mode="after" phases={phaseOptions.filter((o) => o.value !== pending.phase.id)} onClose={() => setPending(null)}
          onConfirm={async (_p, ref) => {
            const ids = orderedPhases.map((p) => p.id).filter((id) => id !== pending.phase.id);
            ids.splice(ref ? ids.indexOf(ref) + 1 : 0, 0, pending.phase.id);
            await run(() => reorderPhases(flowId, ids));
          }} />
      )}
      {pending?.kind === "dup-step" && (
        <PlacementDialog title={t("step.duplicateTitle")} mode="before" phases={phaseOptions} steps={stepOptions} initialPhase={pending.step.phase_id}
          onClose={() => setPending(null)}
          onConfirm={async (phaseId, ref) => { await run(() => duplicateStep(pending.step.id, phaseId!, ref), t("step.duplicated")); }} />
      )}
      {pending?.kind === "move-step" && (
        <PlacementDialog title={t("step.moveTitle")} mode="after" phases={phaseOptions}
          steps={Object.fromEntries(Object.entries(stepOptions).map(([k, v]) => [k, v.filter((o) => o.value !== pending.step.id)]))}
          initialPhase={pending.step.phase_id} onClose={() => setPending(null)}
          onConfirm={async (phaseId, ref) => {
            const list = (stepOptions[phaseId!] ?? []).map((o) => o.value).filter((id) => id !== pending.step.id);
            await run(() => moveStep(pending.step.id, phaseId!, ref ? list.indexOf(ref) + 2 : 1));
          }} />
      )}
      <ConfirmDialog
        open={pending?.kind === "delete-phase" || pending?.kind === "delete-step"}
        onOpenChange={(o) => { if (!o) setPending(null); }}
        title={pending?.kind === "delete-phase" ? t("phase.deleteTitle", { name: pending.phase.name }) : pending?.kind === "delete-step" ? t("step.deleteTitle", { name: pending.step.name }) : ""}
        description={tg("confirm.noTrash")}
        confirmLabel={tg("actions.delete")}
        onConfirm={async () => {
          if (pending?.kind === "delete-phase") await run(() => deletePhase(pending.phase.id), tg("toast.deleted"));
          if (pending?.kind === "delete-step") await run(() => deleteStep(pending.step.id), tg("toast.deleted"));
        }}
      />
    </div>
  );
}

function NodeMenu({ children }: { children: React.ReactNode }) {
  const tg = useTranslations("global");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={tg("actions.more")} className="opacity-60 group-hover/row:opacity-100"><EllipsisVerticalIcon /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start"><DropdownMenuGroup>{children}</DropdownMenuGroup></DropdownMenuContent>
    </DropdownMenu>
  );
}
