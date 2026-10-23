"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { VisibilityState } from "@tanstack/react-table";
import { Columns3Icon, LockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ColumnChoice = { id: string; label: string; locked?: boolean; group?: string };
const MAX_COLUMNS = 30;

/** « Personnaliser les colonnes » : colonnes verrouillées + optionnelles, max 30, stockage navigateur. */
export function ColumnsCustomizer({ choices, visibility, onChange }: {
  choices: ColumnChoice[]; visibility: VisibilityState; onChange: (v: VisibilityState | null) => void;
}) {
  const t = useTranslations("global");
  const [open, setOpen] = useState(false);
  const visibleCount = choices.filter((c) => c.locked || visibility[c.id] !== false).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm"><Columns3Icon data-icon="inline-start" />{t("list.customizeColumns")}</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="max-h-96 overflow-y-auto p-3">
          <div className="flex flex-col gap-2">
            {choices.map((c) => {
              const checked = c.locked || visibility[c.id] !== false;
              return (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={checked} disabled={c.locked || (!checked && visibleCount >= MAX_COLUMNS)}
                    onCheckedChange={(v) => onChange({ ...visibility, [c.id]: !!v })} />
                  <span className="flex-1 truncate">{c.label}</span>
                  {c.locked && <LockIcon className="size-3.5 text-muted-foreground" />}
                </label>
              );
            })}
          </div>
        </div>
        <div className="flex justify-between border-t p-2">
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>{t("actions.reset")}</Button>
          <Button size="sm" onClick={() => setOpen(false)}>{t("actions.close")}</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
