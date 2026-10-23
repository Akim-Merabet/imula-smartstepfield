"use client";

import { useTranslations } from "next-intl";
import { CalculatorIcon, CameraIcon, FileUpIcon, MapPinIcon, PenLineIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toDisplay } from "@/lib/formula/engine";
import { cn } from "@/lib/utils";
import type { PrefillDef, QuestionType } from "../types";
import { useBuilder } from "./builder-context";
import { QUESTION_ICON_COMPONENTS } from "./icons";
import { optionsOf, questionsOf, slotsOf, type BOption, type BQuestion, type BRubric } from "./model";

/** Rendu lecture seule (mode aperçu) d'une option. */
function OptionPreview({ type, option, compact }: { type: QuestionType; option: BOption | undefined; compact?: boolean }) {
  const t = useTranslations("formBuilder.preview");
  const { locale } = useBuilder();
  const prefill = (option?.prefill ?? null) as PrefillDef | null;
  const pre = prefill?.mode === "dynamic" ? prefill.variable ?? "" : typeof prefill?.value === "string" ? prefill.value : "";
  const label = !compact && option?.name ? <span className="text-sm">{option.name}</span> : null;
  switch (type) {
    case "short_answer": case "multiple_answers":
      return <div className="flex flex-col gap-1">{label}<Input disabled placeholder={option?.placeholder ?? ""} value={pre} readOnly /></div>;
    case "long_answer": case "text_editor":
      return <Textarea disabled placeholder={option?.placeholder ?? ""} value={pre} readOnly rows={compact ? 1 : 3} />;
    case "unique_choice":
      return <label className="flex items-center gap-2 text-sm"><span className="size-4 rounded-full border" />{option?.name}</label>;
    case "multiple_choices":
      return <label className="flex items-center gap-2 text-sm"><Checkbox disabled checked={prefill?.value === true} />{option?.name}</label>;
    case "single_choice_list": case "multiple_choice_list":
      return <Input disabled readOnly placeholder={(option?.choices ?? []).join(" / ") || t("select")} />;
    case "date": return <Input disabled type="date" />;
    case "datetime": return <Input disabled type="datetime-local" />;
    case "duration": return <div className="flex items-center gap-1"><Input disabled className="w-16" placeholder={t("hours")} /><span>:</span><Input disabled className="w-16" placeholder={t("minutes")} /></div>;
    case "value_unit":
      return <div className="flex items-center gap-2">{label}<Input disabled placeholder={option?.value_hint ?? ""} className="w-32" /><span className="text-sm text-muted-foreground">{option?.unit}</span></div>;
    case "photo": return <div className="flex h-9 items-center gap-2 rounded border border-dashed px-2 text-sm text-muted-foreground"><CameraIcon className="size-4" />{t("photo")}</div>;
    case "file": return <div className="flex h-9 items-center gap-2 rounded border border-dashed px-2 text-sm text-muted-foreground"><FileUpIcon className="size-4" />{t("file")}</div>;
    case "location": return <div className="flex h-9 items-center gap-2 rounded border px-2 text-sm text-muted-foreground"><MapPinIcon className="size-4" />{t("location")}</div>;
    case "formula":
      return (
        <div className="flex items-center gap-2 text-sm">
          <CalculatorIcon className="size-4 text-muted-foreground" />
          <code className="truncate rounded bg-muted px-1.5 py-0.5 text-xs">{toDisplay(option?.formula ?? "", locale) || "—"}</code>
          {option?.unit && <span className="text-muted-foreground">{option.unit}</span>}
        </div>
      );
    default: return null;
  }
}

