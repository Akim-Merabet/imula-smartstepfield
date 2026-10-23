"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BracesIcon, CopyIcon, PlayIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toDisplay, validate } from "@/lib/formula/engine";
import type { Json } from "@/lib/supabase/database.types";
import {
  canFreeze, OPT_ALERT, OPT_CHOICES, OPT_DESCRIPTION, OPT_EXPORT_KEY, OPT_IMAGES, OPT_NAME, OPT_PDF_XLS, OPT_PHOTO_SIZE, OPT_PLACEHOLDER,
  OPT_PREFILL, OPT_REDIRECT, OPT_UNIT, OPT_VALIDATION, OPT_VALUE_HINT, PREFILL_TEXT, PREFILL_VARIABLE, SIZES, TWO_BOUNDS, validationOpsFor,
} from "../meta";
import type { AlertDef, PrefillDef, QuestionType, ValidationDef } from "../types";
import { updateOption } from "./actions";
import { useBuilder } from "./builder-context";
import { SelectSetting, SwitchSetting, TextSetting, ToggleSection, useSyncedState } from "./fields";
import { ImagesField } from "./images-field";
import { coordLabel, questionsOf, rubricsOf, type BOption, type BQuestion, type BRubric } from "./model";
import { useVariables, VariablesDialog } from "./variables-dialog";

type Patch = Parameters<typeof updateOption>[2];

const num = (v: string | undefined | null) => (v === undefined || v === null || v === "" ? null : Number(String(v).replace(",", ".")));

/** Contrôle d'une valeur de pré-remplissage contre une validation bloquante (spec 03 §3.5.1). */
function respectsValidation(v: ValidationDef, value: number | string): boolean {
  if (!v.block) return true;
  const cmpNum = typeof value === "number";
  const a = cmpNum ? num(v.min) : v.min ?? null;
  const b = cmpNum ? num(v.max) : v.max ?? null;
  if (a === null) return true;
  switch (v.op) {
    case "gt": return value > a;
    case "gte": return value >= a;
    case "lt": return value < a;
    case "lte": return value <= a;
    case "eq": return cmpNum ? value === a : String(value).slice(0, String(a).length) === a;
    case "neq": return cmpNum ? value !== a : String(value).slice(0, String(a).length) !== a;
    case "before": return value < a;
    case "after": return value > a;
    case "between": case "between_dates": return b === null || (value >= a && value <= b);
    case "not_between": case "not_between_dates": return b === null || value < a || value > b;
  }
  return true;
}

