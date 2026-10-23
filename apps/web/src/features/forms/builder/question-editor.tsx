"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRightLeftIcon, ChevronDownIcon, CopyIcon, CopyPlusIcon, EllipsisVerticalIcon, ListPlusIcon, PlusIcon, Settings2Icon, Trash2Icon,
  UserPlusIcon,
} from "lucide-react";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  CAN_BACKDATING, CAN_MANDATORY, canGenericParams, MULTI_OPTION, QUESTION_COLORS, QUESTION_ICONS, questionTypesFor, SIZES, WEBAPP_ONLY,
} from "../meta";
import type { QuestionType } from "../types";
import {
  addOption, addQuestion, applyGenericParams, changeQuestionType, deleteOption, deleteQuestion, deleteSlot, duplicateOption,
  duplicateQuestion, moveQuestion, updateQuestion, updateSlot,
} from "./actions";
import { useBuilder } from "./builder-context";
import { SelectSetting, SwitchSetting, TextSetting, ToggleSection } from "./fields";
import { QUESTION_ICON_COMPONENTS, TYPE_ICONS } from "./icons";
import { ImagesField } from "./images-field";
import { coordLabel, optionsOf, questionsOf, rubricsOf, slotsOf, type BQuestion, type BRubric, type BSlot } from "./model";
import { OptionEditor } from "./option-editor";

/** Sélecteur de nature avec confirmation de perte de données. */
export function TypeSelect({ question, rubric }: { question: BQuestion; rubric: BRubric }) {
  const t = useTranslations("formBuilder");
  const { run, formId, editable } = useBuilder();
  const [pending, setPending] = useState<QuestionType | null>(null);
  const kind = rubric.type === "question" ? "question" : rubric.type === "table_column" ? "column" : "row";
  return (
    <>
      <SelectSetting className="w-60" value={question.type} disabled={!editable}
        options={questionTypesFor(rubric.type).map((ty) => {
          const Icon = TYPE_ICONS[ty];
          return { value: ty, label: rubric.type !== "question" && ty === "multiple_choices" ? t("types.checkbox") : t(`types.${ty}`), icon: <Icon /> };
        })}
        onChange={(v) => { if (v !== question.type) setPending(v as QuestionType); }} />
      <ConfirmDialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}
        title={t(`question.changeType.${kind}`)} description={t("question.changeType.subtitle")} destructive={false}
        onConfirm={async () => { if (pending) await run(() => changeQuestionType(formId, question.id, pending)); }} />
    </>
  );
}

/** Paramètres d'une question (§3.3.2). */
export function QuestionSettings({ question, rubric }: { question: BQuestion; rubric: BRubric }) {
  const t = useTranslations("formBuilder.question");
  const { run, formId, editable, data } = useBuilder();
  const type = question.type as QuestionType;
  const isTable = rubric.type !== "question";
  const save = (patch: Parameters<typeof updateQuestion>[2]) => run(() => updateQuestion(formId, question.id, patch));
  const disabled = !editable;
  return (
    <div className="flex flex-col gap-4">
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <TextSetting label={t("description")} multiline value={question.description} disabled={disabled} onSave={(v) => save({ description: v })} />
        <TextSetting label={t("additionalComment")} multiline value={question.additional_comment} disabled={disabled} onSave={(v) => save({ additional_comment: v })} />
        <TextSetting label={t("additionalObservation")} description={t("additionalObservationInfo")} multiline value={question.additional_observation}
          disabled={disabled} onSave={(v) => save({ additional_observation: v })} />
        {type === "photo" && (
          <SelectSetting label={t("photoSize")} value={question.photo_size ?? "s"} disabled={disabled}
            options={SIZES.map((sz) => ({ value: sz, label: sz.toUpperCase() }))} onChange={(v) => save({ photo_size: v as never })} />
        )}
      </FieldGroup>
      <div className="grid gap-3 md:grid-cols-2">
        {CAN_MANDATORY(type) && <SwitchSetting label={t("mandatory")} checked={question.mandatory} disabled={disabled} onChange={(v) => save({ mandatory: v })} />}
        <SwitchSetting label={t("withObservation")} checked={question.with_observation} disabled={disabled} onChange={(v) => save({ with_observation: v })} />
        <SwitchSetting label={t("lockable")} checked={question.lockable || data.form.lock_responses} disabled={disabled || data.form.lock_responses}
          description={data.form.lock_responses ? t("lockableForm") : undefined} onChange={(v) => save({ lockable: v })} />
        {CAN_BACKDATING.has(type) && <SwitchSetting label={t("allowBackdating")} checked={question.allow_backdating} disabled={disabled} onChange={(v) => save({ allow_backdating: v })} />}
        <SwitchSetting label={t("shared")} checked={question.shared} disabled={disabled} onChange={(v) => save({ shared: v })} />
        <SwitchSetting label={t("hideInPdf")} checked={question.hide_in_pdf} disabled={disabled} onChange={(v) => save({ hide_in_pdf: v })} />
        {isTable && <SwitchSetting label={t("hideImagesBelowTable")} checked={question.hide_images_below_table} disabled={disabled} onChange={(v) => save({ hide_images_below_table: v })} />}
      </div>
      <StyleEditor question={question} disabled={disabled} onSave={save} />
      {!isTable && <ImagesField ownerKind="question" ownerId={question.id} />}
    </div>
  );
}

