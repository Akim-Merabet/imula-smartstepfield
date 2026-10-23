"use client";

import { useTranslations } from "next-intl";
import { MessageSquareIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CAN_MANDATORY } from "../../meta";
import { cellHeader, tableSize, type RtQuestion, type RtRubric } from "../engine/model";
import { CellInput } from "./cell-input";
import { useResponse } from "./context";
import { ObservationField, QuestionTools } from "./question-block";

function QuestionHead({ question }: { question: RtQuestion }) {
  const ctx = useResponse();
  const t = useTranslations("responses.question");
  return (
    <div id={`q-${question.lineageId}`} className="flex scroll-mt-4 items-start justify-between gap-1">
      <span className="font-medium">
        {question.name}
        {question.def.mandatory && CAN_MANDATORY(question.type) && <span className="text-destructive"> *</span>}
      </span>
      <div className="flex items-center">
        {question.def.withObservation && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={t("observation")}
                className={cn(ctx.observations[question.lineageId] && "text-primary")}><MessageSquareIcon /></Button>
            </PopoverTrigger>
            <PopoverContent className="w-80"><ObservationField question={question} /></PopoverContent>
          </Popover>
        )}
        <QuestionTools question={question} compact />
      </div>
    </div>
  );
}

/** Tableau par colonnes (question = colonne) ou par lignes (question = ligne) ; 1re colonne d'en-têtes. */
export function TableRubric({ rubric, onAdd, adding }: { rubric: RtRubric; onAdd: (axis: "row" | "column") => void; adding: boolean }) {
  const t = useTranslations("responses.table");
  const ctx = useResponse();
  const n = tableSize(rubric);
  const hideFirst = rubric.def.firstColumnHidden;
  const byColumns = rubric.def.type === "table_column";
  const canAdd = !ctx.rubricReadOnly;
  const headCls = "border-b border-r bg-muted px-3 py-2 text-left align-top text-sm";
  const cellCls = "border-b border-r px-2 py-2 align-top";

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {!hideFirst && <th className={cn(headCls, "w-40")} />}
              {byColumns
                ? rubric.questions.map((q) => <th key={q.lineageId} className={cn(headCls, "min-w-48")}><QuestionHead question={q} /></th>)
                : Array.from({ length: n }, (_, j) => (
                  <th key={j} className={cn(headCls, "min-w-48")}>{cellHeader(rubric, j) ?? t("column", { n: j + 1 })}</th>
                ))}
            </tr>
          </thead>
          <tbody>
            {byColumns
              ? Array.from({ length: n }, (_, i) => (
                <tr key={i}>
                  {!hideFirst && <th className={cn(headCls, "font-medium")}>{cellHeader(rubric, i) ?? t("row", { n: i + 1 })}</th>}
                  {rubric.questions.map((q) => {
                    const cell = q.cells[i];
                    return (
                      <td key={q.lineageId} className={cellCls} style={q.def.backgroundColor ? { backgroundColor: q.def.backgroundColor } : undefined}>
                        {cell ? <CellInput rubric={rubric} question={q} cell={cell} compact /> : null}
                      </td>
                    );
                  })}
                </tr>
              ))
              : rubric.questions.map((q) => (
                <tr key={q.lineageId} style={q.def.backgroundColor ? { backgroundColor: q.def.backgroundColor } : undefined}>
                  {!hideFirst && <th className={cn(headCls, "font-medium")}><QuestionHead question={q} /></th>}
                  {Array.from({ length: n }, (_, j) => {
                    const cell = q.cells[j];
                    return <td key={j} className={cellCls}>{cell ? <CellInput rubric={rubric} question={q} cell={cell} compact /> : null}</td>;
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {canAdd && (rubric.def.allowAddRow || rubric.def.allowAddColumn) && (
        <div className="flex gap-2">
          {rubric.def.allowAddRow && (
            <Button variant="outline" size="sm" disabled={adding} onClick={() => onAdd("row")}><PlusIcon data-icon="inline-start" />{t("addRow")}</Button>
          )}
          {rubric.def.allowAddColumn && (
            <Button variant="outline" size="sm" disabled={adding} onClick={() => onAdd("column")}><PlusIcon data-icon="inline-start" />{t("addColumn")}</Button>
          )}
        </div>
      )}
    </div>
  );
}
