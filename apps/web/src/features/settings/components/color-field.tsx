"use client";

import { useTranslations } from "next-intl";
import { CheckIcon } from "lucide-react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { COLOR_PALETTE } from "../meta";

/** Couleur : palette prédéfinie + sélecteur libre. */
export function ColorField({ value, onChange, label, disabled }: { value: string; onChange: (v: string) => void; label: string; disabled?: boolean }) {
  const t = useTranslations("settings.color");
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        {COLOR_PALETTE.map((c, i) => (
          <button key={c} type="button" disabled={disabled} onClick={() => onChange(c)}
            aria-label={t(`palette.${i}` as never)} title={t(`palette.${i}` as never)}
            className={cn("flex size-7 items-center justify-center rounded-md ring-offset-2 transition", value.toLowerCase() === c && "ring-2 ring-primary")}
            style={{ backgroundColor: c }}>
            {value.toLowerCase() === c && <CheckIcon className="size-4 text-white" />}
          </button>
        ))}
        <Input type="color" aria-label={t("custom")} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-7 w-12 p-0.5" />
        <span className="font-mono text-xs text-muted-foreground">{value}</span>
      </div>
    </Field>
  );
}
