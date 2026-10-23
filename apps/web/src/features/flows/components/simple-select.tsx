"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none";

export type SelectOption = { value: string; label: string; color?: string | null };

/** Select à valeur facultative (entrée « Aucun » pour vider). */
export function SimpleSelect({ value, onChange, options, id, disabled, clearable = true, invalid, placeholder }: {
  value: string | null | undefined; onChange: (v: string | null) => void; options: SelectOption[];
  id?: string; disabled?: boolean; clearable?: boolean; invalid?: boolean; placeholder?: string;
}) {
  const tg = useTranslations("global");
  return (
    <Select value={value || ""} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid}><SelectValue placeholder={placeholder ?? tg("actions.select")} /></SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {clearable && <SelectItem value={NONE}><span className="text-muted-foreground">{tg("none")}</span></SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.color && <span className="size-3 rounded-sm" style={{ backgroundColor: o.color }} />}{o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
