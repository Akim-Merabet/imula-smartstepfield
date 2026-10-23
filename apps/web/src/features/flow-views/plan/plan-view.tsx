"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { addDays, format, startOfDay } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import {
  CalendarClockIcon, ChartGanttIcon, ColumnsIcon, DiamondIcon, EllipsisVerticalIcon, LinkIcon, PencilIcon, PlusIcon, Trash2Icon,
  XIcon,
} from "lucide-react";
import { notify } from "@/components/common/notify";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FlowTypeBadge } from "@/features/flows/components/flow-type-badge";
import { STATE_ORDER } from "../kanban/kanban-board";
import type { ViewFlow } from "../queries";
import { createPlanLink, deletePlan, removePlanFlow, updateFlowPlanDates } from "./actions";
import { AddContentDialog, DependencyDialog, MilestoneDialog, PlanDialog } from "./plan-dialogs";
import { cells, computeRange, dayOffset, HEADER_UNITS, PERIODS, PX_PER_DAY, type Period } from "./timeline";

export type Plan = { id: string; name: string; description: string | null; scale: string };
export type PlanLink = { id: string; from_element_id: string; to_element_id: string; dependency_type: string };
export type Milestone = { id: string; name: string; date: string; color: string; description: string | null };
type Bar = { start: Date; end: Date; kind: "estimated" | "planned" };
type GroupBy = "none" | "family" | "category" | "status" | "type";
const GROUPS: GroupBy[] = ["none", "family", "category", "status", "type"];

const ROW = 36, HEAD = 56, COLS = { name: 280, state: 130, start: 96, end: 96, assignment: 140 };
const DAY = 86_400_000;

function barOf(f: ViewFlow): Bar | null {
  const pick = (a: string | null, b: string | null) => {
    if (!a && !b) return null;
    const s = new Date(a ?? b!), e = new Date(b ?? a!);
    return { start: s, end: e.getTime() - s.getTime() < 3_600_000 ? new Date(s.getTime() + DAY) : e };
  };
  const est = pick(f.estimated_start_date, f.estimated_end_date);
  if (est) return { ...est, kind: "estimated" };
  const plan = pick(f.start_date, f.finish_date);
  return plan ? { ...plan, kind: "planned" } : null;
}

