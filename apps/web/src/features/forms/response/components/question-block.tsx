"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BellIcon, CalendarIcon, CircleHelpIcon, ClockIcon, EyeIcon, FlagIcon, HandIcon, HistoryIcon, InfoIcon, KeyIcon, LightbulbIcon,
  LockIcon, LockOpenIcon, MessageSquareIcon, TriangleAlertIcon, WrenchIcon, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CAN_MANDATORY, WEBAPP_ONLY } from "../../meta";
import type { FileRef } from "../../types";
import type { RtQuestion, RtRubric } from "../engine/model";
import { isFilled } from "../engine/values";
import { CellInput } from "./cell-input";
import { useResponse } from "./context";
import { signedUrl } from "./storage";

export const ICONS: Record<string, LucideIcon> = {
  question: CircleHelpIcon, clock: ClockIcon, exclamation_triangle: TriangleAlertIcon, wrench: WrenchIcon, flag: FlagIcon,
  info_circle: InfoIcon, bell: BellIcon, key: KeyIcon, hand_paper: HandIcon, lightbulb: LightbulbIcon, calendar: CalendarIcon, eye: EyeIcon,
};

export function BuilderImages({ images }: { images: FileRef[] }) {
  const [urls, setUrls] = useState<(string | null)[]>([]);
  useEffect(() => {
    let on = true;
    void Promise.all(images.map((i) => signedUrl(i.fileId))).then((u) => { if (on) setUrls(u); });
    return () => { on = false; };
  }, [images]);
  if (!images.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((u, i) => u && (
        // eslint-disable-next-line @next/next/no-img-element
        <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt={images[i].name ?? ""} className="h-24 rounded border object-cover" /></a>
      ))}
    </div>
  );
}

/** Barre d'actions d'une question : verrouiller / déverrouiller / historique / observation. */
export function QuestionTools({ question, compact }: { question: RtQuestion; compact?: boolean }) {
  const t = useTranslations("responses.question");
  const ctx = useResponse();
  const locked = question.cells.some((c) => ctx.values[c.lineageId]?.locked);
  const filled = question.cells.some((c) => isFilled(question.type, ctx.values[c.lineageId]?.value, c));
  const count = ctx.historyCount(question);
  const isLocked = ctx.isQuestionLocked(question);
  return (
    <div className="flex items-center gap-0.5">
      {locked && isLocked && <Tooltip><TooltipTrigger asChild><LockIcon className="size-4 text-muted-foreground" /></TooltipTrigger><TooltipContent>{t("locked")}</TooltipContent></Tooltip>}
      {!ctx.rubricReadOnly && ctx.canLock !== false && question.def.lockable && !locked && filled && (
        <Button variant="ghost" size={compact ? "icon-xs" : "sm"} onClick={() => ctx.requestLock(question)} aria-label={t("lock")}>
          <LockIcon data-icon="inline-start" />{!compact && t("lock")}
        </Button>
      )}
      {!ctx.rubricReadOnly && locked && isLocked && ctx.canUnlock && (
        <Button variant="ghost" size={compact ? "icon-xs" : "sm"} onClick={() => ctx.requestUnlock(question)} aria-label={t("unlock")}>
          <LockOpenIcon data-icon="inline-start" />{!compact && t("unlock")}
        </Button>
      )}
      {count > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("history")} onClick={() => ctx.openHistory(question)}><HistoryIcon /></Button>
          </TooltipTrigger>
          <TooltipContent>{t("history")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export function ObservationField({ question }: { question: RtQuestion }) {
  const t = useTranslations("responses.question");
  const ctx = useResponse();
  const disabled = ctx.rubricReadOnly || ctx.isQuestionLocked(question);
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-xs text-muted-foreground"><MessageSquareIcon className="size-3" />{t("observation")}</span>
      <Textarea rows={2} value={ctx.observations[question.lineageId] ?? ""} disabled={disabled} placeholder={t("observationPlaceholder")}
        onChange={(e) => ctx.setObservation(question.lineageId, e.target.value)} />
    </div>
  );
}

/** Question d'une rubrique « question ». */
export function QuestionBlock({ rubric, question, highlighted }: { rubric: RtRubric; question: RtQuestion; highlighted?: boolean }) {
  const t = useTranslations("responses.question");
  const q = question.def;
  const Icon = q.icon ? ICONS[q.icon] : null;
  const multi = ["multiple_answers", "unique_choice", "multiple_choices", "value_unit", "collaborator"].includes(question.type);
  const cells = multi ? question.cells : question.cells.slice(0, 1);
  return (
    <section id={`q-${question.lineageId}`}
      className={cn("flex scroll-mt-4 flex-col gap-3 rounded-md border p-4 transition-shadow", highlighted && "ring-2 ring-primary")}
      style={q.backgroundColor && q.backgroundColor.toLowerCase() !== "#ffffff" ? { backgroundColor: q.backgroundColor } : undefined}>
      <header className="flex items-start gap-2">
        {Icon && <Icon className="mt-0.5 size-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">
            {question.name}
            {q.mandatory && CAN_MANDATORY(question.type) && <span className="text-destructive"> *</span>}
            {q.additionalObservation && (
              <Tooltip>
                <TooltipTrigger asChild><InfoIcon className="ml-1 inline size-3.5 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent>{q.additionalObservation}</TooltipContent>
              </Tooltip>
            )}
          </h3>
          {q.description && <p className="text-sm text-muted-foreground">{q.description}</p>}
          {q.additionalComment && <p className="text-sm italic text-muted-foreground">{q.additionalComment}</p>}
          {WEBAPP_ONLY.has(question.type) && <p className="text-xs text-muted-foreground">{t("webappOnly")}</p>}
        </div>
        <QuestionTools question={question} />
      </header>
      <BuilderImages images={q.images ?? []} />
      <div className={cn("flex flex-col gap-3", question.type === "collaborator" && "grid grid-cols-1 gap-3 md:grid-cols-2")}>
        {cells.map((cell) => (
          <div key={cell.lineageId} className="flex flex-col gap-1">
            <CellInput rubric={rubric} question={question} cell={cell}
              label={multi && question.type !== "collaborator" ? cell.opt?.name || t("defaultOption", { order: cell.position }) : undefined} />
            {cell.opt?.images?.length ? <BuilderImages images={cell.opt.images} /> : null}
          </div>
        ))}
      </div>
      {q.withObservation && <ObservationField question={question} />}
    </section>
  );
}
