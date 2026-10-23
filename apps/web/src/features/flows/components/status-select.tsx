"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

export type StatusOption = { id: string; name: string; color: string; category: string; is_default?: boolean };
export const STATUS_CATEGORIES = ["todo", "in_preparation", "in_operation", "in_progress", "done"] as const;

/** Sélecteur de statut personnalisé groupé par état (§2.4). */
export function StatusSelect({ statuses, value, onChange, id, disabled }: {
  statuses: StatusOption[]; value: string | null; onChange: (v: string) => void; id?: string; disabled?: boolean;
}) {
  const t = useTranslations("flows");
  const tg = useTranslations("global");
  return (
    <Select value={value ?? ""} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full"><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
      <SelectContent>
        {STATUS_CATEGORIES.map((cat) => {
          const items = statuses.filter((s) => s.category === cat);
          if (!items.length) return null;
          return (
            <SelectGroup key={cat}>
              <SelectLabel>{t(`statusCategories.${cat}`)}</SelectLabel>
              {items.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="size-3 rounded-sm" style={{ backgroundColor: s.color }} />{s.name}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
