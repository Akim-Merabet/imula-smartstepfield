"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  addEdge, applyEdgeChanges, applyNodeChanges, Background, ConnectionMode, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider,
  useReactFlow, type Connection, type Edge, type EdgeChange, type Node, type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  CircleIcon, CopyIcon, DiamondIcon, EyeIcon, GroupIcon, PencilIcon, PlusIcon, SquareIcon, Trash2Icon, TypeIcon, UngroupIcon, Undo2Icon,
  WorkflowIcon,
} from "lucide-react";
import { notify } from "@/components/common/notify";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";
import { numberItems } from "@/features/flows/meta";
import type { DiagramRow, ViewFlow } from "../queries";
import { createDiagram, deleteDiagram, renameDiagram, saveDiagram } from "./actions";
import { AddFlowsDialog } from "./add-flows-dialog";
import { DiagramContext, nodeTypes, type NodeStyle } from "./diagram-nodes";

type Direction = "none" | "left" | "right" | "both";
type EdgeData = { direction?: Direction; thickness?: number; color?: string };
type Snapshot = { nodes: Node[]; edges: Edge[] };
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const FLOW_NODE_TYPES = new Set(["flow", "phase", "step"]);

function decorate(e: Edge): Edge {
  const d = (e.data ?? {}) as EdgeData;
  const dir = d.direction ?? "right";
  const color = d.color ?? "var(--color-muted-foreground)";
  const marker = { type: MarkerType.ArrowClosed, color, width: 16, height: 16 };
  return {
    ...e, type: e.type ?? "smoothstep",
    style: { strokeWidth: d.thickness ?? 1.5, stroke: color },
    markerEnd: dir === "right" || dir === "both" ? marker : undefined,
    markerStart: dir === "left" || dir === "both" ? marker : undefined,
  };
}

function clean(nodes: Node[], edges: Edge[]) {
  return {
    nodes: nodes.map(({ id, type, position, data, parentId, width, height, style, zIndex }) => ({ id, type, position, data, parentId, width, height, style, zIndex })),
    edges: edges.map(({ id, source, target, sourceHandle, targetHandle, data, type }) => ({ id, source, target, sourceHandle, targetHandle, data, type })),
  };
}

/** Vue diagramme (§3.5) : plusieurs diagrammes par entité, édition libre, cartes flow / phase / étape. */
export function DiagramView({ projectId, diagrams, diagram, flows, permissions }: {
  projectId: string; diagrams: DiagramRow[]; diagram: DiagramRow | null; flows: ViewFlow[];
  permissions: { add: boolean; edit: boolean; delete: boolean; addFlow: boolean };
}) {
  const t = useTranslations("flowViews.diagram");
  const tg = useTranslations("global");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [nameDialog, setNameDialog] = useState<"create" | "rename" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const select = (id: string | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (id) sp.set("diagram", id); else sp.delete("diagram");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {diagrams.length > 0 && (
          <Select value={diagram?.id} onValueChange={select}>
            <SelectTrigger className="w-64" aria-label={t("select")}><SelectValue placeholder={t("select")} /></SelectTrigger>
            <SelectContent><SelectGroup>{diagrams.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        )}
        {permissions.add && <Button variant="secondary" size="icon" aria-label={t("create")} onClick={() => setNameDialog("create")}><PlusIcon /></Button>}
        {diagram && permissions.edit && <Button variant="ghost" size="icon" aria-label={t("rename")} onClick={() => setNameDialog("rename")}><PencilIcon /></Button>}
        {diagram && permissions.delete && <Button variant="ghost" size="icon" aria-label={t("delete")} onClick={() => setConfirmDelete(true)}><Trash2Icon /></Button>}
      </div>
      {diagram ? (
        <ReactFlowProvider>
          <Editor key={diagram.id} diagram={diagram} flows={flows} permissions={permissions} />
        </ReactFlowProvider>
      ) : (
        <Empty className="flex-1 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><WorkflowIcon /></EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptySubtitle")}</EmptyDescription>
          </EmptyHeader>
          {permissions.add && <EmptyContent><Button onClick={() => setNameDialog("create")}><PlusIcon data-icon="inline-start" />{t("create")}</Button></EmptyContent>}
        </Empty>
      )}
      {nameDialog && (
        <NameDialog initial={nameDialog === "rename" ? diagram?.name ?? "" : ""} title={nameDialog === "create" ? t("create") : t("rename")}
          onClose={() => setNameDialog(null)}
          onSave={async (name) => {
            const res = nameDialog === "create" ? await createDiagram(projectId, name) : await renameDiagram(diagram!.id, name);
            if (!res.ok) { notify.error(res.error === "forbidden" ? tg("toast.forbidden") : t(nameDialog === "create" ? "createFail" : "renameFail")); return; }
            notify.success(t(nameDialog === "create" ? "created" : "renamed"));
            setNameDialog(null);
            if (nameDialog === "create" && res.data) select((res.data as { id: string }).id);
            router.refresh();
          }} />
      )}
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={t("deleteConfirm")}
        onConfirm={async () => {
          if (!diagram) return;
          const res = await deleteDiagram(diagram.id);
          if (!res.ok) { notify.error(res.error === "linked_document" ? t("linkedDocument") : res.error === "forbidden" ? tg("toast.forbidden") : t("deleteFail")); return; }
          notify.success(t("deleted"));
          setConfirmDelete(false);
          select(diagrams.find((d) => d.id !== diagram.id)?.id ?? null);
          router.refresh();
        }} />
    </div>
  );
}

