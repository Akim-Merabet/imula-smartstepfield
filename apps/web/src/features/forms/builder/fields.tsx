"use client";

import { useId, useState, type ReactNode } from "react";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Champ texte sauvegardé à la perte de focus (sauvegarde fine par élément). */
export function TextSetting({ label, value, onSave, multiline, maxLength, placeholder, disabled, description, error, className, required, inputClassName }: {
  label?: string; value: string | null | undefined; onSave: (v: string) => void; multiline?: boolean; maxLength?: number;
  placeholder?: string; disabled?: boolean; description?: ReactNode; error?: string | null; className?: string; required?: boolean;
  inputClassName?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  const [prev, setPrev] = useState(value);
  if (!focused && prev !== value) { setPrev(value); setDraft(value ?? ""); }
  const commit = () => {
    setFocused(false);
    const next = draft;
    if (required && !next.trim()) { setDraft(value ?? ""); return; }
    if (next !== (value ?? "")) onSave(next);
  };
  const common = {
    id, value: draft, disabled, placeholder, maxLength,
    "aria-invalid": !!error || undefined,
    onFocus: () => setFocused(true),
    onBlur: commit,
  };
  return (
    <Field data-invalid={!!error || undefined} className={className}>
      {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      {multiline
        ? <Textarea {...common} className={inputClassName} rows={2} onChange={(e) => setDraft(e.target.value)} />
        : <Input {...common} className={inputClassName} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />}
      {description && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

export function SwitchSetting({ label, checked, onChange, disabled, description }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; description?: ReactNode;
}) {
  const id = useId();
  return (
    <Field orientation="horizontal" data-disabled={disabled || undefined}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <FieldContent>
        <FieldLabel htmlFor={id} className="font-normal">{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
    </Field>
  );
}

/** État local resynchronisé quand la valeur source change (sans effet). */
export function useSyncedState<T>(value: T) {
  const [draft, setDraft] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) { setPrev(value); setDraft(value); }
  return [draft, setDraft] as const;
}

export type SelectOpt = { value: string; label: string; icon?: ReactNode };

export function SelectSetting({ label, value, options, onChange, disabled, placeholder, className, triggerClassName }: {
  label?: string; value: string | null | undefined; options: SelectOpt[]; onChange: (v: string) => void; disabled?: boolean;
  placeholder?: string; className?: string; triggerClassName?: string;
}) {
  const id = useId();
  return (
    <Field className={className}>
      {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className={cn("w-full", triggerClassName)}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.icon}{o.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

/** Bloc de paramètres activable (switch + contenu). */
export function ToggleSection({ label, enabled, onToggle, disabled, children, description }: {
  label: string; enabled: boolean; onToggle: (v: boolean) => void; disabled?: boolean; children?: ReactNode; description?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-card p-3">
      <SwitchSetting label={label} checked={enabled} onChange={onToggle} disabled={disabled} description={description} />
      {enabled && children && <div className="flex flex-col gap-3 pl-1">{children}</div>}
    </div>
  );
}
