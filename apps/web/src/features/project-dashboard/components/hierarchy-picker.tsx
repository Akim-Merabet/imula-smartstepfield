"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type HierarchyOption = { id: string; label: string; color: string; locked?: boolean };

/** Sélection multiple de catégories de nature Hiérarchie. */
export function HierarchyPicker({ options, value, onChange, lockedIds }: {
  options: HierarchyOption[]; value: string[]; onChange: (ids: string[]) => void; lockedIds?: Set<string>;
}) {
  const t = useTranslations("dashboard.members.edit");
  if (!options.length) return <p className="text-sm text-muted-foreground">{t("noHierarchy")}</p>;
  return (
    <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border p-2">
      {options.map((o) => {
        const checked = value.includes(o.id);
        const locked = !!lockedIds?.has(o.id) && checked;
        return (
          <label key={o.id} title={locked ? t("hierarchyLocked") : undefined}
            className={cn("flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted", locked && "opacity-70")}>
            <Checkbox checked={checked} disabled={locked}
              onCheckedChange={(c) => onChange(c ? [...value, o.id] : value.filter((v) => v !== o.id))} />
            <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: o.color }} />
            <span className="truncate">{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}
