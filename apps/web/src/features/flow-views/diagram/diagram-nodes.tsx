"use client";

import { createContext, useContext } from "react";
import { useTranslations } from "next-intl";
import { Handle, NodeResizer, Position, type NodeProps, type Node } from "@xyflow/react";
import { SplitIcon } from "lucide-react";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { cn } from "@/lib/utils";
import { FlowTypeBadge } from "@/features/flows/components/flow-type-badge";
import type { ViewFlow } from "../queries";

export type NodeStyle = { bg?: string; border?: string; color?: string; fontSize?: number };
export type FlowNodeData = { flowId: string; style?: NodeStyle };
export type PartNodeData = { flowId: string; phaseId?: string; stepId?: string; label: string; number: string; disabled: boolean; style?: NodeStyle };
export type ShapeNodeData = { shape: "rect" | "ellipse" | "diamond"; label: string; style?: NodeStyle };
export type TextNodeData = { label: string; style?: NodeStyle };
export type GroupNodeData = { label?: string; style?: NodeStyle };

/** Contexte partagé par les nœuds : flows de l'entité, mode édition, actions. */
export const DiagramContext = createContext<{
  flows: Map<string, ViewFlow>; editing: boolean;
  breakDown: (nodeId: string) => void; setLabel: (nodeId: string, label: string) => void;
}>({ flows: new Map(), editing: false, breakDown: () => {}, setLabel: () => {} });

const css = (s?: NodeStyle) => ({
  backgroundColor: s?.bg, borderColor: s?.border, color: s?.color, fontSize: s?.fontSize ? `${s.fontSize}px` : undefined,
});

function Handles() {
  const { editing } = useContext(DiagramContext);
  const cls = cn("!size-2 !border-primary !bg-card", !editing && "!opacity-0");
  return (
    <>
      <Handle id="t" type="source" position={Position.Top} className={cls} />
      <Handle id="r" type="source" position={Position.Right} className={cls} />
      <Handle id="b" type="source" position={Position.Bottom} className={cls} />
      <Handle id="l" type="source" position={Position.Left} className={cls} />
    </>
  );
}

export function FlowNode({ id, data, selected }: NodeProps<Node<FlowNodeData>>) {
  const t = useTranslations("flowViews.diagram");
  const { flows, editing, breakDown } = useContext(DiagramContext);
  const flow = flows.get(data.flowId);
  return (
    <div className={cn("flex w-64 flex-col gap-1.5 rounded-md border-2 bg-card p-2.5 text-xs shadow-sm", selected && "ring-2 ring-primary")}
      style={{ ...css(data.style), borderColor: data.style?.border ?? flow?.family?.color ?? undefined }}>
      <Handles />
      {flow ? (
        <>
          <div className="flex items-center gap-2">
            <FlowTypeBadge type={flow.flow_type} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{flow.name}</span>
          </div>
          <div className="text-muted-foreground">{t("flowReference")} {flow.ref_int ?? "—"}</div>
          <div className="flex items-center gap-2">
            {flow.family && <FamilyChip color={flow.family.color} shortName={flow.family.short_name} longName={flow.family.long_name} />}
            <StatusBadge color={flow.status?.color} label={flow.status?.name} className="ml-auto" />
          </div>
          {editing && (
            <button type="button" className="nodrag mt-1 flex items-center gap-1 self-start rounded px-1.5 py-0.5 text-primary hover:bg-accent"
              onClick={() => breakDown(id)}><SplitIcon className="size-3.5" />{t("breakDown")}</button>
          )}
        </>
      ) : <span className="text-muted-foreground italic">{t("flowMissing")}</span>}
    </div>
  );
}

