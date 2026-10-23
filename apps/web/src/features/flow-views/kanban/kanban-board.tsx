"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SearchIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { setFlowStatus } from "@/features/flows/actions";
import { FlowTypeBadge } from "@/features/flows/components/flow-type-badge";
import type { ViewFlow } from "../queries";

export const STATE_ORDER = ["todo", "in_preparation", "in_operation", "in_progress", "done"] as const;
const GROUPS = ["none", "family", "category", "reporter", "responsible"] as const;
type GroupBy = (typeof GROUPS)[number];
type Status = { id: string; name: string; color: string; category: string };
const NO_STATUS = "__none";
const NO_LANE = "__nolane";

type Lane = { key: string; label: string; color?: string | null };

/** Vue kanban (§3.2) : colonnes = statuts de nature flow groupés par état, couloirs optionnels, glisser-déposer = changement de statut. */
export function KanbanBoard({ projectId, flows: initial, statuses, canEditStatus }: {
  projectId: string; flows: ViewFlow[]; statuses: Status[]; canEditStatus: boolean;
}) {
  const t = useTranslations("flowViews.kanban");
  const tf = useTranslations("flows");
  const tg = useTranslations("global");
  const router = useRouter();
  const [flows, setFlows] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) { setPrevInitial(initial); setFlows(initial); }
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<ViewFlow | null>(null);
  const [pendingMove, setPendingMove] = useState<{ flow: ViewFlow; status: Status } | null>(null);
  const [comment, setComment] = useState("");
  const [saving, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const columns = useMemo(() => {
    const sorted = [...statuses].sort((a, b) => STATE_ORDER.indexOf(a.category as never) - STATE_ORDER.indexOf(b.category as never));
    const cols: (Status | null)[] = sorted;
    if (flows.some((f) => !f.custom_status_id || !statuses.some((s) => s.id === f.custom_status_id))) cols.push(null);
    return cols;
  }, [statuses, flows]);

  const states = useMemo(() => {
    const out: { category: string; count: number }[] = [];
    for (const c of columns) {
      const cat = c?.category ?? NO_STATUS;
      const last = out.at(-1);
      if (last && last.category === cat) last.count += 1; else out.push({ category: cat, count: 1 });
    }
    return out;
  }, [columns]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? flows.filter((f) => f.name.toLowerCase().includes(q) || (f.ref_int ?? "").toLowerCase().includes(q)) : flows;
  }, [flows, query]);

  const laneKeys = (f: ViewFlow): string[] => {
    switch (groupBy) {
      case "family": return [f.family_id ?? NO_LANE];
      case "category": return [f.category_id ?? NO_LANE];
      case "reporter": return [f.reporter_id ?? NO_LANE];
      case "responsible": {
        const ids = f.assignees.flatMap((a) => (a.collaborator ? [a.collaborator.id] : []));
        return ids.length ? ids : [NO_LANE];
      }
      default: return ["all"];
    }
  };

  const lanes = useMemo((): Lane[] => {
    if (groupBy === "none") return [{ key: "all", label: "" }];
    const map = new Map<string, Lane>();
    for (const f of visible) {
      if (groupBy === "family" && f.family) map.set(f.family.id, { key: f.family.id, label: f.family.short_name, color: f.family.color });
      if (groupBy === "category" && f.category) map.set(f.category.id, { key: f.category.id, label: f.category.short_name, color: f.category.color });
      if (groupBy === "reporter" && f.reporter) map.set(f.reporter.id, { key: f.reporter.id, label: `${f.reporter.first_name} ${f.reporter.last_name}` });
      if (groupBy === "responsible") for (const a of f.assignees) if (a.collaborator) {
        map.set(a.collaborator.id, { key: a.collaborator.id, label: `${a.collaborator.first_name} ${a.collaborator.last_name}` });
      }
    }
    const list = [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
    if (visible.some((f) => laneKeys(f).includes(NO_LANE))) list.push({ key: NO_LANE, label: t(`noLane.${groupBy}`) });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, groupBy, t]);

  const colKey = (f: ViewFlow) => (f.custom_status_id && statuses.some((s) => s.id === f.custom_status_id) ? f.custom_status_id : NO_STATUS);

  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current as { flow: ViewFlow }).flow);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const flow = (e.active.data.current as { flow: ViewFlow } | undefined)?.flow;
    const target = e.over?.data.current as { statusId: string } | undefined;
    if (!flow || !target || target.statusId === NO_STATUS || target.statusId === flow.custom_status_id) return;
    const status = statuses.find((s) => s.id === target.statusId);
    if (status) { setComment(""); setPendingMove({ flow, status }); }
  };

  const confirmMove = () => {
    if (!pendingMove) return;
    const { flow, status } = pendingMove;
    const before = flows;
    setFlows((list) => list.map((f) => (f.id === flow.id ? { ...f, custom_status_id: status.id, status } : f)));
    setPendingMove(null);
    start(async () => {
      const res = await setFlowStatus(flow.id, status.id, comment.trim() || null);
      if (!res.ok) {
        setFlows(before);
        notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error"));
        return;
      }
      notify.success(t("moved", { name: flow.name, status: status.name }));
      router.refresh();
    });
  };

  const gridTemplate = { gridTemplateColumns: `repeat(${columns.length}, minmax(16rem, 1fr))` };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <InputGroup className="w-72">
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tg("actions.search")} aria-label={tg("actions.search")} />
        </InputGroup>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("groupBy")}</span>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="w-56" aria-label={t("groupBy")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {GROUPS.map((g) => <SelectItem key={g} value={g}>{t(`groups.${g}`)}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <span className="ml-auto text-sm text-muted-foreground">{t("count", { count: visible.length })}</span>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40">
          <div className="grid min-w-max gap-x-3 px-3" style={gridTemplate}>
            {states.map((s, i) => (
              <div key={`${s.category}-${i}`} className="sticky top-0 z-10 bg-muted/95 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                style={{ gridColumn: `span ${s.count}` }}>
                {s.category === NO_STATUS ? t("noStatus") : tf(`statusCategories.${s.category}` as never)}
              </div>
            ))}
            {columns.map((c) => (
              <div key={c?.id ?? NO_STATUS} className="sticky top-8 z-10 flex items-center gap-2 border-b bg-muted/95 py-2 text-sm font-medium">
                <span className="size-3 rounded-[2px]" style={{ backgroundColor: c?.color ?? "#828282" }} />
                <span className="truncate">{c?.name ?? t("noStatus")}</span>
                <span className="ml-auto rounded bg-background px-1.5 text-xs text-muted-foreground">
                  {visible.filter((f) => colKey(f) === (c?.id ?? NO_STATUS)).length}
                </span>
              </div>
            ))}
          </div>
          {lanes.map((lane) => (
            <div key={lane.key} className="px-3 pb-3">
              {groupBy !== "none" && (
                <div className="sticky left-0 flex items-center gap-2 pt-3 pb-1 text-sm font-medium">
                  {lane.color && <span className="size-3 rounded-full" style={{ backgroundColor: lane.color }} />}
                  {lane.label}
                </div>
              )}
              <div className="grid min-w-max gap-x-3" style={gridTemplate}>
                {columns.map((c) => {
                  const statusId = c?.id ?? NO_STATUS;
                  const cards = visible.filter((f) => colKey(f) === statusId && laneKeys(f).includes(lane.key));
                  return (
                    <KanbanColumn key={statusId} id={`${lane.key}|${statusId}`} statusId={statusId} disabled={!canEditStatus || !c}>
                      {cards.map((f) => (
                        <KanbanCard key={`${lane.key}:${f.id}`} id={`${lane.key}:${f.id}`} flow={f} projectId={projectId} draggable={canEditStatus} />
                      ))}
                    </KanbanColumn>
                  );
                })}
              </div>
            </div>
          ))}
          {visible.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>}
        </div>
        <DragOverlay>{dragging ? <CardBody flow={dragging} className="rotate-2 shadow-lg" /> : null}</DragOverlay>
      </DndContext>

      <Dialog open={!!pendingMove} onOpenChange={(o) => { if (!o) setPendingMove(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tf("statusPopover.title")}</DialogTitle>
            <DialogDescription>
              {pendingMove && t("confirmMove", { name: pendingMove.flow.name, status: pendingMove.status.name })}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="kanban-comment">{tf("statusPopover.comment")}</FieldLabel>
              <Textarea id="kanban-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPendingMove(null)}>{tg("actions.cancel")}</Button>
            <Button onClick={confirmMove} disabled={saving}>{saving && <Spinner data-icon="inline-start" />}{tg("actions.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KanbanColumn({ id, statusId, disabled, children }: { id: string; statusId: string; disabled: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { statusId }, disabled });
  return (
    <div ref={setNodeRef} className={cn("flex min-h-24 flex-col gap-2 rounded-md p-1 pt-2 transition-colors", isOver && "bg-primary/10 ring-2 ring-primary/40")}>
      {children}
    </div>
  );
}

function KanbanCard({ id, flow, projectId, draggable }: { id: string; flow: ViewFlow; projectId: string; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data: { flow }, disabled: !draggable });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn(draggable && "cursor-grab", isDragging && "opacity-40")}>
      <CardBody flow={flow} href={`/explore/projects/${projectId}/flow/${flow.id}/content-view`} />
    </div>
  );
}

function CardBody({ flow, href, className }: { flow: ViewFlow; href?: string; className?: string }) {
  const t = useTranslations("flowViews.kanban");
  const people = flow.assignees.flatMap((a) => (a.collaborator ? [a.collaborator] : []));
  return (
    <div className={cn("flex flex-col gap-2 rounded-md border bg-card p-3 text-sm shadow-xs", className)}>
      <div className="flex items-start gap-2">
        <FlowTypeBadge type={flow.flow_type} size="sm" />
        {href ? (
          <Link href={href} className="min-w-0 flex-1 font-medium break-words hover:underline" onPointerDown={(e) => e.stopPropagation()}>{flow.name}</Link>
        ) : <span className="min-w-0 flex-1 font-medium break-words">{flow.name}</span>}
      </div>
      {flow.ref_int && <span className="text-xs text-muted-foreground">{flow.ref_int}</span>}
      <div className="flex flex-wrap items-center gap-2">
        {flow.family && <FamilyChip color={flow.family.color} shortName={flow.family.short_name} longName={flow.family.long_name} />}
        <span className="ml-auto flex" aria-label={t("assignees")}>
          {people.slice(0, 4).map((p) => (
            <span key={p.id} title={`${p.first_name} ${p.last_name}`}
              className="-ml-1 inline-flex size-6 items-center justify-center rounded-full border-2 border-card bg-primary first:ml-0 text-[0.6rem] font-semibold text-primary-foreground">
              {p.trigram || `${p.first_name[0] ?? ""}${p.last_name[0] ?? ""}`}
            </span>
          ))}
          {people.length > 4 && <span className="inline-flex size-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[0.6rem]">+{people.length - 4}</span>}
        </span>
      </div>
    </div>
  );
}