export function OptionEditor({ option, question, rubric, title }: { option: BOption; question: BQuestion; rubric: BRubric; title: string }) {
  const t = useTranslations("formBuilder.option");
  const { idx, run, formId, editable, locale, copy, data, s } = useBuilder();
  const type = question.type as QuestionType;
  const isTable = rubric.type !== "question";
  const pos = idx.positionOf.get(option.id);
  const coord = pos ? coordLabel(pos) : "";
  const save = (patch: Patch) => run(() => updateOption(formId, option.id, patch, locale));
  const disabled = !editable;
  const firstCell = isTable && questionsOf(s, rubric.id)[0]?.id === question.id;

  const validation = (option.validation ?? null) as ValidationDef | null;
  const alert = (option.alert ?? null) as AlertDef | null;
  const prefill = (option.prefill ?? null) as PrefillDef | null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        {coord && (
          <Button variant="ghost" size="xs" onClick={() => copy(coord)} aria-label={t("copyIdentifier")}>
            <span className="font-mono">{coord}</span><CopyIcon data-icon="inline-end" />
          </Button>
        )}
      </div>
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        {firstCell && (
          <TextSetting label={t("optionName")} description={t("optionNameInfo")} value={option.option_name}
            disabled={disabled} onSave={(v) => save({ option_name: v })} />
        )}
        {!isTable && (OPT_NAME.has(type)) && (
          <TextSetting label={t("name")} value={option.name} disabled={disabled} onSave={(v) => save({ name: v })} />
        )}
        {OPT_DESCRIPTION.has(type) && (
          <TextSetting label={t("description")} value={option.description} disabled={disabled} onSave={(v) => save({ description: v })} />
        )}
        {OPT_PLACEHOLDER.has(type) && (
          <TextSetting label={t("placeholder")} value={option.placeholder} disabled={disabled} onSave={(v) => save({ placeholder: v })} />
        )}
        {OPT_VALUE_HINT.has(type) && (
          <TextSetting label={t("valueHint")} value={option.value_hint} disabled={disabled} onSave={(v) => save({ value_hint: v })} />
        )}
        {OPT_UNIT.has(type) && (
          <TextSetting label={t("unit")} placeholder={t("unitPlaceholder")} value={option.unit} maxLength={20} disabled={disabled}
            onSave={(v) => save({ unit: v })} />
        )}
        {OPT_CHOICES.has(type) && (
          <TextSetting className="md:col-span-2" label={t("choices")} description={t("choicesInfo")} value={(option.choices ?? []).join("__")}
            disabled={disabled} onSave={(v) => save({ choices: v.split("__").map((x) => x.trim()).filter(Boolean) })} />
        )}
        {OPT_PHOTO_SIZE.has(type) && (
          <SelectSetting label={t("photoSize")} value={option.photo_size ?? "s"} disabled={disabled}
            options={SIZES.map((sz) => ({ value: sz, label: sz.toUpperCase() }))} onChange={(v) => save({ photo_size: v as never })} />
        )}
        <TextSetting label={t("code")} description={t("codeInfo")} value={option.code} disabled={disabled} onSave={(v) => save({ code: v })} />
      </FieldGroup>

      {type === "formula" && <FormulaField option={option} disabled={disabled} onSave={(f) => save({ formula: f })} />}

      <div className="flex flex-col gap-3">
        {canFreeze(type, rubric.type) && (
          <SwitchSetting label={isTable ? t("freezeCell") : t("freeze")} description={t("freezeInfo")} checked={option.frozen}
            disabled={disabled} onChange={(v) => save({ frozen: v })} />
        )}
        {OPT_PREFILL.has(type) && (
          <ToggleSection label={t("prefill.title")} enabled={!!prefill} disabled={disabled}
            onToggle={(on) => save({ prefill: on ? { mode: PREFILL_VARIABLE.has(type) && type === "photo" ? "dynamic" : "static", value: null } : null })}>
            <PrefillEditor type={type} prefill={prefill ?? { mode: "static" }} validation={validation} disabled={disabled}
              onSave={(p) => save({ prefill: p as never })} />
          </ToggleSection>
        )}
        {OPT_VALIDATION.has(type) && (
          <ToggleSection label={t("validation.title")} enabled={!!validation} disabled={disabled}
            onToggle={(on) => save({ validation: on ? { op: validationOpsFor(type)[0], block: false } : null })}>
            {validation && <ValidationEditor type={type} v={validation} disabled={disabled} onSave={(v) => save({ validation: v })} />}
          </ToggleSection>
        )}
        {OPT_ALERT.has(type) && (
          <ToggleSection label={t("alert.title")} enabled={!!alert} disabled={disabled}
            onToggle={(on) => save({ alert: on ? { type: "info", text: "" } : null })}>
            {alert && <AlertEditor a={alert} disabled={disabled} onSave={(a) => save({ alert: a })} />}
          </ToggleSection>
        )}
        {OPT_REDIRECT.has(type) && (
          <ToggleSection label={t("redirect.title")} enabled={!!option.redirect_rubric_id} disabled={disabled}
            onToggle={(on) => save({ redirect_rubric_id: on ? rubricsOf(s).find((r) => r.id !== rubric.id)?.id ?? rubric.id : null })}>
            <RedirectEditor option={option} disabled={disabled} onSave={save} />
          </ToggleSection>
        )}
        {OPT_EXPORT_KEY.has(type) && (
          <ToggleSection label={t("exportKey.title")} enabled={!!option.export_key} disabled={disabled || data.exportKeys.length === 0}
            description={data.exportKeys.length === 0 ? t("exportKey.empty") : undefined}
            onToggle={(on) => save({ export_key: on ? data.exportKeys[0]?.code ?? null : null })}>
            <SelectSetting label={t("exportKey.link")} value={option.export_key} disabled={disabled}
              options={data.exportKeys.map((k) => ({ value: k.code, label: k.label }))} onChange={(v) => save({ export_key: v })} />
          </ToggleSection>
        )}
        {OPT_PDF_XLS.has(type) && (
          <>
            <ToggleSection label={t("pdf.title")} enabled={option.pdf_field_name !== null} disabled={disabled}
              onToggle={(on) => save({ pdf_field_name: on ? (coord || option.id.slice(0, 8)) : null })}>
              <TextSetting label={t("pdf.name")} value={option.pdf_field_name} required disabled={disabled} onSave={(v) => save({ pdf_field_name: v })} />
            </ToggleSection>
            <ToggleSection label={t("xls.title")} enabled={option.xls_export} disabled={disabled} onToggle={(on) => save({ xls_export: on })}>
              <TextSetting label={t("xls.label")} value={option.xls_label} disabled={disabled} onSave={(v) => save({ xls_label: v })} />
            </ToggleSection>
          </>
        )}
        {OPT_IMAGES.has(type) && !isTable && <ImagesField ownerKind="option" ownerId={option.id} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Formule (validation en direct, debounce 500 ms)
// ---------------------------------------------------------------------------------------------
function FormulaField({ option, disabled, onSave }: { option: BOption; disabled: boolean; onSave: (f: string) => void }) {
  const t = useTranslations("formBuilder.option.formula");
  const { idx, locale } = useBuilder();
  const stored = toDisplay(option.formula ?? "", locale);
  const [draft, setDraft] = useState(stored);
  const [error, setError] = useState<string | null>(null);
  const [vars, setVars] = useState(false);
  const focused = useRef(false);
  const lastSaved = useRef(stored);
  useEffect(() => { if (!focused.current) { setDraft(stored); lastSaved.current = stored; } }, [stored]);
  const pos = idx.positionOf.get(option.id);

  useEffect(() => {
    if (draft === lastSaved.current) { setError(null); return; }
    const id = setTimeout(() => {
      const err = validate(draft, locale, { ctx: pos, exists: (p) => idx.lineageAt.has(`${p.r}.${p.q}.${p.o}`) });
      setError(err ? t(`errors.${err}`) : null);
      if (!err && !disabled) { lastSaved.current = draft; onSave(draft); }
    }, 500);
    return () => clearTimeout(id);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Field data-invalid={!!error || undefined}>
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor={`formula-${option.id}`}>{t("label")}</FieldLabel>
        <Button variant="ghost" size="xs" onClick={() => setVars(true)}><BracesIcon data-icon="inline-start" />{t("variables")}</Button>
      </div>
      <Textarea id={`formula-${option.id}`} className="font-mono" rows={2} value={draft} disabled={disabled} placeholder={t("placeholder")}
        aria-invalid={!!error || undefined}
        onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; }}
        onChange={(e) => setDraft(e.target.value)} />
      {error ? <FieldError>{error}</FieldError> : <FieldDescription>{t(locale === "fr" ? "noteFr" : "noteEn")}</FieldDescription>}
      <VariablesDialog open={vars} onOpenChange={setVars} />
    </Field>
  );
}

// ---------------------------------------------------------------------------------------------
// Pré-remplissage
// ---------------------------------------------------------------------------------------------
function PrefillEditor({ type, prefill, validation, disabled, onSave }: {
  type: QuestionType; prefill: PrefillDef; validation: ValidationDef | null; disabled: boolean; onSave: (p: PrefillDef) => void;
}) {
  const t = useTranslations("formBuilder.option.prefill");
  const tr = useTranslations("formBuilder.option");
  const variables = useVariables();
  const [vars, setVars] = useState(false);
  const value = prefill.value as Record<string, unknown> | string | number | boolean | null | undefined;

  const guarded = (p: PrefillDef, check?: number | string | null) => {
    if (validation && check !== null && check !== undefined && check !== "" && !respectsValidation(validation, check)) {
      notify.error(t("validationError"));
      return;
    }
    onSave(p);
  };

  const varButton = (
    <Button variant="ghost" size="xs" onClick={() => setVars(true)}><BracesIcon data-icon="inline-start" />{t("details")}</Button>
  );

  if (PREFILL_TEXT.has(type)) {
    return (
      <>
        <VariableTextarea value={typeof value === "string" ? value : ""} disabled={disabled} multiline={type === "long_answer"}
          onSave={(v) => onSave({ mode: "static", value: v })} />
        <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{t("textInfo")}</span>{varButton}</div>
        <VariablesDialog open={vars} onOpenChange={setVars} />
      </>
    );
  }

  const dynamic = prefill.mode === "dynamic";
  return (
    <>
      {PREFILL_VARIABLE.has(type) && (
        <Field orientation="horizontal">
          <Checkbox id={`pv-${type}`} checked={dynamic} disabled={disabled || type === "photo"}
            onCheckedChange={(c) => onSave(c ? { mode: "dynamic", variable: variables[0]?.token } : { mode: "static", value: null })} />
          <FieldLabel htmlFor={`pv-${type}`} className="font-normal">{t("withVariable")}</FieldLabel>
        </Field>
      )}
      {dynamic ? (
        <div className="flex items-end gap-2">
          <SelectSetting className="flex-1" label={t("variable")} value={prefill.variable} disabled={disabled}
            options={variables.map((v) => ({ value: v.token, label: `${v.token} — ${v.label}` }))}
            onChange={(v) => onSave({ mode: "dynamic", variable: v })} />
          {varButton}
        </div>
      ) : (
        <StaticPrefill type={type} value={value} disabled={disabled} onSave={(v, check) => guarded({ mode: "static", value: v as Json }, check)} />
      )}
      {type === "photo" && <FieldDescription>{t("photoInfo")}</FieldDescription>}
      <VariablesDialog open={vars} onOpenChange={setVars} />
      <span className="sr-only">{tr("prefill.title")}</span>
    </>
  );
}

function StaticPrefill({ type, value, disabled, onSave }: {
  type: QuestionType; value: unknown; disabled: boolean; onSave: (v: unknown, check?: number | string | null) => void;
}) {
  const t = useTranslations("formBuilder.option.prefill");
  const obj = (value && typeof value === "object" ? value : {}) as Record<string, number | null | undefined>;
  switch (type) {
    case "multiple_choices":
      return <SwitchSetting label={t("checked")} checked={value === true} disabled={disabled} onChange={(v) => onSave(v)} />;
    case "date":
      return <InputSave type="date" label={t("value")} value={typeof value === "string" ? value : ""} disabled={disabled}
        onSave={(v) => onSave(v || null, v)} />;
    case "datetime":
      return <InputSave type="datetime-local" label={t("value")} value={typeof value === "string" ? value.slice(0, 16) : ""} disabled={disabled}
        onSave={(v) => onSave(v || null, v)} />;
    case "duration":
      return (
        <div className="grid grid-cols-2 gap-3">
          <InputSave type="number" label={t("hours")} value={obj.hours?.toString() ?? ""} disabled={disabled}
            onSave={(v) => onSave({ hours: Number(v) || 0, minutes: obj.minutes ?? 0 })} />
          <InputSave type="number" label={t("minutes")} value={obj.minutes?.toString() ?? ""} disabled={disabled}
            onSave={(v) => onSave({ hours: obj.hours ?? 0, minutes: Math.min(59, Number(v) || 0) })} />
        </div>
      );
    case "value_unit":
      return <InputSave label={t("value")} value={obj.value?.toString() ?? ""} disabled={disabled}
        onSave={(v) => { const n = num(v); onSave(n === null || Number.isNaN(n) ? null : { value: n }, n); }} />;
    case "location":
      return (
        <div className="grid grid-cols-3 gap-3">
          {(["lat", "lng", "alt"] as const).map((k) => (
            <InputSave key={k} label={t(k)} value={obj[k]?.toString() ?? ""} disabled={disabled}
              onSave={(v) => onSave({ ...obj, [k]: num(v) })} />
          ))}
        </div>
      );
    case "text_editor":
      return <InputSave multiline label={t("value")} value={typeof value === "string" ? value : ""} disabled={disabled} onSave={(v) => onSave(v || null)} />;
    default:
      return null;
  }
}

function InputSave({ label, value, onSave, disabled, type = "text", multiline }: {
  label: string; value: string; onSave: (v: string) => void; disabled?: boolean; type?: string; multiline?: boolean;
}) {
  const [draft, setDraft] = useSyncedState(value);
  const commit = () => { if (draft !== value) onSave(draft); };
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      {multiline
        ? <Textarea value={draft} disabled={disabled} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
        : <Input type={type} value={draft} disabled={disabled} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />}
    </Field>
  );
}

