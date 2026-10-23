"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { BoldIcon, CalculatorIcon, ChevronDownIcon, ItalicIcon, ListIcon, ListOrderedIcon, LocateFixedIcon, XIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { coerceValue, formatResult } from "@/lib/formula/engine";
import { cn } from "@/lib/utils";
import { OPT_ALERT } from "../../meta";
import type { FileRef, SignatureValue } from "../../types";
import type { RtCell, RtQuestion, RtRubric } from "../engine/model";
import { checkValidation, inputBounds, isBackdated, isFilled, toInputDate } from "../engine/values";
import { useResponse } from "./context";
import { FileField } from "./file-field";
import { SignatureSlot } from "./signature-slot";

function RichText({ value, onChange, disabled }: { value: string | null; onChange: (v: string | null) => void; disabled: boolean }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value ?? "",
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? null : e.getHTML()),
  });
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
  const btn = (active: boolean, run: () => void, Icon: typeof BoldIcon) => (
    <Button type="button" variant={active ? "secondary" : "ghost"} size="icon-sm" disabled={disabled} onClick={run}><Icon /></Button>
  );
  return (
    <div className="rounded-md border">
      {!disabled && editor && (
        <div className="flex gap-1 border-b p-1">
          {btn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), BoldIcon)}
          {btn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), ItalicIcon)}
          {btn(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), ListIcon)}
          {btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), ListOrderedIcon)}
        </div>
      )}
      <EditorContent editor={editor} className="prose prose-sm max-w-none px-3 py-2 [&_.ProseMirror]:min-h-24 [&_.ProseMirror]:outline-none" />
    </div>
  );
}