function QuestionPreview({ question }: { question: BQuestion }) {
  const t = useTranslations("formBuilder.preview");
  const { s } = useBuilder();
  const type = question.type as QuestionType;
  const Icon = question.icon ? QUESTION_ICON_COMPONENTS[question.icon] : null;
  return (
    <section id={`q-${question.id}`} className="scroll-mt-4 flex flex-col gap-3 rounded-lg border bg-card p-4"
      style={question.background_color ? { backgroundColor: question.background_color } : undefined}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-4 text-muted-foreground" />}
        <span className="font-medium">{question.name}</span>
        {question.mandatory && <span className="text-destructive">*</span>}
      </div>
      {question.description && <p className="text-sm text-muted-foreground">{question.description}</p>}
      {type === "collaborator"
        ? slotsOf(s, question.id).map((sl) => (
          <div key={sl.id} className="flex items-center gap-2 rounded border border-dashed px-3 py-2 text-sm text-muted-foreground">
            <PenLineIcon className="size-4" />{sl.name}{!sl.disable_signature && <Badge variant="outline">{t("signature")}</Badge>}
          </div>
        ))
        : <div className="flex flex-col gap-2">{optionsOf(s, question.id).map((o) => <OptionPreview key={o.id} type={type} option={o} />)}</div>}
      {question.with_observation && <Textarea disabled placeholder={t("observation")} rows={1} />}
    </section>
  );
}

function TablePreview({ rubric }: { rubric: BRubric }) {
  const t = useTranslations("formBuilder");
  const { s } = useBuilder();
  const questions = questionsOf(s, rubric.id);
  const byColumns = rubric.type === "table_column";
  const cells = (q: BQuestion) => (q.type === "collaborator" ? slotsOf(s, q.id) : optionsOf(s, q.id));
  const count = Math.max(1, ...questions.map((q) => cells(q).length));
  const first = questions[0];
  const crossName = (i: number) => {
    const c = first ? (cells(first)[i] as { option_name?: string | null; name?: string | null } | undefined) : undefined;
    return c?.option_name ?? c?.name ?? t(`defaults.${byColumns ? "row" : "column"}`, { n: i + 1 });
  };
  const cell = (q: BQuestion, i: number) => q.type === "collaborator"
    ? <div className="flex h-9 items-center gap-1 text-xs text-muted-foreground"><PenLineIcon className="size-3.5" />{cells(q)[i]?.name}</div>
    : <OptionPreview type={q.type as QuestionType} option={optionsOf(s, q.id)[i]} compact />;
  const showFirst = !rubric.first_column_hidden;
  return (
    <div className="overflow-x-auto rounded-lg border bg-card p-3">
      <table className="border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            {showFirst && <th />}
            {byColumns
              ? questions.map((q) => <th key={q.id} className="min-w-36 text-left font-medium">{q.name}{q.mandatory && <span className="text-destructive"> *</span>}</th>)
              : Array.from({ length: count }, (_, i) => <th key={i} className="min-w-36 text-left font-medium">{crossName(i)}</th>)}
          </tr>
        </thead>
        <tbody>
          {byColumns
            ? Array.from({ length: count }, (_, i) => (
              <tr key={i}>{showFirst && <td className="pr-2 font-medium">{crossName(i)}</td>}{questions.map((q) => <td key={q.id}>{cell(q, i)}</td>)}</tr>
            ))
            : questions.map((q) => (
              <tr key={q.id}>{showFirst && <td className="pr-2 font-medium">{q.name}{q.mandatory && <span className="text-destructive"> *</span>}</td>}
                {Array.from({ length: count }, (_, i) => <td key={i}>{cell(q, i)}</td>)}</tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export function RubricPreview({ rubric }: { rubric: BRubric }) {
  const { s, idx } = useBuilder();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className={cn("rounded-lg border bg-card p-4")}>
        <h2 className="text-lg font-medium">{idx.rubricPos.get(rubric.id)}. {rubric.name}</h2>
        {rubric.description && <p className="text-sm text-muted-foreground">{rubric.description}</p>}
        {rubric.additional_comment && <p className="mt-1 text-sm">{rubric.additional_comment}</p>}
      </div>
      {rubric.type === "question"
        ? questionsOf(s, rubric.id).map((q) => <QuestionPreview key={q.id} question={q} />)
        : <TablePreview rubric={rubric} />}
    </div>
  );
}