/** Zone texte avec auto-complétion des variables après « @@ ». */
function VariableTextarea({ value, onSave, disabled, multiline }: { value: string; onSave: (v: string) => void; disabled?: boolean; multiline?: boolean }) {
  const t = useTranslations("formBuilder.option.prefill");
  const variables = useVariables();
  const [draft, setDraft] = useSyncedState(value);
  const [query, setQuery] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const matches = useMemo(() => query === null ? [] : variables.filter((v) =>
    v.token.toLowerCase().includes(query.toLowerCase()) || v.label.toLowerCase().includes(query.toLowerCase())).slice(0, 8), [query, variables]);

  const onChange = (text: string) => {
    setDraft(text);
    const caret = ref.current?.selectionStart ?? text.length;
    const m = /@@(\w*)$/.exec(text.slice(0, caret));
    setQuery(m ? m[1] : null);
  };
  const insert = (token: string) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret).replace(/@@\w*$/, token);
    const next = before + draft.slice(caret);
    setDraft(next);
    setQuery(null);
    onSave(next);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  };
  return (
    <div className="relative">
      <Textarea ref={ref} value={draft} disabled={disabled} rows={multiline ? 4 : 2} placeholder={t("textPlaceholder")}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTimeout(() => { setQuery(null); if (draft !== value) onSave(draft); }, 150)} />
      {matches.length > 0 && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full max-w-md rounded-md border bg-popover p-1 shadow-md">
          {matches.map((v) => (
            <button key={v.token} type="button" className="flex w-full flex-col items-start rounded px-2 py-1 text-left text-sm hover:bg-accent"
              onMouseDown={(e) => { e.preventDefault(); insert(v.token); }}>
              <span className="font-mono text-xs">{v.token}</span>
              <span className="text-xs text-muted-foreground">{v.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Validation des données / alerte / redirection
// ---------------------------------------------------------------------------------------------
function ValidationEditor({ type, v, disabled, onSave }: { type: QuestionType; v: ValidationDef; disabled: boolean; onSave: (v: ValidationDef) => void }) {
  const t = useTranslations("formBuilder.option.validation");
  const { locale } = useBuilder();
  const isDate = type === "date" || type === "datetime";
  const inputType = type === "date" ? "date" : type === "datetime" ? "datetime-local" : "text";
  const set = (patch: Partial<ValidationDef>) => onSave({ ...v, ...patch });
  const norm = (x: string) => (isDate || locale === "en" ? x.replace(/,/g, "") : x.replace(",", "."));
  const show = (x: string | undefined) => (x ? (isDate || locale === "en" ? x : x.replace(".", ",")) : "");
  return (
    <>
      <SelectSetting label={t("operator")} value={v.op} disabled={disabled}
        options={validationOpsFor(type).map((op) => ({ value: op, label: t(`ops.${op}`) }))} onChange={(op) => set({ op: op as ValidationDef["op"] })} />
      <div className="grid grid-cols-2 gap-3">
        <InputSave type={inputType} label={TWO_BOUNDS.has(v.op) ? t("min") : t("value")} value={show(v.min)} disabled={disabled} onSave={(x) => set({ min: norm(x) })} />
        {TWO_BOUNDS.has(v.op) && <InputSave type={inputType} label={t("max")} value={show(v.max)} disabled={disabled} onSave={(x) => set({ max: norm(x) })} />}
      </div>
      {!isDate && <FieldDescription>{t(locale === "fr" ? "decimalInfoFr" : "decimalInfoEn")}</FieldDescription>}
      <TextSetting label={t("message")} placeholder={t("defaultMessage")} value={v.message} disabled={disabled} onSave={(m) => set({ message: m || undefined })} />
      <SwitchSetting label={t("block")} checked={v.block} disabled={disabled} onChange={(b) => set({ block: b })} />
      {v.min && <FieldDescription>{t(`info.${TWO_BOUNDS.has(v.op) ? "between" : "single"}`, { op: t(`ops.${v.op}`), min: show(v.min), max: show(v.max) })}</FieldDescription>}
    </>
  );
}

function AlertEditor({ a, disabled, onSave }: { a: AlertDef; disabled: boolean; onSave: (a: AlertDef) => void }) {
  const t = useTranslations("formBuilder.option.alert");
  const preview = () => {
    const fn = a.type === "error" ? notify.error : a.type === "warning" ? notify.warning : notify.info;
    fn(t(`types.${a.type}`), a.text || undefined);
  };
  return (
    <>
      <SelectSetting label={t("type")} value={a.type} disabled={disabled}
        options={(["error", "warning", "info", "trace"] as const).map((x) => ({ value: x, label: t(`types.${x}`) }))}
        onChange={(x) => onSave({ ...a, type: x as AlertDef["type"] })} />
      <TextSetting label={t("text")} multiline value={a.text} disabled={disabled} onSave={(x) => onSave({ ...a, text: x })} />
      <div><Button variant="outline" size="sm" onClick={preview}><PlayIcon data-icon="inline-start" />{t("preview")}</Button></div>
    </>
  );
}

function RedirectEditor({ option, disabled, onSave }: { option: BOption; disabled: boolean; onSave: (p: Patch) => void }) {
  const t = useTranslations("formBuilder.option.redirect");
  const { s, idx } = useBuilder();
  const rubrics = rubricsOf(s);
  const questions = option.redirect_rubric_id ? questionsOf(s, option.redirect_rubric_id) : [];
  return (
    <>
      <p className="text-sm text-muted-foreground">{t("info")}</p>
      <SelectSetting label={t("rubric")} value={option.redirect_rubric_id} disabled={disabled}
        options={rubrics.map((r) => ({ value: r.id, label: `${idx.rubricPos.get(r.id)}. ${r.name}` }))}
        onChange={(v) => onSave({ redirect_rubric_id: v, redirect_question_id: null })} />
      <SelectSetting label={t("question")} value={option.redirect_question_id ?? "__none"} disabled={disabled}
        options={[{ value: "__none", label: t("none") }, ...questions.map((q) => ({ value: q.id, label: `${idx.questionPos.get(q.id)}. ${q.name}` }))]}
        onChange={(v) => onSave({ redirect_question_id: v === "__none" ? null : v })} />
    </>
  );
}