/** Vue plan (Gantt maison, §3.4). */
export function PlanView({ projectId, plans, plan, flows, elements, links, milestones, permissions }: {
  projectId: string; plans: Plan[]; plan: Plan | null; flows: ViewFlow[];
  elements: { id: string; flow_id: string | null }[]; links: PlanLink[]; milestones: Milestone[];
  permissions: { add: boolean; edit: boolean; delete: boolean; editDates: boolean };
}) {
  const t = useTranslations("flowViews.plan");
  const tf = useTranslations("flows");
  const tg = useTranslations("global");
  const locale = useLocale() === "en" ? enUS : fr;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dialog = useDialog();
  const [period, setPeriod] = useState<Period>("week");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [showColumns, setShowColumns] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, Bar>>({});
  const [drag, setDrag] = useState<{ flowId: string; mode: "move" | "start" | "end"; x0: number; delta: number } | null>(null);
  const [linkFrom, setLinkFrom] = useState<{ flowId: string; side: "start" | "end" } | null>(null);
  const [planDialog, setPlanDialog] = useState<"create" | "edit" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [milestone, setMilestone] = useState<Milestone | "new" | null>(null);
  const [addContent, setAddContent] = useState(false);
  const [depsOf, setDepsOf] = useState<string | null>(null);
  const [, start] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const px = PX_PER_DAY[period];

  const [prevFlows, setPrevFlows] = useState(flows);
  if (prevFlows !== flows) { setPrevFlows(flows); setOverrides({}); }

  const selectPlan = (id: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("plan", id);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const elementFlow = useMemo(() => new Map(elements.map((e) => [e.id, e.flow_id])), [elements]);
  const planFlows = useMemo(() => {
    if (!plan) return [];
    if (plan.scale === "temporal") {
      const ids = new Set(elements.map((e) => e.flow_id));
      return flows.filter((f) => ids.has(f.id));
    }
    return flows;
  }, [plan, flows, elements]);

  const bars = useMemo(() => {
    const m = new Map<string, Bar | null>();
    for (const f of planFlows) m.set(f.id, overrides[f.id] ?? barOf(f));
    return m;
  }, [planFlows, overrides]);

  const range = useMemo(() => {
    const dates: Date[] = [];
    for (const b of bars.values()) if (b) dates.push(b.start, b.end);
    for (const m of milestones) dates.push(new Date(m.date));
    return computeRange(dates, period);
  }, [bars, milestones, period]);
  const totalDays = Math.round((range.to.getTime() - range.from.getTime()) / DAY);
  const width = totalDays * px;
  const [topUnit, lowUnit] = HEADER_UNITS[period];
  const prefix = { week: t("prefix.week"), quarter: t("prefix.quarter") };
  const topCells = cells(topUnit, range.from, range.to, locale, prefix);
  const lowCells = topUnit === lowUnit ? [] : cells(lowUnit, range.from, range.to, locale, prefix);

  // Lignes (avec regroupement).
  type Row = { kind: "group"; key: string; label: string; color?: string | null; count: number } | { kind: "flow"; flow: ViewFlow };
  const rows = useMemo((): Row[] => {
    const sorted = [...planFlows].sort((a, b) => (bars.get(a.id)?.start.getTime() ?? Infinity) - (bars.get(b.id)?.start.getTime() ?? Infinity) || a.name.localeCompare(b.name));
    if (groupBy === "none") return sorted.map((flow) => ({ kind: "flow" as const, flow }));
    const keyOf = (f: ViewFlow): { key: string; label: string; color?: string | null; order: number } => {
      switch (groupBy) {
        case "family": return f.family ? { key: f.family.id, label: f.family.short_name, color: f.family.color, order: 0 } : { key: "_", label: t("noGroup"), order: 1 };
        case "category": return f.category ? { key: f.category.id, label: f.category.short_name, color: f.category.color, order: 0 } : { key: "_", label: t("noGroup"), order: 1 };
        case "status": return f.status ? { key: f.status.id, label: f.status.name, color: f.status.color, order: STATE_ORDER.indexOf(f.status.category as never) } : { key: "_", label: t("noGroup"), order: 9 };
        default: return { key: f.flow_type, label: tf(`types.${f.flow_type}`), order: 0 };
      }
    };
    const groups = new Map<string, { meta: ReturnType<typeof keyOf>; flows: ViewFlow[] }>();
    for (const f of sorted) {
      const meta = keyOf(f);
      const g = groups.get(meta.key) ?? { meta, flows: [] };
      g.flows.push(f);
      groups.set(meta.key, g);
    }
    return [...groups.values()].sort((a, b) => a.meta.order - b.meta.order || a.meta.label.localeCompare(b.meta.label))
      .flatMap((g) => [{ kind: "group" as const, key: g.meta.key, label: g.meta.label, color: g.meta.color, count: g.flows.length },
        ...g.flows.map((flow) => ({ kind: "flow" as const, flow }))]);
  }, [planFlows, bars, groupBy, t, tf]);

  const rowIndex = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => { if (r.kind === "flow") m.set(r.flow.id, i); });
    return m;
  }, [rows]);

  const leftWidth = showColumns ? Object.values(COLS).reduce((a, b) => a + b, 0) : COLS.name;
  const xOf = (d: Date) => dayOffset(range.from, d) * px;

  const scrollToToday = () => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: Math.max(0, xOf(startOfDay(new Date())) - (el.clientWidth - leftWidth) / 2), behavior: "smooth" });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { scrollToToday(); }, [period, plan?.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLinkFrom(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown = (flowId: string): Bar | null => {
    const b = bars.get(flowId) ?? null;
    if (!b || !drag || drag.flowId !== flowId || drag.delta === 0) return b;
    const ms = drag.delta * DAY;
    if (drag.mode === "move") return { ...b, start: new Date(b.start.getTime() + ms), end: new Date(b.end.getTime() + ms) };
    if (drag.mode === "start") return { ...b, start: new Date(Math.min(b.start.getTime() + ms, b.end.getTime() - DAY)) };
    return { ...b, end: new Date(Math.max(b.end.getTime() + ms, b.start.getTime() + DAY)) };
  };

  const saveDates = (flow: ViewFlow, bar: Bar) => {
    setOverrides((o) => ({ ...o, [flow.id]: { ...bar, kind: "estimated" } }));
    start(async () => {
      const res = await updateFlowPlanDates(flow.id, bar.start.toISOString(), bar.end.toISOString());
      if (!res.ok) {
        setOverrides((o) => { const n = { ...o }; delete n[flow.id]; return n; });
        notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error"));
        return;
      }
      notify.success(t("datesSaved", { name: flow.name }));
      router.refresh();
    });
  };

  const onBarPointerDown = (e: ReactPointerEvent, flow: ViewFlow, mode: "move" | "start" | "end") => {
    if (linkFrom) return;
    if (!permissions.editDates) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ flowId: flow.id, mode, x0: e.clientX, delta: 0 });
  };
  const onBarPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const delta = Math.round((e.clientX - drag.x0) / px);
    if (delta !== drag.delta) setDrag({ ...drag, delta });
  };
  const onBarPointerUp = (flow: ViewFlow) => {
    if (!drag) return;
    const bar = shown(flow.id);
    const moved = drag.delta !== 0;
    setDrag(null);
    if (moved && bar) saveDates(flow, bar);
  };

  const onBarClick = (flow: ViewFlow) => {
    if (!linkFrom || !plan) return;
    if (linkFrom.flowId === flow.id) { setLinkFrom(null); return; }
    const from = linkFrom;
    setLinkFrom(null);
    start(async () => {
      const res = await createPlanLink(plan.id, from.flowId, flow.id, from.side === "end" ? "end_start" : "start_end");
      if (!res.ok) {
        notify.error(res.error === "link_exists" ? t("linkExists") : res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error"));
        return;
      }
      notify.success(t("linkCreated"));
      router.refresh();
    });
  };

  const createBarAt = (flow: ViewFlow, clientX: number, track: HTMLElement) => {
    if (!permissions.editDates) return;
    const x = clientX - track.getBoundingClientRect().left;
    const day = startOfDay(addDays(range.from, Math.floor(x / px)));
    saveDates(flow, { start: day, end: addDays(day, period === "day" ? 1 : 7), kind: "estimated" });
  };

  // Dépendances : extrémités et chevauchements.
  const arrows = useMemo(() => links.flatMap((l) => {
    const fromFlow = elementFlow.get(l.from_element_id), toFlow = elementFlow.get(l.to_element_id);
    if (!fromFlow || !toFlow) return [];
    const fi = rowIndex.get(fromFlow), ti = rowIndex.get(toFlow);
    const fb = bars.get(fromFlow), tb = bars.get(toFlow);
    if (fi === undefined || ti === undefined || !fb || !tb) return [];
    const endStart = l.dependency_type === "end_start";
    const x1 = xOf(endStart ? fb.end : fb.start), x2 = xOf(endStart ? tb.start : tb.end);
    const overlap = endStart ? tb.start < fb.end : tb.end < fb.start;
    return [{ id: l.id, x1, y1: fi * ROW + ROW / 2, x2, y2: ti * ROW + ROW / 2, overlap, endStart }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [links, elementFlow, rowIndex, bars, range, px]);

  if (!plan) {
    return (
      <>
        <Empty className="flex-1 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ChartGanttIcon /></EmptyMedia>
            <EmptyTitle>{plans.length ? t("selectPlan") : t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptySubtitle")}</EmptyDescription>
          </EmptyHeader>
          {permissions.add && (
            <EmptyContent><Button onClick={() => setPlanDialog("create")}><PlusIcon data-icon="inline-start" />{t("createPlan")}</Button></EmptyContent>
          )}
        </Empty>
        {planDialog && <PlanDialog projectId={projectId} plan={null} onClose={() => setPlanDialog(null)} onSaved={(id) => { setPlanDialog(null); selectPlan(id); }} />}
      </>
    );
  }

  const today = xOf(startOfDay(new Date()));
  const depsFlow = depsOf ? planFlows.find((f) => f.id === depsOf) ?? null : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={plan.id} onValueChange={selectPlan}>
          <SelectTrigger className="w-64" aria-label={t("selectPlan")}><SelectValue placeholder={t("selectPlan")} /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {t(`scale.${p.scale}`)}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
        {permissions.add && <Button variant="secondary" size="icon" aria-label={t("createPlan")} onClick={() => setPlanDialog("create")}><PlusIcon /></Button>}
        {permissions.edit && <Button variant="ghost" size="icon" aria-label={t("editPlan")} onClick={() => setPlanDialog("edit")}><PencilIcon /></Button>}
        {permissions.delete && <Button variant="ghost" size="icon" aria-label={t("deletePlan")} onClick={() => setConfirmDelete(true)}><Trash2Icon /></Button>}
        <ToggleGroup type="single" variant="outline" size="sm" value={period} onValueChange={(v) => v && setPeriod(v as Period)} className="ml-2">
          {PERIODS.map((p) => <ToggleGroupItem key={p} value={p}>{t(`periods.${p}`)}</ToggleGroupItem>)}
        </ToggleGroup>
        <Button variant="secondary" size="sm" onClick={scrollToToday}><CalendarClockIcon data-icon="inline-start" />{t("today")}</Button>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
          <SelectTrigger className="w-48" aria-label={t("groupBy.label")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {GROUPS.map((g) => <SelectItem key={g} value={g}>{t("groupBy.label")} : {t(`groupBy.${g}`)}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => setShowColumns((s) => !s)}>
          <ColumnsIcon data-icon="inline-start" />{showColumns ? t("hideColumns") : t("showColumns")}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {plan.scale === "temporal" && permissions.edit && (
            <Button size="sm" onClick={() => setAddContent(true)}><PlusIcon data-icon="inline-start" />{t("addContent")}</Button>
          )}
          {permissions.edit && plan.scale !== "scheduling" && (
            <Button size="sm" variant="secondary" onClick={() => setMilestone("new")}><DiamondIcon data-icon="inline-start" />{t("milestone.add")}</Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span>{t(`title.${plan.scale}`, { name: plan.name })}</span>
        <span>{t("count", { count: planFlows.length })}</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-5 rounded-sm bg-primary" />{t("legend.estimated")}</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-5 rounded-sm border border-primary bg-primary/25" />{t("legend.planned")}</span>
        {linkFrom && (
          <span className="flex items-center gap-2 rounded bg-info-bg px-2 py-1 text-info">
            <LinkIcon className="size-3.5" />{t("linkHint")}
            <button type="button" aria-label={tg("actions.cancel")} onClick={() => setLinkFrom(null)}><XIcon className="size-3.5" /></button>
          </span>
        )}
      </div>

      {plan.scale === "scheduling" ? (
        <Empty className="flex-1 border">
          <EmptyHeader><EmptyTitle>{t("scheduling.title")}</EmptyTitle><EmptyDescription>{t("scheduling.description")}</EmptyDescription></EmptyHeader>
        </Empty>
      ) : (
        <div ref={scroller} className={cn("relative min-h-0 flex-1 overflow-auto rounded-md border bg-card text-sm", linkFrom && "cursor-crosshair")}>
          <div style={{ width: leftWidth + width }} className="relative">
            {/* En-tête */}
            <div className="sticky top-0 z-30 flex border-b bg-card" style={{ height: HEAD }}>
              <div className="sticky left-0 z-40 flex shrink-0 items-end border-r bg-card text-xs font-medium text-muted-foreground" style={{ width: leftWidth }}>
                <HeadCell w={COLS.name}>{t("columns.name")}</HeadCell>
                {showColumns && <>
                  <HeadCell w={COLS.state}>{t("columns.state")}</HeadCell>
                  <HeadCell w={COLS.start}>{t("columns.start")}</HeadCell>
                  <HeadCell w={COLS.end}>{t("columns.end")}</HeadCell>
                  <HeadCell w={COLS.assignment}>{t("columns.assignment")}</HeadCell>
                </>}
              </div>
              <div className="relative shrink-0" style={{ width }}>
                <div className="absolute inset-x-0 top-0 flex h-7 border-b">
                  {topCells.map((c) => (
                    <div key={c.key} className="shrink-0 truncate border-r px-1.5 py-1 text-xs font-medium capitalize" style={{ width: c.days * px }}>{c.label}</div>
                  ))}
                </div>
                <div className="absolute inset-x-0 bottom-0 flex h-7">
                  {lowCells.map((c) => (
                    <div key={c.key} className="shrink-0 truncate border-r px-1 py-1 text-center text-[0.7rem] text-muted-foreground capitalize" style={{ width: c.days * px }}>{c.days * px > 18 ? c.label : ""}</div>
                  ))}
                </div>
                {milestones.map((m) => (
                  <Tooltip key={m.id}>
                    <TooltipTrigger asChild>
                      <button type="button" className="absolute bottom-0.5 z-10 -translate-x-1/2" style={{ left: xOf(new Date(m.date)) }}
                        onClick={() => permissions.edit && setMilestone(m)} aria-label={m.name}>
                        <DiamondIcon className="size-4" style={{ color: m.color, fill: m.color }} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{m.name} · {format(new Date(m.date), "P", { locale })}{m.description ? ` — ${m.description}` : ""}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>

            {/* Corps */}
            <div className="relative">
              {/* Grille de fond, aujourd'hui, jalons */}
              <div className="pointer-events-none absolute top-0 bottom-0" style={{ left: leftWidth, width }}>
                {(lowCells.length ? lowCells : topCells).map((c) => (
                  <div key={c.key} className="absolute top-0 bottom-0 border-r border-border/50" style={{ left: xOf(c.start) + c.days * px }} />
                ))}
                <div className="absolute top-0 bottom-0 w-0.5 bg-destructive/70" style={{ left: today }} />
                {milestones.map((m) => (
                  <div key={m.id} className="absolute top-0 bottom-0 border-l-2 border-dashed" style={{ left: xOf(new Date(m.date)), borderColor: m.color }} />
                ))}
              </div>
              {rows.map((r) => r.kind === "group" ? (
                <div key={`g-${r.key}`} className="flex border-b bg-muted/60" style={{ height: ROW }}>
                  <div className="sticky left-0 z-20 flex shrink-0 items-center gap-2 bg-muted px-3 font-medium" style={{ width: leftWidth }}>
                    {r.color && <span className="size-3 rounded-full" style={{ backgroundColor: r.color }} />}
                    {r.label}<span className="text-xs text-muted-foreground">({r.count})</span>
                  </div>
                </div>
              ) : (
                <FlowRow key={r.flow.id} flow={r.flow} bar={shown(r.flow.id)} leftWidth={leftWidth} width={width} showColumns={showColumns}
                  xOf={xOf} locale={locale} projectId={projectId} canEditDates={permissions.editDates} canLink={permissions.edit}
                  linking={!!linkFrom} dragging={drag?.flowId === r.flow.id}
                  onPointerDown={(e, mode) => onBarPointerDown(e, r.flow, mode)} onPointerMove={onBarPointerMove}
                  onPointerUp={() => onBarPointerUp(r.flow)} onClick={() => onBarClick(r.flow)}
                  onStartLink={(side) => setLinkFrom({ flowId: r.flow.id, side })}
                  onCreateBar={(x, el) => createBarAt(r.flow, x, el)}
                  menu={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs" aria-label={tg("actions.more")}><EllipsisVerticalIcon /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuGroup>
                          <DropdownMenuItem asChild><Link href={`/explore/projects/${projectId}/flow/${r.flow.id}/content-view`}>{t("actions.open")}</Link></DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => dialog.open(`flow/edit/${r.flow.id}/planning-tab`)}>{t("actions.flowInfo")}</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDepsOf(r.flow.id)}>{t("dependencies.title")}</DropdownMenuItem>
                          {plan.scale === "temporal" && permissions.edit && (
                            <DropdownMenuItem variant="destructive" onSelect={() => start(async () => {
                              const res = await removePlanFlow(plan.id, r.flow.id);
                              if (!res.ok) notify.error(tg("toast.error")); else router.refresh();
                            })}>{t("actions.unlinkFlow")}</DropdownMenuItem>
                          )}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
              ))}
              {rows.length === 0 && (
                <div className="sticky left-0 p-6 text-sm text-muted-foreground" style={{ width: leftWidth + 400 }}>
                  {plan.scale === "temporal" ? t("emptyTemporal") : t("emptyFlows")}
                </div>
              )}
              {/* Dépendances */}
              <svg className="pointer-events-none absolute top-0" style={{ left: leftWidth, width, height: rows.length * ROW }}>
                <defs>
                  <marker id="plan-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0 0 L10 5 L0 10 z" fill="var(--color-muted-foreground)" />
                  </marker>
                  <marker id="plan-arrow-warn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0 0 L10 5 L0 10 z" fill="var(--color-destructive)" />
                  </marker>
                </defs>
                {arrows.map((a) => {
                  const out = a.endStart ? a.x1 + 10 : a.x1 - 10;
                  const d = `M${a.x1} ${a.y1} H${out} V${(a.y1 + a.y2) / 2} H${a.endStart ? a.x2 - 10 : a.x2 + 10} V${a.y2} H${a.x2}`;
                  return <path key={a.id} d={d} fill="none" strokeWidth={1.5} stroke={a.overlap ? "var(--color-destructive)" : "var(--color-muted-foreground)"}
                    markerEnd={`url(#${a.overlap ? "plan-arrow-warn" : "plan-arrow"})`} />;
                })}
              </svg>
            </div>
          </div>
        </div>
      )}

      {planDialog && (
        <PlanDialog projectId={projectId} plan={planDialog === "edit" ? plan : null} onClose={() => setPlanDialog(null)}
          onSaved={(id) => { setPlanDialog(null); if (id !== plan.id) selectPlan(id); else router.refresh(); }} />
      )}
      {milestone && <MilestoneDialog planId={plan.id} milestone={milestone === "new" ? null : milestone} onClose={() => setMilestone(null)} />}
      {addContent && <AddContentDialog planId={plan.id} flows={flows.filter((f) => !planFlows.some((p) => p.id === f.id))} onClose={() => setAddContent(false)} />}
      {depsFlow && (
        <DependencyDialog flow={depsFlow} links={links} elementFlow={elementFlow} flows={planFlows} bars={bars}
          canEdit={permissions.edit} onClose={() => setDepsOf(null)} />
      )}
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={t("deleteConfirm")}
        onConfirm={async () => {
          const res = await deletePlan(plan.id);
          if (!res.ok) { notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error")); return; }
          notify.success(t("deleted"));
          setConfirmDelete(false);
          const next = plans.find((p) => p.id !== plan.id);
          const sp = new URLSearchParams(searchParams.toString());
          if (next) sp.set("plan", next.id); else sp.delete("plan");
          router.replace(`${pathname}?${sp.toString()}`);
          router.refresh();
        }} />
    </div>
  );
}

function HeadCell({ w, children }: { w: number; children: React.ReactNode }) {
  return <div className="truncate border-r px-3 pb-2" style={{ width: w }}>{children}</div>;
}

function FlowRow({ flow, bar, leftWidth, width, showColumns, xOf, locale, canEditDates, canLink, linking, dragging, onPointerDown, onPointerMove, onPointerUp, onClick, onStartLink, onCreateBar, menu }: {
  flow: ViewFlow; bar: Bar | null; leftWidth: number; width: number; showColumns: boolean; xOf: (d: Date) => number;
  locale: typeof fr; projectId: string; canEditDates: boolean; canLink: boolean; linking: boolean; dragging: boolean;
  onPointerDown: (e: ReactPointerEvent, mode: "move" | "start" | "end") => void; onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: () => void; onClick: () => void; onStartLink: (side: "start" | "end") => void;
  onCreateBar: (clientX: number, el: HTMLElement) => void; menu: React.ReactNode;
}) {
  const t = useTranslations("flowViews.plan");
  const people = flow.assignees.flatMap((a) => (a.collaborator ? [`${a.collaborator.first_name} ${a.collaborator.last_name}`] : []));
  const assignment = people.length ? people.join(", ") : flow.reporter ? `${flow.reporter.first_name} ${flow.reporter.last_name}` : "—";
  const color = flow.bar_color || flow.status?.color || "var(--color-primary)";
  const left = bar ? xOf(bar.start) : 0;
  const w = bar ? Math.max(6, xOf(bar.end) - left) : 0;
  return (
    <div className="group/row flex border-b hover:bg-row-focus/40" style={{ height: ROW }}>
      <div className="sticky left-0 z-20 flex shrink-0 items-center border-r bg-card group-hover/row:bg-row-focus" style={{ width: leftWidth }}>
        <div className="flex min-w-0 items-center gap-2 px-2" style={{ width: COLS.name }}>
          {menu}
          <FlowTypeBadge type={flow.flow_type} size="sm" />
          <span className="truncate" title={flow.name}>{flow.name}</span>
        </div>
        {showColumns && <>
          <div className="truncate px-2 text-xs" style={{ width: COLS.state }}><StatusBadge color={flow.status?.color} label={flow.status?.name} /></div>
          <div className="px-2 text-xs" style={{ width: COLS.start }}>{bar ? format(bar.start, "P", { locale }) : "—"}</div>
          <div className="px-2 text-xs" style={{ width: COLS.end }}>{bar ? format(bar.end, "P", { locale }) : "—"}</div>
          <div className="truncate px-2 text-xs" style={{ width: COLS.assignment }} title={assignment}>{assignment}</div>
        </>}
      </div>
      <div className="relative shrink-0" style={{ width }}
        onDoubleClick={(e) => { if (!bar && canEditDates) onCreateBar(e.clientX, e.currentTarget); }}
        title={!bar && canEditDates ? t("doubleClickHint") : undefined}>
        {bar && (
          <div
            className={cn("group/bar absolute top-1.5 flex h-6 items-center rounded-sm text-[0.7rem] text-white shadow-xs select-none",
              bar.kind === "planned" && "border-2", canEditDates && !linking && "cursor-grab", dragging && "cursor-grabbing opacity-80",
              linking && "cursor-pointer ring-primary hover:ring-2")}
            style={{ left, width: w, backgroundColor: bar.kind === "planned" ? `color-mix(in srgb, ${color} 30%, transparent)` : color, borderColor: color }}
            onPointerDown={(e) => onPointerDown(e, "move")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onClick={onClick}
            title={`${flow.name} · ${format(bar.start, "Pp", { locale })} → ${format(bar.end, "Pp", { locale })}`}
          >
            {canEditDates && !linking && <>
              <span className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" onPointerDown={(e) => onPointerDown(e, "start")} />
              <span className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" onPointerDown={(e) => onPointerDown(e, "end")} />
            </>}
            <span className={cn("truncate px-2", bar.kind === "planned" && "text-foreground")}>{w > 60 ? flow.name : ""}</span>
            {canLink && !linking && <>
              <button type="button" aria-label={t("addLinkStart")} title={t("addLinkStart")}
                className="absolute -left-3 hidden size-2.5 rounded-full border-2 border-primary bg-card group-hover/bar:block"
                onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onStartLink("start"); }} />
              <button type="button" aria-label={t("addLinkEnd")} title={t("addLinkEnd")}
                className="absolute -right-3 hidden size-2.5 rounded-full border-2 border-primary bg-card group-hover/bar:block"
                onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onStartLink("end"); }} />
            </>}
          </div>
        )}
      </div>
    </div>
  );
}

