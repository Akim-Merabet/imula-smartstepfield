"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CombineIcon, CopyIcon, CopyPlusIcon, EllipsisIcon, PlusIcon, SplitIcon, Trash2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { canGenericParams, CAN_MANDATORY } from "../meta";
import type { QuestionType } from "../types";
import {
  addQuestion, addTableCell, deleteQuestion, deleteTableCell, duplicateQuestion, setUnifyCells, updateOption, updateQuestion, updateSlot,
} from "./actions";
import { useBuilder } from "./builder-context";
import { SwitchSetting, TextSetting } from "./fields";
import { TYPE_ICONS } from "./icons";
import { coordLabel, optionsOf, questionsOf, slotsOf, type BQuestion, type BRubric } from "./model";
import { OptionEditor } from "./option-editor";
import { MassParamsDialog, QuestionSettings, SlotEditor, TypeSelect } from "./question-editor";

type Selection = { kind: "question"; id: string } | { kind: "cell"; questionId: string; index: number } | null;

/** Tableau par colonnes (questions = colonnes) ou par lignes (questions = lignes) ; cellules = options. */
export function TableEditor({ rubric }: { rubric: BRubric }) {
  const t = useTranslations("formBuilder");
  const { s, idx, run, formId, editable, locale } = useBuilder();
  const [sel, setSel] = useState<Selection>(null);
  const [toDelete, setToDelete] = useState<BQuestion | null>(null);
  const [mass, setMass] = useState<BQuestion | null>(null);
  const questions = questionsOf(s, rubric.id);
  const byColumns = rubric.type === "table_column";
  const cellsOf = (q: BQuestion) => (q.type === "collaborator" ? slotsOf(s, q.id) : optionsOf(s, q.id));
  const count = Math.max(1, ...questions.map((q) => cellsOf(q).length));
  const first = questions[0];
  const firstCells = first ? cellsOf(first) : [];
  const qAxis = byColumns ? "column" : "row";
  const xAxis = byColumns ? "row" : "column";

  const crossName = (i: number) => {
    const c = firstCells[i] as { option_name?: string | null; name?: string | null } | undefined;
    return c?.option_name ?? (first?.type === "collaborator" ? c?.name : null) ?? t(`defaults.${xAxis}`, { n: i + 1 });
  };
  const saveCrossName = (i: number, v: string) => {
    const c = firstCells[i];
    if (!c || !first) return;
    if (first.type === "collaborator") run(() => updateSlot(formId, c.id, { name: v }));
    else run(() => updateOption(formId, c.id, { option_name: v }, locale));
  };

  const addQ = () => run(() => addQuestion(formId, rubric.id, null));
  const addX = () => run(() => addTableCell(formId, rubric.id, null));

  const qHeader = (q: BQuestion) => {
    const Icon = TYPE_ICONS[q.type as QuestionType];
    const active = sel?.kind === "question" && sel.id === q.id;
    return (
      <div className={cn("flex min-w-36 items-center gap-1 rounded px-2 py-1", active && "bg-accent")}>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => setSel({ kind: "question", id: q.id })}>
          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{q.name}</span>
          {q.mandatory && <span className="text-destructive">*</span>}
          {q.unify_cells && <Badge variant="outline" className="h-4 px-1 text-[0.65rem]">{t("table.unified")}</Badge>}
        </button>
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" aria-label={t("actions.more")}><EllipsisIcon /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => run(() => addQuestion(formId, rubric.id, q.id))}><PlusIcon />{t(`table.insert.${qAxis}`)}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => run(() => duplicateQuestion(formId, q.id))}><CopyIcon />{t("actions.duplicate")}</DropdownMenuItem>
                {q.type !== "collaborator" && cellsOf(q).length > 1 && (
                  <DropdownMenuItem onSelect={() => run(() => setUnifyCells(formId, q.id, !q.unify_cells))}>
                    {q.unify_cells ? <SplitIcon /> : <CombineIcon />}{q.unify_cells ? t("table.divide") : t("table.unify")}
                  </DropdownMenuItem>
                )}
                {q.type !== "collaborator" && canGenericParams(q.type as QuestionType, rubric.type) && cellsOf(q).length > 1 && !q.unify_cells && (
                  <DropdownMenuItem onSelect={() => setMass(q)}><CopyPlusIcon />{t("question.actions.massParams")}</DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" disabled={questions.length <= 1} onSelect={() => setToDelete(q)}><Trash2Icon />{t(`table.delete.${qAxis}`)}</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  const xHeader = (i: number) => (
    <div className="flex min-w-32 items-center gap-1">
      <TextSetting className="flex-1" value={crossName(i)} disabled={!editable} required inputClassName="h-7 font-medium"
        onSave={(v) => saveCrossName(i, v)} />
      {editable && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" aria-label={t("actions.more")}><EllipsisIcon /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => run(() => addTableCell(formId, rubric.id, i + 1))}><PlusIcon />{t(`table.insert.${xAxis}`)}</DropdownMenuItem>
              <DropdownMenuItem disabled={i + 1 >= count} onSelect={() => run(() => addTableCell(formId, rubric.id, i + 1, true))}><CopyIcon />{t("actions.duplicate")}</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" disabled={count <= 1} onSelect={() => run(() => deleteTableCell(formId, rubric.id, i + 1))}>
                <Trash2Icon />{t(`table.delete.${xAxis}`)}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  const cell = (q: BQuestion, i: number) => {
    const c = cellsOf(q)[i];
    if (!c) return <div className="h-10 rounded border border-dashed bg-muted/50" />;
    const p = idx.positionOf.get(c.id);
    const index = q.unify_cells ? 0 : i;
    const active = sel?.kind === "cell" && sel.questionId === q.id && sel.index === index;
    const opt = q.type === "collaborator" ? null : optionsOf(s, q.id)[i];
    return (
      <button type="button" onClick={() => setSel({ kind: "cell", questionId: q.id, index })}
        className={cn("flex h-10 w-full items-center justify-between gap-2 rounded border bg-background px-2 text-left text-xs hover:border-primary",
          active && "border-primary ring-1 ring-primary", opt?.frozen && "bg-muted")}>
        <span className="font-mono text-muted-foreground">{p ? coordLabel(p) : ""}</span>
        <span className="truncate text-muted-foreground">{opt?.formula ? "ƒ" : opt?.prefill ? "@@" : ""}</span>
      </button>
    );
  };

  const hideFirst = rubric.first_column_hidden;
  const selQuestion = sel?.kind === "question" ? questions.find((q) => q.id === sel.id)
    : sel?.kind === "cell" ? questions.find((q) => q.id === sel.questionId) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border bg-card p-3">
        <table className="border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className={cn("min-w-32 text-left text-xs font-medium text-muted-foreground", hideFirst && "opacity-40")}>
                {hideFirst ? t("table.firstColumnHidden") : ""}
              </th>
              {byColumns
                ? questions.map((q) => <th key={q.id} className="text-left font-normal">{qHeader(q)}</th>)
                : Array.from({ length: count }, (_, i) => <th key={i} className="text-left font-normal">{xHeader(i)}</th>)}
            </tr>
          </thead>
          <tbody>
            {byColumns
              ? Array.from({ length: count }, (_, i) => (
                <tr key={i}>
                  <td className={cn(hideFirst && "opacity-40")}>{xHeader(i)}</td>
                  {questions.map((q) => <td key={q.id}>{cell(q, i)}</td>)}
                </tr>
              ))
              : questions.map((q) => (
                <tr key={q.id}>
                  <td className={cn(hideFirst && "opacity-40")}>{qHeader(q)}</td>
                  {Array.from({ length: count }, (_, i) => <td key={i}>{cell(q, i)}</td>)}
                </tr>
              ))}
          </tbody>
        </table>
        {editable && (
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={byColumns ? addX : addQ}><PlusIcon data-icon="inline-start" />{t("table.addRow")}</Button>
            <Button variant="outline" size="sm" onClick={byColumns ? addQ : addX}><PlusIcon data-icon="inline-start" />{t("table.addColumn")}</Button>
          </div>
        )}
      </div>

      {!sel && <p className="text-sm text-muted-foreground">{t("table.selectHint")}</p>}

      {sel?.kind === "question" && selQuestion && (
        <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <TextSetting className="min-w-48 flex-1" label={t(`table.name.${qAxis}`)} value={selQuestion.name} required disabled={!editable}
              onSave={(v) => run(() => updateQuestion(formId, selQuestion.id, { name: v }))} />
            <TypeSelect question={selQuestion} rubric={rubric} />
            {CAN_MANDATORY(selQuestion.type as QuestionType) && (
              <SwitchSetting label={t("question.mandatory")} checked={selQuestion.mandatory} disabled={!editable}
                onChange={(v) => run(() => updateQuestion(formId, selQuestion.id, { mandatory: v }))} />
            )}
          </div>
          <QuestionSettings question={selQuestion} rubric={rubric} />
        </div>
      )}

      {sel?.kind === "cell" && selQuestion && (() => {
        const qPos = idx.questionPos.get(selQuestion.id) ?? 1;
        const title = t(byColumns ? "option.tableColumnTitle" : "option.tableRowTitle", { q: qPos, o: sel.index + 1 })
          + (selQuestion.unify_cells ? ` — ${t("table.unifiedInfo")}` : "");
        if (selQuestion.type === "collaborator") {
          const slot = slotsOf(s, selQuestion.id)[sel.index];
          return slot ? <SlotEditor slot={slot} question={selQuestion} canDelete={false} title={title} /> : null;
        }
        const option = optionsOf(s, selQuestion.id)[sel.index];
        return option ? (
          <div className="rounded-lg border bg-card p-4">
            <OptionEditor option={option} question={selQuestion} rubric={rubric} title={title} />
          </div>
        ) : null;
      })()}

      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={t(`table.deleteTitle.${qAxis}`, { name: toDelete?.name ?? "" })} description={t("noTrash")} confirmLabel={t("actions.delete")}
        onConfirm={async () => { if (toDelete) { await run(() => deleteQuestion(formId, toDelete.id)); setSel(null); } }} />
      {mass && <MassParamsDialog question={mass} rubric={rubric} onClose={() => setMass(null)} />}
    </div>
  );
}