function NameDialog({ initial, title, onClose, onSave }: { initial: string; title: string; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const t = useTranslations("flowViews.diagram");
  const tg = useTranslations("global");
  const [name, setName] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <FieldGroup>
          <Field><FieldLabel htmlFor="diagram-name">{t("name")} *</FieldLabel>
            <Input id="diagram-name" value={name} autoFocus onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) start(() => onSave(name)); }} /></Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
          <Button disabled={!name.trim() || pending} onClick={() => start(() => onSave(name))}>{tg("actions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Editor({ diagram, flows, permissions }: {
  diagram: DiagramRow; flows: ViewFlow[];
  permissions: { edit: boolean; addFlow: boolean };
}) {
  const t = useTranslations("flowViews.diagram");
  const tc = useTranslations("flowContent");
  const dialog = useDialog();
  const rf = useReactFlow();
  const initial = (diagram.config ?? {}) as unknown as Partial<Snapshot>;
  const [nodes, setNodes] = useState<Node[]>(() => initial.nodes ?? []);
  const [edges, setEdges] = useState<Edge[]>(() => initial.edges ?? []);
  const [editing, setEditing] = useState(permissions.edit && !diagram.read_only);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving">("saved");
  const [adding, setAdding] = useState(false);
  const history = useRef<Snapshot[]>([]);
  const clipboard = useRef<Node[]>([]);
  const flowMap = useMemo(() => new Map(flows.map((f) => [f.id, f])), [flows]);
  const canEdit = permissions.edit && !diagram.read_only;

  // ----- Historique / enregistrement -----
  const snapshot = useCallback(() => {
    history.current.push({ nodes, edges });
    if (history.current.length > 50) history.current.shift();
  }, [nodes, edges]);
  const commit = useCallback((n: Node[], e: Edge[], record = true) => {
    if (record) snapshot();
    setNodes(n); setEdges(e); setSaveState("dirty");
  }, [snapshot]);
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) { setNodes(prev.nodes); setEdges(prev.edges); setSaveState("dirty"); }
  }, []);

  useEffect(() => {
    if (saveState !== "dirty" || !canEdit) return;
    const timer = setTimeout(async () => {
      setSaveState("saving");
      const flowIds = nodes.filter((n) => FLOW_NODE_TYPES.has(n.type ?? "")).map((n) => (n.data as { flowId: string }).flowId);
      const res = await saveDiagram(diagram.id, clean(nodes, edges), flowIds);
      if (!res.ok) { notify.error(t("saveFail")); setSaveState("dirty"); return; }
      setSaveState((s) => (s === "saving" ? "saved" : s));
    }, 900);
    return () => clearTimeout(timer);
  }, [saveState, nodes, edges, diagram.id, canEdit, t]);

  // ----- Changements React Flow -----
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const structural = changes.some((c) => c.type === "remove" || c.type === "dimensions" && "resizing" in c && c.resizing === false);
    const dragEnd = changes.some((c) => c.type === "position" && c.dragging === false);
    setNodes((ns) => applyNodeChanges(changes, ns));
    if (structural || dragEnd) setSaveState("dirty");
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((es) => applyEdgeChanges(changes, es));
    if (changes.some((c) => c.type === "remove")) setSaveState("dirty");
  }, []);
  const onConnect = useCallback((c: Connection) => {
    commit(nodes, addEdge({ ...c, id: uid(), type: "smoothstep", data: { direction: "right", thickness: 1.5 } }, edges));
  }, [nodes, edges, commit]);

  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => e.selected);

  const center = () => {
    const el = document.querySelector(".react-flow__renderer")?.getBoundingClientRect();
    return rf.screenToFlowPosition({ x: (el?.left ?? 0) + (el?.width ?? 600) / 2, y: (el?.top ?? 0) + (el?.height ?? 400) / 2 });
  };

  const addNodes = (list: Node[]) => commit([...nodes.map((n) => ({ ...n, selected: false })), ...list.map((n) => ({ ...n, selected: true }))], edges);

  const addShape = (shape: "rect" | "ellipse" | "diamond") => {
    const p = center();
    addNodes([{ id: uid(), type: "shape", position: { x: p.x - 70, y: p.y - 40 }, width: 140, height: 80, data: { shape, label: "" } }]);
  };
  const addText = () => {
    const p = center();
    addNodes([{ id: uid(), type: "text", position: { x: p.x - 60, y: p.y - 15 }, width: 120, height: 32, data: { label: t("textPlaceholder") } }]);
  };
  const addFlows = (ids: string[]) => {
    const p = center();
    const present = new Set(nodes.filter((n) => n.type === "flow").map((n) => (n.data as { flowId: string }).flowId));
    const list = ids.filter((id) => !present.has(id)).map((flowId, i) => ({
      id: uid(), type: "flow", position: { x: p.x - 130 + (i % 3) * 290, y: p.y - 60 + Math.floor(i / 3) * 150 }, data: { flowId },
    }));
    if (list.length) addNodes(list);
  };

  // « Nouveau flow » : le flow créé (nouvel identifiant) est ajouté automatiquement au diagramme.
  const knownFlows = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!knownFlows.current) return;
    const created = flows.filter((f) => !knownFlows.current!.has(f.id)).map((f) => f.id);
    if (created.length) { knownFlows.current = null; addFlows(created); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flows]);

  const breakDown = useCallback(async (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const supabase = createClient();
    const flowId = (node.data as { flowId: string }).flowId;
    const { data: phases } = await supabase.from("phases")
      .select("id, position, custom_number, exclude_numbering, name, disabled, steps(id, position, custom_number, exclude_numbering, name, disabled)")
      .eq("flow_id", flowId).order("position");
    const list = phases ?? [];
    const pnum = numberItems(list, tc("prefix.phase"));
    let created: Node[] = [];
    if (node.type === "flow") {
      created = list.map((ph, i) => ({
        id: uid(), type: "phase", position: { x: node.position.x + i * 230 - ((list.length - 1) * 230) / 2 + 20, y: node.position.y + 170 },
        data: { flowId, phaseId: ph.id, label: ph.name, number: pnum.get(ph.id) ?? "", disabled: ph.disabled },
      }));
    } else if (node.type === "phase") {
      const ph = list.find((x) => x.id === (node.data as { phaseId: string }).phaseId);
      const steps = [...(ph?.steps ?? [])].sort((a, b) => a.position - b.position);
      const snum = numberItems(steps, tc("prefix.step"));
      created = steps.map((s, i) => ({
        id: uid(), type: "step", position: { x: node.position.x, y: node.position.y + 110 + i * 90 },
        data: { flowId, stepId: s.id, label: s.name, number: `${pnum.get(ph!.id)}-${snum.get(s.id)}`, disabled: s.disabled || !!ph?.disabled },
      }));
    }
    if (!created.length) { notify.info(t("nothingToBreakDown")); return; }
    const newEdges = created.map((c) => decorate({ id: uid(), source: node.id, target: c.id, sourceHandle: "b", targetHandle: "t", type: "smoothstep", data: { direction: "right", thickness: 1.5 } }));
    commit([...nodes, ...created], [...edges, ...newEdges]);
  }, [nodes, edges, commit, tc, t]);

  const setLabel = useCallback((nodeId: string, label: string) => {
    commit(nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, label } } : n)), edges);
  }, [nodes, edges, commit]);

  const removeSelected = () => {
    const ids = new Set(selectedNodes.map((n) => n.id));
    // Les enfants d'un groupe supprimé sont supprimés avec lui.
    for (const n of nodes) if (n.parentId && ids.has(n.parentId)) ids.add(n.id);
    commit(nodes.filter((n) => !ids.has(n.id)), edges.filter((e) => !e.selected && !ids.has(e.source) && !ids.has(e.target)));
  };
  const duplicate = (source = selectedNodes) => {
    if (!source.length) return;
    const map = new Map(source.map((n) => [n.id, uid()]));
    const copies = source.map((n) => ({
      ...n, id: map.get(n.id)!, selected: true,
      parentId: n.parentId && map.has(n.parentId) ? map.get(n.parentId) : n.parentId,
      position: n.parentId && map.has(n.parentId) ? n.position : { x: n.position.x + 40, y: n.position.y + 40 },
    }));
    const copiedEdges = edges.filter((e) => map.has(e.source) && map.has(e.target))
      .map((e) => ({ ...e, id: uid(), source: map.get(e.source)!, target: map.get(e.target)!, selected: false }));
    commit([...nodes.map((n) => ({ ...n, selected: false })), ...copies], [...edges, ...copiedEdges]);
  };
  const group = () => {
    const sel = selectedNodes.filter((n) => !n.parentId && n.type !== "group");
    if (sel.length < 2) { notify.info(t("groupNeedsTwo")); return; }
    const box = sel.reduce((b, n) => {
      const w = n.measured?.width ?? n.width ?? 200, h = n.measured?.height ?? n.height ?? 80;
      return { x1: Math.min(b.x1, n.position.x), y1: Math.min(b.y1, n.position.y), x2: Math.max(b.x2, n.position.x + w), y2: Math.max(b.y2, n.position.y + h) };
    }, { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
    const gid = uid(), pad = 24;
    const g: Node = { id: gid, type: "group", position: { x: box.x1 - pad, y: box.y1 - pad }, width: box.x2 - box.x1 + 2 * pad, height: box.y2 - box.y1 + 2 * pad, data: {}, zIndex: -1 };
    const ids = new Set(sel.map((n) => n.id));
    const rest = nodes.map((n) => (ids.has(n.id) ? { ...n, parentId: gid, selected: false, position: { x: n.position.x - g.position.x, y: n.position.y - g.position.y } } : n));
    commit([g, ...rest], edges);
  };
  const ungroup = () => {
    const groups = new Set(selectedNodes.filter((n) => n.type === "group").map((n) => n.id));
    if (!groups.size) return;
    const pos = new Map(nodes.filter((n) => groups.has(n.id)).map((n) => [n.id, n.position]));
    commit(nodes.filter((n) => !groups.has(n.id)).map((n) => (n.parentId && groups.has(n.parentId)
      ? { ...n, parentId: undefined, position: { x: n.position.x + pos.get(n.parentId)!.x, y: n.position.y + pos.get(n.parentId)!.y } } : n)), edges);
  };

  const setNodeStyle = (patch: NodeStyle) => commit(nodes.map((n) => (n.selected ? { ...n, data: { ...n.data, style: { ...((n.data as { style?: NodeStyle }).style ?? {}), ...patch } } } : n)), edges);
  const setEdgeData = (patch: EdgeData) => commit(nodes, edges.map((e) => (e.selected ? { ...e, data: { ...(e.data ?? {}), ...patch } } : e)));

  // ----- Raccourcis -----
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
      else if (mod && e.key.toLowerCase() === "c") { clipboard.current = nodes.filter((n) => n.selected); }
      else if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); duplicate(clipboard.current); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === "g") { e.preventDefault(); ungroup(); }
      else if (mod && e.key.toLowerCase() === "g") { e.preventDefault(); group(); }
      else if (e.key === "Delete" || e.key === "Backspace") { if (selectedNodes.length || selectedEdges.length) { e.preventDefault(); removeSelected(); } }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const ctx = useMemo(() => ({ flows: flowMap, editing, breakDown, setLabel }), [flowMap, editing, breakDown, setLabel]);
  const styleNode = selectedNodes[0];
  const nodeStyle = ((styleNode?.data as { style?: NodeStyle } | undefined)?.style) ?? {};
  const styleEdge = selectedEdges[0];
  const edgeData = (styleEdge?.data ?? {}) as EdgeData;
  const inDiagram = new Set(nodes.filter((n) => n.type === "flow").map((n) => (n.data as { flowId: string }).flowId));

  const tool = (label: string, icon: React.ReactNode, onClick: () => void, disabled = false) => (
    <Tooltip>
      <TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} disabled={disabled}>{icon}</Button></TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-2 py-1.5">
        {canEdit && (
          <ToggleGroup type="single" variant="outline" size="sm" value={editing ? "edit" : "view"} onValueChange={(v) => v && setEditing(v === "edit")}>
            <ToggleGroupItem value="edit"><PencilIcon />{t("editMode")}</ToggleGroupItem>
            <ToggleGroupItem value="view"><EyeIcon />{t("viewMode")}</ToggleGroupItem>
          </ToggleGroup>
        )}
        {editing && <>
          <Separator orientation="vertical" className="h-6" />
          <Button size="sm" onClick={() => setAdding(true)}><PlusIcon data-icon="inline-start" />{t("addFlows")}</Button>
          {permissions.addFlow && (
            <Button size="sm" variant="secondary" onClick={() => { knownFlows.current = new Set(flows.map((f) => f.id)); dialog.open("flow/add/general-tab"); }}>
              <PlusIcon data-icon="inline-start" />{t("newFlow")}
            </Button>
          )}
          <Separator orientation="vertical" className="h-6" />
          {tool(t("shapes.rect"), <SquareIcon />, () => addShape("rect"))}
          {tool(t("shapes.ellipse"), <CircleIcon />, () => addShape("ellipse"))}
          {tool(t("shapes.diamond"), <DiamondIcon />, () => addShape("diamond"))}
          {tool(t("text"), <TypeIcon />, addText)}
          <Separator orientation="vertical" className="h-6" />
          {tool(t("actions.duplicate"), <CopyIcon />, () => duplicate(), !selectedNodes.length)}
          {tool(t("actions.group"), <GroupIcon />, group, selectedNodes.length < 2)}
          {tool(t("actions.ungroup"), <UngroupIcon />, ungroup, !selectedNodes.some((n) => n.type === "group"))}
          {tool(t("actions.delete"), <Trash2Icon />, removeSelected, !selectedNodes.length && !selectedEdges.length)}
          {tool(t("actions.undo"), <Undo2Icon />, undo)}
        </>}
        <span className="ml-auto text-xs text-muted-foreground">{canEdit ? t(`save.${saveState}`) : t("readOnly")}</span>
      </div>

      {editing && (styleNode || styleEdge) && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card px-3 py-1.5 text-xs">
          <span className="font-medium">{t("style.title")}</span>
          {styleNode && <>
            <ColorField label={t("style.background")} value={nodeStyle.bg ?? "#ffffff"} onChange={(bg) => setNodeStyle({ bg })} />
            <ColorField label={t("style.outline")} value={nodeStyle.border ?? "#1d4ed8"} onChange={(border) => setNodeStyle({ border })} />
            <ColorField label={t("style.font")} value={nodeStyle.color ?? "#111827"} onChange={(color) => setNodeStyle({ color })} />
            <label className="flex items-center gap-1.5">{t("style.fontSize")}
              <Input type="number" min={8} max={48} className="h-7 w-16" value={nodeStyle.fontSize ?? 14} onChange={(e) => setNodeStyle({ fontSize: Number(e.target.value) || 14 })} />
            </label>
          </>}
          {styleEdge && <>
            <label className="flex items-center gap-1.5">{t("style.thickness")}
              <Input type="number" min={1} max={10} step={0.5} className="h-7 w-16" value={edgeData.thickness ?? 1.5} onChange={(e) => setEdgeData({ thickness: Number(e.target.value) || 1.5 })} />
            </label>
            <span className="flex items-center gap-1.5">{t("style.direction")}
              <ToggleGroup type="single" variant="outline" size="sm" value={edgeData.direction ?? "right"} onValueChange={(v) => v && setEdgeData({ direction: v as Direction })}>
                {(["none", "left", "right", "both"] as const).map((d) => <ToggleGroupItem key={d} value={d}>{t(`directions.${d}`)}</ToggleGroupItem>)}
              </ToggleGroup>
            </span>
            <ColorField label={t("style.connector")} value={edgeData.color ?? "#6b7280"} onChange={(color) => setEdgeData({ color })} />
          </>}
        </div>
      )}

      <div className="min-h-0 flex-1 rounded-md border bg-card">
        <DiagramContext.Provider value={ctx}>
          <ReactFlow
            nodes={nodes} edges={edges.map(decorate)} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onNodeDragStart={() => snapshot()}
            nodesDraggable={editing} nodesConnectable={editing} elementsSelectable={editing} edgesFocusable={editing}
            connectionMode={ConnectionMode.Loose} deleteKeyCode={null} selectionKeyCode="Shift" multiSelectionKeyCode={["Meta", "Control"]}
            fitView fitViewOptions={{ maxZoom: 1 }} minZoom={0.1} maxZoom={3} proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </DiagramContext.Provider>
      </div>

      {adding && (
        <AddFlowsDialog flows={flows.filter((f) => !inDiagram.has(f.id))} onClose={() => setAdding(false)}
          onAdd={(ids) => { addFlows(ids); setAdding(false); }} />
      )}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1.5">{label}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-6 w-8 cursor-pointer rounded border" />
    </label>
  );
}