export function PartNode({ id, data, selected, type }: NodeProps<Node<PartNodeData>>) {
  const t = useTranslations("flowViews.diagram");
  const { flows, editing, breakDown } = useContext(DiagramContext);
  const flow = flows.get(data.flowId);
  return (
    <div className={cn("flex w-52 flex-col gap-1 rounded-md border bg-card p-2 text-xs shadow-xs", type === "phase" ? "border-primary/60" : "border-dashed", selected && "ring-2 ring-primary", data.disabled && "opacity-60")}
      style={css(data.style)}>
      <Handles />
      <div className="flex items-center gap-1.5">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[0.65rem] font-semibold text-primary">{data.number}</span>
        <span className={cn("min-w-0 flex-1 truncate font-medium", data.disabled && "line-through")}>{data.label}</span>
      </div>
      <div className="truncate text-muted-foreground">{t("origin")} {flow?.name ?? "—"}</div>
      {type === "phase" && editing && (
        <button type="button" className="nodrag flex items-center gap-1 self-start rounded px-1.5 py-0.5 text-primary hover:bg-accent"
          onClick={() => breakDown(id)}><SplitIcon className="size-3.5" />{t("breakDown")}</button>
      )}
    </div>
  );
}

export function ShapeNode({ id, data, selected }: NodeProps<Node<ShapeNodeData>>) {
  const { editing, setLabel } = useContext(DiagramContext);
  const shapeCls = data.shape === "ellipse" ? "rounded-[50%]" : data.shape === "diamond" ? "" : "rounded-md";
  return (
    <>
      <NodeResizer isVisible={editing && selected} minWidth={60} minHeight={40} />
      <div className="relative flex size-full items-center justify-center text-sm">
        <Handles />
        {data.shape === "diamond" ? (
          <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polygon points="50,1 99,50 50,99 1,50" fill={data.style?.bg ?? "var(--color-card)"} stroke={data.style?.border ?? "var(--color-primary)"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <div className={cn("absolute inset-0 border-2 border-primary bg-card", shapeCls)} style={{ backgroundColor: data.style?.bg, borderColor: data.style?.border }} />
        )}
        <EditableLabel id={id} label={data.label} editing={editing} setLabel={setLabel} style={data.style} />
      </div>
    </>
  );
}

export function TextNode({ id, data, selected }: NodeProps<Node<TextNodeData>>) {
  const { editing, setLabel } = useContext(DiagramContext);
  return (
    <>
      <NodeResizer isVisible={editing && selected} minWidth={40} minHeight={24} />
      <div className={cn("flex size-full items-center justify-center", selected && "outline-1 outline-primary/50 outline-dashed")}>
        <EditableLabel id={id} label={data.label} editing={editing} setLabel={setLabel} style={data.style} />
      </div>
    </>
  );
}

export function GroupNode({ data, selected }: NodeProps<Node<GroupNodeData>>) {
  const { editing } = useContext(DiagramContext);
  return (
    <>
      <NodeResizer isVisible={editing && selected} minWidth={80} minHeight={60} />
      <div className={cn("size-full rounded-lg border-2 border-dashed border-muted-foreground/40 bg-muted/30", selected && "border-primary")}
        style={{ backgroundColor: data.style?.bg, borderColor: data.style?.border }} />
    </>
  );
}

function EditableLabel({ id, label, editing, setLabel, style }: { id: string; label: string; editing: boolean; setLabel: (id: string, l: string) => void; style?: NodeStyle }) {
  return editing ? (
    <textarea defaultValue={label} rows={1} aria-label="label"
      className="nodrag relative z-10 w-[90%] resize-none bg-transparent text-center outline-none"
      style={{ color: style?.color, fontSize: style?.fontSize ? `${style.fontSize}px` : undefined }}
      onBlur={(e) => { if (e.target.value !== label) setLabel(id, e.target.value); }}
      onKeyDown={(e) => e.stopPropagation()} />
  ) : (
    <span className="relative z-10 px-2 text-center whitespace-pre-wrap" style={{ color: style?.color, fontSize: style?.fontSize ? `${style.fontSize}px` : undefined }}>{label}</span>
  );
}

export const nodeTypes = { flow: FlowNode, phase: PartNode, step: PartNode, shape: ShapeNode, text: TextNode, group: GroupNode };
