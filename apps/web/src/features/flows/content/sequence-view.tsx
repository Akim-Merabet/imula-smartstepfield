"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CircleHelpIcon, LockIcon, MergeIcon, ScissorsIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { numberItems } from "../meta";
import type { ContentPhase } from "../queries";
import { mergeSequence, setPhaseSequencing, setSequenceType, splitSequence } from "../sequence-actions";
import { ProgressDot } from "./content-tree";
import { contentError } from "./errors";

type SeqType = "linear" | "parallel";
export type SequenceRow = { id: string; position: number; type: SeqType };
type Group = { id: string | null; type: SeqType; phases: ContentPhase[] };

/** Regroupe les phases en séquences contiguës (même règle que private.normalize_sequences). */
export function groupSequences(phases: ContentPhase[], phaseSeq: Record<string, string | null>, sequences: SequenceRow[], defaultType: SeqType): Group[] {
  if (!sequences.length) return phases.length ? [{ id: null, type: defaultType, phases }] : [];
  const sorted = [...sequences].sort((a, b) => a.position - b.position);
  const pos = new Map(sorted.map((s) => [s.id, s.position]));
  const groups = new Map<string, Group>();
  let cur: SequenceRow | null = null;
  for (const p of phases) {
    const sid = phaseSeq[p.id];
    const sp = sid ? pos.get(sid) : undefined;
    if (sp !== undefined && sp >= (cur?.position ?? 0)) cur = sorted.find((s) => s.id === sid)!;
    else if (!cur) cur = sorted[0];
    const g = groups.get(cur.id) ?? { id: cur.id, type: cur.type, phases: [] };
    g.phases.push(p);
    groups.set(cur.id, g);
  }
  return sorted.flatMap((s) => (groups.has(s.id) ? [groups.get(s.id)!] : []));
}

