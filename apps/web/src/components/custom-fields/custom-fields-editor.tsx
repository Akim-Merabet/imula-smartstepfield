"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/lib/supabase/database.types";

export type CustomFieldDef = Pick<Tables<"custom_fields">,
  "id" | "name" | "type" | "choices" | "placeholder" | "tooltip" | "description" | "required" | "read_only" | "default_value">;
export type CustomFieldValues = Record<string, string | string[] | null>;

/** Saisie des attributs personnalisés (spec 01 §6.8) — onglet « Attribut(s) » des modales. */
export function CustomFieldsEditor({ fields, values, onChange, emptyLabel }: {
  fields: CustomFieldDef[]; values: CustomFieldValues; onChange: (values: CustomFieldValues) => void; emptyLabel: string;
}) {
  const t = useTranslations("global");
  if (fields.length === 0) return <p className="py-8 text-center text-muted-foreground">{emptyLabel}</p>;
  const set = (id: string, v: string | string[] | null) => onChange({ ...values, [id]: v });

  return (
    <FieldGroup>
      {fields.map((f) => {
        const value = values[f.id] ?? f.default_value ?? null;
        const str = typeof value === "string" ? value : "";
        const id = `cf-${f.id}`;
        if (f.type === "label") {
          return <Fragment key={f.id}><FieldSeparator>{f.name}</FieldSeparator></Fragment>;
        }
        const label = <FieldLabel htmlFor={id}>{f.name}{f.required && " *"}</FieldLabel>;
        const help = f.description ? <FieldDescription>{f.description}</FieldDescription> : null;
        const common = { id, disabled: f.read_only, placeholder: f.placeholder ?? undefined, title: f.tooltip ?? undefined };

        switch (f.type) {
          case "boolean":
            return (
              <Field key={f.id} orientation="horizontal">
                <Switch id={id} checked={str === "true"} disabled={f.read_only} onCheckedChange={(c) => set(f.id, c ? "true" : "false")} />
                {label}
              </Field>
            );
          case "textarea":
            return <Field key={f.id}>{label}<Textarea {...common} value={str} onChange={(e) => set(f.id, e.target.value)} />{help}</Field>;
          case "integer":
          case "double":
            return (
              <Field key={f.id}>{label}
                <Input {...common} type="number" step={f.type === "integer" ? 1 : "any"} value={str} onChange={(e) => set(f.id, e.target.value || null)} />{help}
              </Field>
            );
          case "date":
            return <Field key={f.id}>{label}<Input {...common} type="date" value={str} onChange={(e) => set(f.id, e.target.value || null)} />{help}</Field>;
          case "datetime":
            return <Field key={f.id}>{label}<Input {...common} type="datetime-local" value={str} onChange={(e) => set(f.id, e.target.value || null)} />{help}</Field>;
          case "select":
            return (
              <Field key={f.id}>{label}
                <Select value={str || undefined} onValueChange={(v) => set(f.id, v)} disabled={f.read_only}>
                  <SelectTrigger id={id}><SelectValue placeholder={f.placeholder ?? t("actions.select")} /></SelectTrigger>
                  <SelectContent><SelectGroup>{f.choices.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>{help}
              </Field>
            );
          case "multiselect": {
            const arr = Array.isArray(value) ? value : str ? str.split(";") : [];
            return (
              <Field key={f.id}>{label}
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {f.choices.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={arr.includes(c)} disabled={f.read_only}
                        onCheckedChange={(on) => set(f.id, on ? [...arr, c] : arr.filter((x) => x !== c))} />
                      {c}
                    </label>
                  ))}
                </div>{help}
              </Field>
            );
          }
          case "link":
            return <Field key={f.id}>{label}<Input {...common} type="url" value={str} onChange={(e) => set(f.id, e.target.value || null)} />{help}</Field>;
          default:
            return <Field key={f.id}>{label}<Input {...common} value={str} onChange={(e) => set(f.id, e.target.value || null)} />{help}</Field>;
        }
      })}
    </FieldGroup>
  );
}
