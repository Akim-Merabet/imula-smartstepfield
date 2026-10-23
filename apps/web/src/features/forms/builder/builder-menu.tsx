"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRightIcon, CopyIcon, GripVerticalIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { readStorage, writeStorage } from "@/lib/storage";
import { cn } from "@/lib/utils";
import type { QuestionType } from "../types";
import { moveQuestion, reorderQuestions, reorderRubrics } from "./actions";
import { useBuilder } from "./builder-context";
import { TYPE_ICONS } from "./icons";
import { coordLabel, optionsOf, questionsOf, rubricsOf, slotsOf, type BQuestion, type BRubric } from "./model";
import { AddRubricMenu, RUBRIC_ICONS } from "./rubric-editor";

const WIDTH_KEY = "FormMenuWidth";
const COLLAPSED_KEY = "FormMenuCollapsed";

/** Menu latéral du builder : arbre rubriques → questions, glisser-déposer, identifiants RxQyOz. */
export function BuilderMenu({ current, onNavigate }: { current: string | null; onNavigate: (rubricId: string, questionId?: string) => void }) {
  const t = useTranslations("formBuilder.menu");
  const { s, setS, run, formId, editable } = useBuilder();
  const [width, setWidth] = useState(300);
  const [collapsed, setCollapsed] = useState(false);
  const [showIds, setShowIds] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const dragging = useRef(false);

  useEffect(() => {
    // Préférences locales lues après hydratation (localStorage indisponible côté serveur).
    const w = Number(readStorage(WIDTH_KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (w >= 220 && w <= 560) setWidth(w);
    setCollapsed(readStorage(COLLAPSED_KEY) === "1");
  }, []);
  const [prevCurrent, setPrevCurrent] = useState(current);
  if (prevCurrent !== current) {
    setPrevCurrent(current);
    if (current && !expanded.has(current)) setExpanded(new Set(expanded).add(current));
  }

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = width;
    const move = (ev: MouseEvent) => setWidth(Math.min(560, Math.max(220, startW + ev.clientX - startX)));
    const up = (ev: MouseEvent) => {
      dragging.current = false;
      writeStorage(WIDTH_KEY, String(Math.min(560, Math.max(220, startW + ev.clientX - startX))));
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const toggleCollapsed = () => setCollapsed((c) => { writeStorage(COLLAPSED_KEY, c ? "0" : "1"); return !c; });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const rubrics = rubricsOf(s);

  const onDragEnd = async (e: DragEndEvent) => {
    if (!editable || !e.over || e.active.id === e.over.id) return;
    const [ak, aid] = String(e.active.id).split(":");
    const [ok, oid] = String(e.over.id).split(":");
    if (ak === "r" && ok === "r") {
      const ids = rubrics.map((r) => r.id);
      const next = arrayMove(ids, ids.indexOf(aid), ids.indexOf(oid));
      setS((st) => ({ ...st, rubrics: st.rubrics.map((r) => ({ ...r, position: next.indexOf(r.id) + 1 })) }));
      await run(() => reorderRubrics(formId, next));
      return;
    }
    if (ak !== "q") return;
    const q = s.questions.find((x) => x.id === aid);
    if (!q) return;
    const source = s.rubrics.find((r) => r.id === q.rubric_id)!;
    const targetRubricId = ok === "r" ? oid : s.questions.find((x) => x.id === oid)?.rubric_id;
    const target = s.rubrics.find((r) => r.id === targetRubricId);
    if (!target) return;
    if (target.id === source.id) {
      if (ok !== "q") return;
      const ids = questionsOf(s, source.id).map((x) => x.id);
      const next = arrayMove(ids, ids.indexOf(aid), ids.indexOf(oid));
      setS((st) => ({ ...st, questions: st.questions.map((x) => (x.rubric_id === source.id ? { ...x, position: next.indexOf(x.id) + 1 } : x)) }));
      await run(() => reorderQuestions(formId, source.id, next));
      return;
    }
    await run(() => moveQuestion(formId, aid, target.id, ok === "q" ? oid : null));
  };

  if (collapsed) {
    return (
      <aside className="flex w-[1.85rem] shrink-0 flex-col items-center border-r bg-sidebar py-3">
        <button type="button" onClick={toggleCollapsed} aria-label={t("expand")} className="rounded p-1 hover:bg-accent">
          <PanelLeftOpenIcon className="size-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="relative flex shrink-0 flex-col border-r bg-sidebar" style={{ width }}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="flex-1 text-sm font-medium">{t("title")}</span>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Switch checked={showIds} onCheckedChange={setShowIds} size="sm" />{t("identifiers")}
        </label>
        <button type="button" onClick={toggleCollapsed} aria-label={t("collapse")} className="rounded p-1 text-muted-foreground hover:bg-accent">
          <PanelLeftCloseIcon className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <DndContext id="form-builder-menu" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rubrics.map((r) => `r:${r.id}`)} strategy={verticalListSortingStrategy}>
            {rubrics.map((r, ri) => (
              <RubricNode key={r.id} rubric={r} index={ri + 1} active={current === r.id} open={expanded.has(r.id)} showIds={showIds}
                onToggle={() => setExpanded((e) => { const n = new Set(e); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                onNavigate={onNavigate} />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      {editable && (
        <div className="border-t p-2">
          <AddRubricMenu after={current} onCreated={(id) => onNavigate(id)}
            trigger={<Button variant="outline" size="sm" className="w-full"><PlusIcon data-icon="inline-start" />{t("addRubric")}</Button>} />
        </div>
      )}
      <div onMouseDown={startResize} className="absolute top-0 -right-1 bottom-0 w-2 cursor-col-resize" aria-hidden />
    </aside>
  );
}

function RubricNode({ rubric, index, active, open, showIds, onToggle, onNavigate }: {
  rubric: BRubric; index: number; active: boolean; open: boolean; showIds: boolean; onToggle: () => void;
  onNavigate: (rubricId: string, questionId?: string) => void;
}) {
  const t = useTranslations("formBuilder.menu");
  const { s, editable } = useBuilder();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `r:${rubric.id}`, disabled: !editable });
  const Icon = RUBRIC_ICONS[rubric.type];
  const questions = questionsOf(s, rubric.id);
  return (
    <div style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("mb-0.5", isDragging && "opacity-60")}>
      <div ref={setNodeRef} className={cn("group flex items-center gap-1 rounded px-1 py-1.5 text-sm hover:bg-accent", active && "bg-accent font-medium")}>
        {editable && (
          <button type="button" {...attributes} {...listeners} aria-label={t("drag")} className="cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100">
            <GripVerticalIcon className="size-3.5" />
          </button>
        )}
        <button type="button" onClick={onToggle} aria-label={t("toggle")} className="rounded p-0.5 text-muted-foreground">
          <ChevronRightIcon className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onNavigate(rubric.id)}>
          <Icon className="size-4 shrink-0 text-primary" />
          <span className="truncate">{index}. {rubric.name}</span>
        </button>
      </div>
      {open && (
        <div className="ml-5 border-l pl-2">
          {showIds && (
            <div className="px-1 pt-1 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
              {rubric.type === "question" ? t("optionIdentifier") : t("cellIdentifier")}
            </div>
          )}
          <SortableContext items={questions.map((q) => `q:${q.id}`)} strategy={verticalListSortingStrategy}>
            {questions.map((q, qi) => (
              <QuestionNode key={q.id} question={q} index={qi + 1} rubricIndex={index} showIds={showIds}
                onClick={() => onNavigate(rubric.id, q.id)} />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

function QuestionNode({ question, index, rubricIndex, showIds, onClick }: {
  question: BQuestion; index: number; rubricIndex: number; showIds: boolean; onClick: () => void;
}) {
  const t = useTranslations("formBuilder.menu");
  const { s, editable, copy } = useBuilder();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `q:${question.id}`, disabled: !editable });
  const Icon = TYPE_ICONS[question.type as QuestionType];
  const cells = question.type === "collaborator" ? slotsOf(s, question.id) : optionsOf(s, question.id);
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "opacity-60")}>
      <div className="group flex items-center gap-1 rounded px-1 py-1 text-sm hover:bg-accent">
        {editable && (
          <button type="button" {...attributes} {...listeners} aria-label={t("drag")} className="cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100">
            <GripVerticalIcon className="size-3.5" />
          </button>
        )}
        <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{index}. {question.name}</span>
          {question.mandatory && <span className="text-destructive">*</span>}
        </button>
      </div>
      {showIds && (
        <div className="mb-1 ml-6 flex flex-col">
          {cells.map((c, ci) => {
            const id = coordLabel({ r: rubricIndex, q: index, o: ci + 1 });
            const label = ("option_name" in c ? c.option_name : null) ?? c.name ?? "";
            return (
              <div key={c.id} className="flex items-center gap-1 text-xs">
                <span className="font-mono">{id}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
                <Button variant="ghost" size="icon-xs" aria-label={t("copy")} onClick={() => copy(id)}><CopyIcon /></Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