/** Séquencement du flow (§4.5) : séquences linéaires / parallèles, types de phase, logigramme. */
export function SequenceView({ flowId, phases, sequences, phaseSeq, defaultType, canEdit, locked }: {
  flowId: string; phases: ContentPhase[]; sequences: SequenceRow[]; phaseSeq: Record<string, string | null>;
  defaultType: SeqType; canEdit: boolean; locked: boolean;
}) {
  const t = useTranslations("flowContent");
  const tg = useTranslations("global");
  const router = useRouter();
  const [pending, start] = useTransition();
  const numbers = useMemo(() => numberItems(phases, t("prefix.phase")), [phases, t]);
  const groups = useMemo(() => groupSequences(phases, phaseSeq, sequences, defaultType), [phases, phaseSeq, sequences, defaultType]);
  const editable = canEdit && !locked;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    const res = await fn();
    if (!res.ok) { notify.error(contentError(t, tg, res.error)); return; }
    router.refresh();
  });

  if (!phases.length) {
    return <Empty className="flex-1 rounded-md border"><EmptyHeader><EmptyTitle>{t("tree.emptyTitle")}</EmptyTitle><EmptyDescription>{t("tree.emptySubtitle")}</EmptyDescription></EmptyHeader></Empty>;
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1 rounded-md border bg-card">
      <ResizablePanel defaultSize="40%" minSize="25%" className="flex min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <h2 className="font-medium">{t("sequence.title")}</h2>
          <Tooltip>
            <TooltipTrigger asChild><CircleHelpIcon className="size-4 text-muted-foreground" aria-label={t("sequence.helper")} /></TooltipTrigger>
            <TooltipContent className="max-w-80">{t("sequence.helperText")}</TooltipContent>
          </Tooltip>
        </div>
        {locked && <Alert className="m-3 w-auto"><LockIcon /><AlertDescription>{t("errors.flow_locked")}</AlertDescription></Alert>}
        <div className={cn("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4", pending && "pointer-events-none opacity-70")}>
          {groups.map((g, gi) => (
            <section key={g.id ?? "implicit"} className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t("sequence.sequenceTitle", { order: gi + 1 })}</span>
                <ToggleGroup type="single" variant="outline" size="sm" value={g.type} disabled={!editable}
                  onValueChange={(v) => { if (v && v !== g.type) run(() => setSequenceType(flowId, g.id, v as SeqType)); }}>
                  <ToggleGroupItem value="linear">{t("sequence.linear")}</ToggleGroupItem>
                  <ToggleGroupItem value="parallel">{t("sequence.parallel")}</ToggleGroupItem>
                </ToggleGroup>
                {gi > 0 && editable && g.id && (
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => run(() => mergeSequence(g.id!))}>
                    <MergeIcon data-icon="inline-start" />{t("sequence.merge")}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t(`sequence.sequence_${g.type}Help`)}</p>
              <ol className="flex flex-col gap-2">
                {g.phases.map((p, pi) => (
                  <li key={p.id} className={cn("flex flex-col gap-2 rounded-md border bg-card p-2.5", p.disabled && "opacity-60")}>
                    <div className="flex items-center gap-2">
                      <ProgressDot status={p.progress} />
                      <span className="font-semibold">{numbers.get(p.id)}</span>
                      <span className={cn("min-w-0 flex-1 truncate", p.disabled && "line-through")}>{p.name}</span>
                      {pi > 0 && editable && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={t("sequence.split")} onClick={() => run(() => splitSequence(p.id))}><ScissorsIcon /></Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("sequence.split")}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{t("sequence.steps", { count: p.steps.length })}</span>
                      {!p.mandatory && <Badge variant="outline">{t("tree.optional")}</Badge>}
                      {p.read_only_on_mobile_app && <Badge variant="outline">{t("sequence.webApp")}</Badge>}
                      {p.disabled && <Badge variant="outline">{t("status.disabled")}</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <ToggleGroup type="single" variant="outline" size="sm" value={p.sequence_type} disabled={!editable} aria-label={t("sequence.phaseType")}
                        onValueChange={(v) => { if (v && v !== p.sequence_type) run(() => setPhaseSequencing(p.id, { sequence_type: v as SeqType })); }}>
                        <ToggleGroupItem value="linear">{t("sequence.linear")}</ToggleGroupItem>
                        <ToggleGroupItem value="parallel">{t("sequence.parallel")}</ToggleGroupItem>
                      </ToggleGroup>
                      <label className="flex items-center gap-2 text-sm">
                        <Switch checked={!p.mandatory} disabled={!editable}
                          onCheckedChange={(v) => run(() => setPhaseSequencing(p.id, { mandatory: !v }))} />
                        {t("tree.optional")}
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">{t(`sequence.${p.sequence_type}Help`)}</p>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="60%" minSize="30%">
        <ReactFlowProvider>
          <Logigram groups={groups} numbers={numbers} />
        </ReactFlowProvider>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

// ===== Logigramme ===================================================================

const W = 220, H = 100, GAP = 48, PAD = 28, HEADER = 28, DOT = 14;

type PhaseData = { phase: ContentPhase; number: string };
type GroupData = { label: string; type: SeqType };

function PhaseNode({ data }: NodeProps<Node<PhaseData>>) {
  const t = useTranslations("flowContent");
  const { phase, number } = data;
  return (
    <div className={cn("flex h-[100px] w-[220px] flex-col gap-1 rounded-md border-2 bg-card p-2 text-xs shadow-sm",
      !phase.mandatory && "border-dashed", phase.disabled ? "border-muted-foreground/40 opacity-60" : "border-primary/60")}>
      <Handle type="target" position={Position.Left} className="!size-2 !bg-primary" />
      <div className="flex items-center gap-1.5">
        <span className="rounded bg-primary px-1.5 py-0.5 text-[0.65rem] font-semibold text-primary-foreground">{number}</span>
        <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", phase.disabled && "line-through")}>{phase.name}</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <TypeIllustration type={phase.sequence_type} />
        <span>{t(`sequence.${phase.sequence_type}`)}</span>
        <span className="ml-auto">{t("sequence.steps", { count: phase.steps.length })}</span>
      </div>
      <div className="mt-auto flex flex-wrap gap-1">
        {!phase.mandatory && <Badge variant="outline" className="h-4 px-1 text-[0.6rem]">{t("tree.optional")}</Badge>}
        {phase.read_only_on_mobile_app && <Badge variant="outline" className="h-4 px-1 text-[0.6rem]">{t("sequence.webApp")}</Badge>}
        {phase.disabled && <Badge variant="outline" className="h-4 px-1 text-[0.6rem]">{t("status.disabled")}</Badge>}
      </div>
      <Handle type="source" position={Position.Right} className="!size-2 !bg-primary" />
    </div>
  );
}

/** Pictogramme : étapes en chaîne (linéaire) ou en faisceau (parallèle). */
function TypeIllustration({ type }: { type: SeqType }) {
  return type === "linear" ? (
    <svg width="34" height="12" viewBox="0 0 34 12" aria-hidden className="text-primary">
      <circle cx="4" cy="6" r="3" fill="currentColor" /><circle cx="17" cy="6" r="3" fill="currentColor" /><circle cx="30" cy="6" r="3" fill="currentColor" />
      <path d="M7 6h7M20 6h7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ) : (
    <svg width="34" height="14" viewBox="0 0 34 14" aria-hidden className="text-primary">
      <path d="M2 7 L10 2 H24 L32 7 M2 7 H32 M2 7 L10 12 H24 L32 7" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function GroupNode({ data, width, height }: NodeProps<Node<GroupData>>) {
  return (
    <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5" style={{ width, height }}>
      <div className="px-3 pt-1.5 text-xs font-semibold text-primary">{data.label}</div>
    </div>
  );
}

function DotNode({ data }: NodeProps<Node<{ label?: string }>>) {
  return (
    <div className="relative flex size-3.5 items-center justify-center rounded-full bg-primary">
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      {data.label && <span className="absolute top-4 text-[0.65rem] whitespace-nowrap text-muted-foreground">{data.label}</span>}
    </div>
  );
}

const nodeTypes = { phase: PhaseNode, seqGroup: GroupNode, dot: DotNode };

function Logigram({ groups, numbers }: { groups: Group[]; numbers: Map<string, string> }) {
  const t = useTranslations("flowContent");
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const sizes = groups.map((g) => g.type === "linear"
      ? { w: g.phases.length * W + (g.phases.length + 1) * GAP, h: H + 2 * PAD + HEADER }
      : { w: W + 2 * GAP, h: g.phases.length * H + (g.phases.length - 1) * 20 + 2 * PAD + HEADER });
    const maxH = Math.max(...sizes.map((s) => s.h), H);
    const mid = maxH / 2;
    const edge = (source: string, target: string, dashed = false): Edge => ({
      id: `${source}->${target}`, source, target, type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed }, style: dashed ? { strokeDasharray: "4 3" } : undefined,
    });
    let x = 0;
    let prevExit = "start";
    nodes.push({ id: "start", type: "dot", position: { x, y: mid - DOT / 2 }, data: { label: t("sequence.start") }, draggable: false });
    x += 60;
    groups.forEach((g, gi) => {
      const { w, h } = sizes[gi];
      const top = mid - h / 2;
      nodes.push({
        id: `g${gi}`, type: "seqGroup", position: { x, y: top }, width: w, height: h, zIndex: -1, draggable: false, selectable: false,
        data: { label: `${t("sequence.sequenceTitle", { order: gi + 1 })} · ${t(`sequence.${g.type}`)}`, type: g.type },
      });
      const entry = `in${gi}`, exit = `out${gi}`;
      nodes.push({ id: entry, type: "dot", position: { x: x - DOT / 2, y: mid - DOT / 2 }, data: {}, draggable: false, zIndex: 2 });
      nodes.push({ id: exit, type: "dot", position: { x: x + w - DOT / 2, y: mid - DOT / 2 }, data: {}, draggable: false, zIndex: 2 });
      edges.push(edge(prevExit, entry));
      if (g.type === "linear") {
        let prev = entry;
        g.phases.forEach((p, i) => {
          nodes.push({ id: p.id, type: "phase", position: { x: x + GAP + i * (W + GAP), y: mid - H / 2 + HEADER / 2 }, data: { phase: p, number: numbers.get(p.id) ?? "" }, draggable: false });
          edges.push(edge(prev, p.id, !p.mandatory));
          prev = p.id;
        });
        edges.push(edge(prev, exit));
      } else {
        g.phases.forEach((p, i) => {
          nodes.push({ id: p.id, type: "phase", position: { x: x + GAP, y: top + PAD + HEADER + i * (H + 20) }, data: { phase: p, number: numbers.get(p.id) ?? "" }, draggable: false });
          edges.push(edge(entry, p.id, !p.mandatory));
          edges.push(edge(p.id, exit, !p.mandatory));
        });
      }
      prevExit = exit;
      x += w + 70;
    });
    nodes.push({ id: "end", type: "dot", position: { x: x - 10, y: mid - DOT / 2 }, data: { label: t("sequence.end") }, draggable: false });
    edges.push(edge(prevExit, "end"));
    return { nodes, edges };
  }, [groups, numbers, t]);
  const signature = groups.map((g) => `${g.type}:${g.phases.map((p) => p.id).join(",")}`).join("|");

  return (
    <ReactFlow key={signature} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.2} maxZoom={2}
      onInit={(rf) => { setTimeout(() => void rf.fitView({ padding: 0.15 }), 50); }}
      nodesConnectable={false} nodesDraggable={false} proOptions={{ hideAttribution: true }}>
      <Background />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeColor={(n) => (n.type === "seqGroup" ? "transparent" : n.type === "phase" ? "#2563eb" : "#94a3b8")} />
    </ReactFlow>
  );
}
