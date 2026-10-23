"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const PICTOGRAM_COUNT = 240;

/** Groupes de la série de pictogrammes (1-240) : dangers, mesures, engins, thématiques, EPI. */
const GROUPS = [
  { id: "danger", from: 1, to: 23, hue: 4 },
  { id: "measure", from: 24, to: 104, hue: 211 },
  { id: "equipment", from: 105, to: 184, hue: 32 },
  { id: "theme", from: 185, to: 209, hue: 272 },
  { id: "ppe", from: 210, to: 240, hue: 152 },
] as const;

const groupOf = (n: number) => GROUPS.find((g) => n >= g.from && n <= g.to) ?? GROUPS[0];

/**
 * Pictogramme générique neutre : numéro dans une pastille colorée selon le groupe
 * (les visuels d'origine ne sont pas repris).
 */
export function Pictogram({ value, size = "md", className }: { value: number | null | undefined; size?: "sm" | "md" | "lg"; className?: string }) {
  const t = useTranslations("libraryShared.pictogram");
  if (!value) return <span className="text-muted-foreground">—</span>;
  const g = groupOf(value);
  const dims = { sm: "size-6 text-[0.6rem]", md: "size-8 text-xs", lg: "size-11 text-sm" }[size];
  return (
    <span role="img" aria-label={t("number", { n: value })} title={`${t("number", { n: value })} · ${t(`groups.${g.id}`)}`}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full border-2 font-semibold tabular-nums", dims, className)}
      style={{ borderColor: `hsl(${g.hue} 70% 42%)`, backgroundColor: `hsl(${g.hue} 80% 95%)`, color: `hsl(${g.hue} 70% 30%)` }}>
      {value}
    </span>
  );
}

/** Champ « Pictogramme » : aperçu + grille de sélection 1-240. */
export function PictogramPicker({ value, onChange, disabled, id }: {
  value: number | null; onChange: (v: number | null) => void; disabled?: boolean; id?: string;
}) {
  const t = useTranslations("libraryShared.pictogram");
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Pictogram value={value} size="lg" />
      <Button id={id} type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>{t("choose")}</Button>
      {value && !disabled && (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t("clear")} onClick={() => onChange(null)}><XIcon /></Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[56rem]">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{value ? t("number", { n: value }) : t("none")}</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
            {GROUPS.map((g) => (
              <section key={g.id} className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-muted-foreground">{t(`groups.${g.id}`)}</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
                  {Array.from({ length: g.to - g.from + 1 }, (_, i) => g.from + i).map((n) => (
                    <button key={n} type="button" onClick={() => { onChange(n); setOpen(false); }}
                      className={cn("flex items-center justify-center rounded-md p-1 hover:bg-accent", value === n && "bg-accent ring-2 ring-primary")}>
                      <Pictogram value={n} />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