/** Champ numérique localisé (virgule FR / point EN), valeur propagée au blur. */
function DecimalInput({ value, onChange, disabled, placeholder, min, max, className }: {
  value: number | null | undefined; onChange: (v: number | null) => void; disabled: boolean; placeholder?: string;
  min?: string; max?: string; className?: string;
}) {
  const { locale } = useResponse();
  const t = useTranslations("responses.validation");
  const show = (n: number | null | undefined) => (n === null || n === undefined ? "" : locale === "fr" ? String(n).replace(".", ",") : String(n));
  const [draft, setDraft] = useState(show(value));
  useEffect(() => setDraft(show(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    if (!draft.trim()) { onChange(null); return; }
    const n = coerceValue(draft, locale);
    if (typeof n !== "number") { notify.error(t("notANumber")); setDraft(show(value)); return; }
    const lo = min !== undefined ? Number(min) : undefined;
    const hi = max !== undefined ? Number(max) : undefined;
    if ((lo !== undefined && n < lo) || (hi !== undefined && n > hi)) {
      notify.error(t("outOfBounds", { min: min ?? "—", max: max ?? "—" }));
      setDraft(show(value));
      return;
    }
    onChange(n);
  };
  return (
    <Input inputMode="decimal" value={draft} disabled={disabled} placeholder={placeholder} className={className}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} />
  );
}

/** Saisie d'une cellule (option / slot / item dynamique) selon la nature de la question. */
export function CellInput({ rubric, question, cell, compact, label }: {
  rubric: RtRubric; question: RtQuestion; cell: RtCell; compact?: boolean; label?: string;
}) {
  const t = useTranslations("responses");
  const ctx = useResponse();
  const { values, setValue, setExclusive, rubricReadOnly, isQuestionLocked, createdAt, locale, responseId } = ctx;
  const value = values[cell.lineageId]?.value ?? null;
  const frozen = !!cell.opt?.frozen;
  const disabled = rubricReadOnly || frozen || isQuestionLocked(question);
  const set = (v: unknown) => setValue(cell.lineageId, v);
  const type = question.type;
  const opt = cell.opt;
  const filled = isFilled(type, value, cell);

  // Alerte : toast une seule fois par affichage quand l'option est renseignée (et non figée).
  const alerted = useRef(false);
  useEffect(() => {
    if (!opt?.alert || frozen || !OPT_ALERT.has(type) || !filled || alerted.current) return;
    alerted.current = true;
    const fn = { error: notify.error, warning: notify.warning, info: notify.info, trace: notify.info }[opt.alert.type] ?? notify.info;
    fn(opt.alert.text);
  }, [filled, opt?.alert, frozen, type]);

  const bounds = inputBounds(type, opt?.validation, createdAt, question.def.allowBackdating);
  const backdated = isBackdated(type, value, question.def.allowBackdating, createdAt);
  const nonConform = filled && opt?.validation && !checkValidation(type, value, opt.validation);
  const validationMessage = opt?.validation?.message || t("validation.defaultText");

  let input: React.ReactNode;
  switch (type) {
    case "short_answer":
    case "multiple_answers":
      input = <Input value={(value as string) ?? ""} disabled={disabled} placeholder={opt?.placeholder}
        onChange={(e) => set(e.target.value || null)} />;
      break;
    case "long_answer":
      input = <Textarea value={(value as string) ?? ""} disabled={disabled} placeholder={opt?.placeholder}
        onChange={(e) => set(e.target.value || null)} rows={compact ? 2 : 4} />;
      break;
    case "unique_choice":
    case "multiple_choices":
      input = (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={value === true} disabled={disabled}
            className={type === "unique_choice" ? "rounded-full" : undefined}
            onCheckedChange={(v) => (type === "unique_choice" ? setExclusive(question, cell.lineageId, !!v) : set(v ? true : null))} />
          {label && <span>{label}</span>}
        </label>
      );
      break;
    case "single_choice_list":
      input = (
        <div className="flex items-center gap-1">
          <Select value={(value as string) || undefined} disabled={disabled} onValueChange={(v) => set(v)}>
            <SelectTrigger className="min-w-40"><SelectValue placeholder={t("fields.choose")} /></SelectTrigger>
            <SelectContent>
              <SelectGroup>{(opt?.choices ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectGroup>
            </SelectContent>
          </Select>
          {!disabled && value !== null && <Button variant="ghost" size="icon-sm" aria-label={t("fields.clear")} onClick={() => set(null)}><XIcon /></Button>}
        </div>
      );
      break;
    case "multiple_choice_list": {
      const list = (value as string[]) ?? [];
      input = (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" disabled={disabled} className="min-w-40 justify-between font-normal">
              <span className="truncate">{list.length ? list.join(", ") : t("fields.choose")}</span>
              <ChevronDownIcon data-icon="inline-end" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="flex w-64 flex-col gap-2" align="start">
            {(opt?.choices ?? []).map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <Checkbox checked={list.includes(c)} onCheckedChange={(v) => {
                  const next = v ? [...list, c] : list.filter((x) => x !== c);
                  set(next.length ? (opt?.choices ?? []).filter((x) => next.includes(x)) : null);
                }} />
                {c}
              </label>
            ))}
          </PopoverContent>
        </Popover>
      );
      break;
    }
    case "date":
      input = <Input type="date" value={(value as string)?.slice(0, 10) ?? ""} min={bounds.min} max={bounds.max} disabled={disabled}
        className="w-44" onChange={(e) => set(e.target.value || null)} />;
      break;
    case "datetime":
      input = <Input type="datetime-local" value={value ? toInputDate("datetime", new Date(value as string)) : ""} min={bounds.min}
        max={bounds.max} disabled={disabled} className="w-56"
        onChange={(e) => set(e.target.value ? new Date(e.target.value).toISOString() : null)} />;
      break;
    case "duration": {
      const d = (value as { hours: number | null; minutes: number | null }) ?? { hours: null, minutes: null };
      const upd = (k: "hours" | "minutes", raw: string) => {
        const n = raw === "" ? null : Math.max(0, Math.floor(Number(raw)));
        const next = { ...d, [k]: k === "minutes" && n !== null ? Math.min(n, 59) : n };
        set(next.hours === null && next.minutes === null ? null : next);
      };
      input = (
        <div className="flex items-center gap-2 text-sm">
          <Input type="number" min={0} className="w-20" value={d.hours ?? ""} disabled={disabled} onChange={(e) => upd("hours", e.target.value)} />
          <span>{t("fields.hours")}</span>
          <Input type="number" min={0} max={59} className="w-20" value={d.minutes ?? ""} disabled={disabled} onChange={(e) => upd("minutes", e.target.value)} />
          <span>{t("fields.minutes")}</span>
        </div>
      );
      break;
    }
    case "value_unit": {
      const v = value as { value: number | null; unit?: string } | null;
      input = (
        <div className="flex items-center gap-2">
          <DecimalInput value={v?.value} disabled={disabled} placeholder={opt?.valueHint} min={bounds.min} max={bounds.max}
            className="w-36" onChange={(n) => set(n === null ? null : { value: n, unit: opt?.unit })} />
          {opt?.unit && <span className="text-sm text-muted-foreground">{opt.unit}</span>}
        </div>
      );
      break;
    }
    case "location": {
      const c = (value as { lat?: number | null; lng?: number | null; alt?: number | null }) ?? {};
      const upd = (k: "lat" | "lng" | "alt", n: number | null) => {
        const next = { ...c, [k]: n };
        set(next.lat == null && next.lng == null && next.alt == null ? null : next);
      };
      const locate = () => {
        if (!navigator.geolocation) { notify.error(t("fields.geolocUnavailable")); return; }
        navigator.geolocation.getCurrentPosition(
          (p) => set({ lat: p.coords.latitude, lng: p.coords.longitude, alt: p.coords.altitude ?? undefined }),
          () => notify.error(t("fields.geolocFail")),
        );
      };
      input = (
        <div className={cn("flex flex-wrap items-center gap-2", compact && "gap-1")}>
          {(["lat", "lng", "alt"] as const).map((k) => (
            <div key={k} className="flex items-center gap-1 text-sm">
              <span className="text-muted-foreground">{t(`fields.${k}`)}</span>
              <DecimalInput value={c[k]} disabled={disabled} className="w-28" onChange={(n) => upd(k, n)} />
            </div>
          ))}
          {!disabled && <Button variant="outline" size="sm" onClick={locate}><LocateFixedIcon data-icon="inline-start" />{t("fields.locate")}</Button>}
        </div>
      );
      break;
    }
    case "formula": {
      const r = (value as { result?: number | boolean | string } | null)?.result;
      input = (
        <div className="flex items-center gap-2">
          <div className="flex h-9 min-w-36 items-center rounded-md border bg-muted px-3 text-sm">
            {r === undefined || r === null ? <span className="text-muted-foreground">{t("fields.notCalculated")}</span>
              : formatResult(r, locale, { true: t("fields.true"), false: t("fields.false") })}
            {opt?.unit && r !== undefined && r !== null && <span className="ml-1 text-muted-foreground">{opt.unit}</span>}
          </div>
          {!disabled && (
            <Button variant="outline" size="sm" onClick={() => ctx.calculate(rubric, question, cell)}>
              <CalculatorIcon data-icon="inline-start" />{t("fields.calculate")}
            </Button>
          )}
        </div>
      );
      break;
    }
    case "photo":
    case "file":
      input = <FileField kind={type} value={value as FileRef[] | null} onChange={set} disabled={disabled} responseId={responseId} compact={compact} />;
      break;
    case "text_editor":
      input = <RichText value={value as string | null} onChange={set} disabled={disabled} />;
      break;
    case "collaborator":
      input = cell.slot ? <SignatureSlot slot={cell.slot} value={value as SignatureValue | null} onChange={set} disabled={disabled} /> : null;
      break;
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {label && type !== "unique_choice" && type !== "multiple_choices" && <span className="text-sm">{label}</span>}
      {opt?.description && !compact && <span className="text-xs text-muted-foreground">{opt.description}</span>}
      {input}
      {backdated && <span className="text-xs text-destructive">{t("validation.backdating")}</span>}
      {!backdated && nonConform && (
        <span className={cn("text-xs", opt?.validation?.block ? "text-destructive" : "text-warning")}>{validationMessage}</span>
      )}
      {opt?.validation && !compact && !nonConform && filled === false && (
        <span className="text-xs text-muted-foreground">{validationHint(t, opt.validation)}</span>
      )}
    </div>
  );
}

function validationHint(t: ReturnType<typeof useTranslations>, v: NonNullable<RtCell["opt"]>["validation"]) {
  if (!v) return null;
  return t(`validation.expected.${v.op}`, { min: v.min ?? "", max: v.max ?? "" });
}
