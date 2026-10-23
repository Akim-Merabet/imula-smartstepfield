"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRightLeftIcon, ChevronDownIcon, CopyIcon, EllipsisVerticalIcon, PlusIcon, Table2Icon, TableIcon, Trash2Icon, ListIcon,
} from "lucide-react";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { AddObjectAttributeButton } from "@/features/library/form-attributes/add-attribute-dialog";
import { SIZES } from "../meta";
import type { RubricType } from "../types";
import { addQuestion, addRubric, deleteRubric, duplicateRubric, reorderRubrics, updateRubric } from "./actions";
import { useBuilder } from "./builder-context";
import { SelectSetting, SwitchSetting, TextSetting } from "./fields";
import { ImagesField } from "./images-field";
import { questionsOf, rubricsOf, type BRubric } from "./model";
import { QuestionCard } from "./question-editor";
import { TableEditor } from "./table-editor";

export const RUBRIC_ICONS: Record<RubricType, typeof ListIcon> = { question: ListIcon, table_column: TableIcon, table_row: Table2Icon };

export function AddRubricMenu({ after, onCreated, trigger }: { after?: string | null; onCreated: (id: string) => void; trigger: React.ReactNode }) {
  const t = useTranslations("formBuilder.rubric");
  const { run, formId } = useBuilder();
  const add = async (type: RubricType) => {
    const res = await run(() => addRubric(formId, type, after));
    if (res.ok) onCreated(res.data.id);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          {(["question", "table_column", "table_row"] as const).map((ty) => {
            const Icon = RUBRIC_ICONS[ty];
            return <DropdownMenuItem key={ty} onSelect={() => add(ty)}><Icon />{t(`add.${ty}`)}</DropdownMenuItem>;
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RubricEditor({ rubric, onSelect }: { rubric: BRubric; onSelect: (id: string | null) => void }) {
  const t = useTranslations("formBuilder");
  const { s, idx, run, formId, editable } = useBuilder();
  const [settings, setSettings] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [move, setMove] = useState(false);
  const save = (patch: Parameters<typeof updateRubric>[2]) => run(() => updateRubric(formId, rubric.id, patch));
  const questions = questionsOf(s, rubric.id);
  const isTable = rubric.type !== "question";
  const Icon = RUBRIC_ICONS[rubric.type];
  const allShort = rubric.type === "table_column" && questions.every((q) => q.type === "short_answer");
  const disabled = !editable;
  const nameKind = rubric.type === "question" ? "question" : rubric.type === "table_column" ? "tableColumn" : "tableRow";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <section className="rounded-lg border bg-card shadow-xs">
        <header className="flex flex-wrap items-center gap-3 p-4">
          <Icon className="size-5 text-primary" />
          <Badge variant="secondary">{t("rubric.number", { n: idx.rubricPos.get(rubric.id) ?? rubric.position })}</Badge>
          <TextSetting className="min-w-60 flex-1" value={rubric.name} required disabled={disabled} inputClassName="text-base font-medium"
            onSave={(v) => save({ name: v })} />
          <Badge variant="outline">{t(`rubric.types.${rubric.type}`)}</Badge>
          {rubric.hidden_in_mobile && <Badge variant="outline">{t("rubric.hiddenInMobileBadge")}</Badge>}
          {editable && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t("actions.more")}><EllipsisVerticalIcon /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("rubric.addAfter")}</DropdownMenuLabel>
                <DropdownMenuGroup>
                  {(["question", "table_column", "table_row"] as const).map((ty) => {
                    const I = RUBRIC_ICONS[ty];
                    return (
                      <DropdownMenuItem key={ty} onSelect={async () => {
                        const res = await run(() => addRubric(formId, ty, rubric.id));
                        if (res.ok) onSelect(res.data.id);
                      }}><I />{t(`rubric.add.${ty}`)}</DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={async () => {
                    const res = await run(() => duplicateRubric(formId, rubric.id), t("rubric.duplicated"));
                    if (res.ok) onSelect(res.data.id);
                  }}><CopyIcon />{t("actions.duplicate")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setMove(true)}><ArrowRightLeftIcon />{t("actions.move")}</DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}><Trash2Icon />{t("actions.delete")}</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>
        {rubric.description && !settings && <p className="-mt-2 px-4 pb-3 text-sm text-muted-foreground">{rubric.description}</p>}
        <Collapsible open={settings} onOpenChange={setSettings} className="border-t">
          <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground [&[data-state=open]>svg]:rotate-180">
            <ChevronDownIcon className="size-4 transition-transform" />{t("rubric.settings")}
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-4 px-4 pb-4">
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <TextSetting label={t(`rubric.name.${nameKind}`)} value={rubric.name} required disabled={disabled} onSave={(v) => save({ name: v })} />
              <TextSetting label={t("rubric.description")} description={t("rubric.descriptionMax")} maxLength={255} multiline
                value={rubric.description} disabled={disabled} onSave={(v) => save({ description: v })} />
              <TextSetting label={t("rubric.additionalComment")} multiline value={rubric.additional_comment} disabled={disabled}
                onSave={(v) => save({ additional_comment: v })} />
              <TextSetting label={t("rubric.additionalObservation")} multiline value={rubric.additional_observation} disabled={disabled}
                onSave={(v) => save({ additional_observation: v })} />
              <SelectSetting label={t("rubric.pdfFormat")} value={rubric.pdf_landscape ? "landscape" : "portrait"} disabled={disabled}
                options={[{ value: "portrait", label: t("rubric.portrait") }, { value: "landscape", label: t("rubric.landscape") }]}
                onChange={(v) => save({ pdf_landscape: v === "landscape" })} />
              <div className="grid grid-cols-2 gap-3">
                <SelectSetting label={t("rubric.attachmentWidth")} value={rubric.attachment_width ?? "__none"} disabled={disabled}
                  options={[{ value: "__none", label: "—" }, ...SIZES.map((sz) => ({ value: sz, label: sz.toUpperCase() }))]}
                  onChange={(v) => save({ attachment_width: v === "__none" ? null : (v as never) })} />
                <SelectSetting label={t("rubric.attachmentHeight")} value={rubric.attachment_height ?? "__none"} disabled={disabled}
                  options={[{ value: "__none", label: "—" }, ...SIZES.map((sz) => ({ value: sz, label: sz.toUpperCase() }))]}
                  onChange={(v) => save({ attachment_height: v === "__none" ? null : (v as never) })} />
              </div>
            </FieldGroup>
            <div className="grid gap-3 md:grid-cols-2">
              <SwitchSetting label={t("rubric.hiddenInMobile")} checked={rubric.hidden_in_mobile} disabled={disabled} onChange={(v) => save({ hidden_in_mobile: v })} />
              <SwitchSetting label={t("rubric.hideInPdf")} checked={rubric.hide_in_pdf} disabled={disabled} onChange={(v) => save({ hide_in_pdf: v })} />
              <SwitchSetting label={t("rubric.exportImagesInAppendix")} checked={rubric.export_images_in_appendix} disabled={disabled}
                onChange={(v) => save({ export_images_in_appendix: v })} />
              {isTable && (
                <>
                  <SwitchSetting label={t("rubric.allowAddRow")} checked={rubric.allow_add_row} disabled={disabled} onChange={(v) => save({ allow_add_row: v })} />
                  <SwitchSetting label={t("rubric.allowAddColumn")} checked={rubric.allow_add_column} disabled={disabled} onChange={(v) => save({ allow_add_column: v })} />
                  <SwitchSetting label={t("rubric.firstColumnHidden")} checked={rubric.first_column_hidden} disabled={disabled}
                    onChange={(v) => save({ first_column_hidden: v })} />
                </>
              )}
              {rubric.type === "table_column" && (
                <SwitchSetting label={t("rubric.importXlsx")} description={t("rubric.importXlsxInfo")} checked={rubric.import_xlsx_enabled}
                  disabled={disabled || (!allShort && !rubric.import_xlsx_enabled)} onChange={(v) => save({ import_xlsx_enabled: v })} />
              )}
            </div>
            <ImagesField ownerKind="rubric" ownerId={rubric.id} />
          </CollapsibleContent>
        </Collapsible>
      </section>

      {isTable ? <TableEditor rubric={rubric} /> : (
        <>
          {questions.map((q) => <QuestionCard key={q.id} question={q} rubric={rubric} />)}
          {editable && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => run(() => addQuestion(formId, rubric.id, null))}>
                <PlusIcon data-icon="inline-start" />{t("question.add")}
              </Button>
              <AddObjectAttributeButton rubricId={rubric.id} />
            </div>
          )}
        </>
      )}

      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={t("rubric.deleteTitle", { name: rubric.name })}
        description={t("noTrash")} confirmLabel={t("actions.delete")}
        onConfirm={async () => {
          const list = rubricsOf(s);
          const i = list.findIndex((r) => r.id === rubric.id);
          const res = await run(() => deleteRubric(formId, rubric.id));
          if (res.ok) onSelect(list[i + 1]?.id ?? list[i - 1]?.id ?? null);
        }} />
      {move && <MoveRubricDialog rubric={rubric} onClose={() => setMove(false)} />}
    </div>
  );
}

/** « Déplacer la rubrique » — positionnée avant une rubrique ou en dernière position. */
function MoveRubricDialog({ rubric, onClose }: { rubric: BRubric; onClose: () => void }) {
  const t = useTranslations("formBuilder");
  const { s, idx, run, formId } = useBuilder();
  const others = rubricsOf(s).filter((r) => r.id !== rubric.id);
  const [before, setBefore] = useState("__last");
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rubric.move.title")}</DialogTitle>
          <DialogDescription>{rubric.name}</DialogDescription>
        </DialogHeader>
        <SelectSetting label={t("rubric.move.before")} value={before}
          options={[...others.map((r) => ({ value: r.id, label: `${idx.rubricPos.get(r.id)}. ${r.name}` })), { value: "__last", label: t("rubric.move.last") }]}
          onChange={setBefore} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("actions.cancel")}</Button>
          <Button onClick={async () => {
            const ids = others.map((r) => r.id);
            const i = before === "__last" ? ids.length : ids.indexOf(before);
            ids.splice(i, 0, rubric.id);
            const res = await run(() => reorderRubrics(formId, ids));
            if (res.ok) onClose();
          }}>{t("actions.move")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