function StyleEditor({ question, disabled, onSave }: { question: BQuestion; disabled: boolean; onSave: (p: Parameters<typeof updateQuestion>[2]) => void }) {
  const t = useTranslations("formBuilder.question.style");
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-card p-3">
      <span className="text-sm font-medium">{t("title")}</span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 text-sm text-muted-foreground">{t("color")}</span>
        <button type="button" disabled={disabled} onClick={() => onSave({ background_color: null })} title={t("noColor")}
          className={cn("size-6 rounded border bg-background", !question.background_color && "ring-2 ring-primary")} />
        {QUESTION_COLORS.map((c) => (
          <button key={c.id} type="button" disabled={disabled} title={t(`colors.${c.id}`)} onClick={() => onSave({ background_color: c.hex })}
            className={cn("size-6 rounded border", question.background_color?.toLowerCase() === c.hex.toLowerCase() && "ring-2 ring-primary")}
            style={{ backgroundColor: c.hex }} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-16 text-sm text-muted-foreground">{t("icon")}</span>
        <Button variant={question.icon ? "ghost" : "secondary"} size="xs" disabled={disabled} onClick={() => onSave({ icon: null })}>{t("noIcon")}</Button>
        {QUESTION_ICONS.map((ic) => {
          const Icon = QUESTION_ICON_COMPONENTS[ic];
          return (
            <Button key={ic} variant={question.icon === ic ? "secondary" : "ghost"} size="icon-xs" disabled={disabled} aria-label={ic}
              onClick={() => onSave({ icon: ic })}><Icon /></Button>
          );
        })}
      </div>
    </div>
  );
}

/** Carte d'une question dans une rubrique question. */
export function QuestionCard({ question, rubric }: { question: BQuestion; rubric: BRubric }) {
  const t = useTranslations("formBuilder");
  const { s, idx, run, formId, editable } = useBuilder();
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [move, setMove] = useState(false);
  const [mass, setMass] = useState(false);
  const type = question.type as QuestionType;
  const qPos = idx.questionPos.get(question.id) ?? question.position;
  const Icon = question.icon ? QUESTION_ICON_COMPONENTS[question.icon] : null;
  const options = optionsOf(s, question.id);
  const slots = slotsOf(s, question.id);

  return (
    <section id={`q-${question.id}`} className="scroll-mt-4 rounded-lg border bg-card shadow-xs"
      style={question.background_color ? { backgroundColor: question.background_color } : undefined}>
      <header className="flex flex-wrap items-center gap-3 p-4">
        <Badge variant="secondary" className="shrink-0">{t("question.number", { n: qPos })}</Badge>
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
        <TextSetting className="min-w-48 flex-1" value={question.name} required disabled={!editable} inputClassName="font-medium"
          onSave={(v) => run(() => updateQuestion(formId, question.id, { name: v }))} />
        <TypeSelect question={question} rubric={rubric} />
        {CAN_MANDATORY(type) && (
          <SwitchSetting label={t("question.mandatory")} checked={question.mandatory} disabled={!editable}
            onChange={(v) => run(() => updateQuestion(formId, question.id, { mandatory: v }))} />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t("actions.more")}><EllipsisVerticalIcon /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => setShowSettings((v) => !v)}><Settings2Icon />{t("question.actions.configure")}</DropdownMenuItem>
              {editable && (MULTI_OPTION.has(type)) && (
                <DropdownMenuItem onSelect={() => run(() => addOption(formId, question.id))}><ListPlusIcon />{t("question.actions.addOption")}</DropdownMenuItem>
              )}
              {editable && type === "collaborator" && (
                <DropdownMenuItem onSelect={() => run(() => addOption(formId, question.id))}><UserPlusIcon />{t("question.actions.addContributor")}</DropdownMenuItem>
              )}
              {editable && canGenericParams(type, rubric.type) && type !== "collaborator" && options.length > 1 && (
                <DropdownMenuItem onSelect={() => setMass(true)}><CopyPlusIcon />{t("question.actions.massParams")}</DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            {editable && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => run(() => addQuestion(formId, rubric.id, question.id))}><PlusIcon />{t("question.actions.insertBelow")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => run(() => duplicateQuestion(formId, question.id), t("question.duplicated"))}><CopyIcon />{t("actions.duplicate")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setMove(true)}><ArrowRightLeftIcon />{t("actions.move")}</DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}><Trash2Icon />{t("actions.delete")}</DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {WEBAPP_ONLY.has(type) && <p className="-mt-2 px-4 pb-2 text-xs text-muted-foreground">{t("question.webappOnly")}</p>}
      {showSettings && (
        <div className="border-t px-4 py-4"><QuestionSettings question={question} rubric={rubric} /></div>
      )}
      <Collapsible open={open} onOpenChange={setOpen} className="border-t">
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground [&[data-state=open]>svg]:rotate-180">
          <ChevronDownIcon className="size-4 transition-transform" />
          {type === "collaborator" ? t("question.signatories", { count: slots.length }) : t("question.options", { count: options.length })}
          <span className="ml-auto font-mono text-xs">
            {(type === "collaborator" ? slots : options).map((o) => { const p = idx.positionOf.get(o.id); return p ? coordLabel(p) : ""; }).join(" · ")}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3 px-4 pb-4">
          {type === "collaborator"
            ? slots.map((sl) => <SlotEditor key={sl.id} slot={sl} question={question} canDelete={slots.length > 1} />)
            : options.map((o, i) => (
              <div key={o.id} className="rounded-md border bg-background p-4">
                <OptionEditor option={o} question={question} rubric={rubric} title={t("option.title", { q: qPos, o: i + 1 })} />
                {editable && MULTI_OPTION.has(type) && (
                  <div className="mt-3 flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => run(() => duplicateOption(formId, o.id))}><CopyIcon data-icon="inline-start" />{t("actions.duplicate")}</Button>
                    <Button variant="ghost" size="sm" disabled={options.length <= 1} onClick={() => run(() => deleteOption(formId, o.id))}>
                      <Trash2Icon data-icon="inline-start" />{t("actions.delete")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          {editable && (MULTI_OPTION.has(type) || type === "collaborator") && (
            <div>
              <Button variant="outline" size="sm" onClick={() => run(() => addOption(formId, question.id))}>
                <PlusIcon data-icon="inline-start" />{type === "collaborator" ? t("question.actions.addContributor") : t("question.actions.addOption")}
              </Button>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={t("question.deleteTitle", { name: question.name })}
        description={t("noTrash")} confirmLabel={t("actions.delete")}
        onConfirm={async () => { await run(() => deleteQuestion(formId, question.id)); }} />
      {move && <MoveQuestionDialog question={question} onClose={() => setMove(false)} />}
      {mass && <MassParamsDialog question={question} rubric={rubric} onClose={() => setMass(false)} />}
    </section>
  );
}

/** Demande de collaborateur (signataire). */
export function SlotEditor({ slot, question, canDelete, title }: { slot: BSlot; question: BQuestion; canDelete: boolean; title?: string }) {
  const t = useTranslations("formBuilder");
  const { run, formId, editable, idx, copy } = useBuilder();
  const save = (patch: Parameters<typeof updateSlot>[2]) => run(() => updateSlot(formId, slot.id, patch));
  const pos = idx.positionOf.get(slot.id);
  void question;
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title ?? t("slot.title", { n: pos?.o ?? slot.position })}</span>
        <div className="flex items-center gap-1">
          {pos && <Button variant="ghost" size="xs" onClick={() => copy(coordLabel(pos))}><span className="font-mono">{coordLabel(pos)}</span><CopyIcon data-icon="inline-end" /></Button>}
          {editable && canDelete && (
            <Button variant="ghost" size="icon-sm" aria-label={t("actions.delete")} onClick={() => run(() => deleteSlot(formId, slot.id))}><Trash2Icon /></Button>
          )}
        </div>
      </div>
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <TextSetting label={t("slot.name")} value={slot.name} disabled={!editable} onSave={(v) => save({ name: v })} />
        <TextSetting label={t("slot.description")} value={slot.description} disabled={!editable} onSave={(v) => save({ description: v })} />
      </FieldGroup>
      <SwitchSetting label={t("slot.disableSignature")} checked={slot.disable_signature} disabled={!editable} onChange={(v) => save({ disable_signature: v })} />
      <ToggleSection label={t("option.pdf.title")} enabled={slot.pdf_field_name !== null} disabled={!editable}
        onToggle={(on) => save({ pdf_field_name: on ? (pos ? coordLabel(pos) : slot.id.slice(0, 8)) : null })}>
        <TextSetting label={t("option.pdf.name")} value={slot.pdf_field_name} required disabled={!editable} onSave={(v) => save({ pdf_field_name: v })} />
      </ToggleSection>
      <ToggleSection label={t("option.xls.title")} enabled={slot.xls_export} disabled={!editable} onToggle={(on) => save({ xls_export: on })}>
        <TextSetting label={t("option.xls.label")} value={slot.xls_label} disabled={!editable} onSave={(v) => save({ xls_label: v })} />
      </ToggleSection>
    </div>
  );
}

/** Dialogue « Déplacer la question » (vers une rubrique question, avant une question ou en dernière position). */
export function MoveQuestionDialog({ question, onClose }: { question: BQuestion; onClose: () => void }) {
  const t = useTranslations("formBuilder");
  const { s, idx, run, formId } = useBuilder();
  const targets = rubricsOf(s).filter((r) => r.type === "question");
  const [rubricId, setRubricId] = useState(question.rubric_id);
  const [before, setBefore] = useState("__last");
  const siblings = questionsOf(s, rubricId).filter((q) => q.id !== question.id);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("question.move.title")}</DialogTitle>
          <DialogDescription>{question.name}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <SelectSetting label={t("question.move.rubric")} value={rubricId}
            options={targets.map((r) => ({ value: r.id, label: `${idx.rubricPos.get(r.id)}. ${r.name}` }))}
            onChange={(v) => { setRubricId(v); setBefore("__last"); }} />
          <SelectSetting label={t("question.move.before")} value={before}
            options={[...siblings.map((q) => ({ value: q.id, label: `${idx.questionPos.get(q.id)}. ${q.name}` })), { value: "__last", label: t("question.move.last") }]}
            onChange={setBefore} />
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("actions.cancel")}</Button>
          <Button onClick={async () => {
            const res = await run(() => moveQuestion(formId, question.id, rubricId, before === "__last" ? null : before));
            if (res.ok) onClose();
          }}>{t("actions.move")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** « Paramétrage de la question/colonne/ligne en masse ». */
export function MassParamsDialog({ question, rubric, onClose }: { question: BQuestion; rubric: BRubric; onClose: () => void }) {
  const t = useTranslations("formBuilder");
  const { s, idx, run, formId } = useBuilder();
  const options = optionsOf(s, question.id);
  const [source, setSource] = useState(options[0]?.id ?? "");
  const kind = rubric.type === "question" ? "question" : rubric.type === "table_column" ? "column" : "row";
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`question.mass.title.${kind}`)}</DialogTitle>
          <DialogDescription>{t("question.mass.subtitle")}</DialogDescription>
        </DialogHeader>
        <SelectSetting label={t("question.mass.source")} value={source}
          options={options.map((o, i) => { const p = idx.positionOf.get(o.id); return { value: o.id, label: `${p ? coordLabel(p) : i + 1} ${o.option_name ?? o.name ?? ""}` }; })}
          onChange={setSource} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("actions.cancel")}</Button>
          <Button onClick={async () => {
            const res = await run(() => applyGenericParams(formId, question.id, source), t("question.mass.done"));
            if (res.ok) onClose();
          }}>{t("actions.apply")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
