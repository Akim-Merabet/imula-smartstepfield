"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Compteur « N éléments / total » + actions de liste. */
export function ListToolbar({ current, total, onAdd, addLabel, children }: {
  current: number; total: number; onAdd?: (() => void) | null; addLabel?: string; children?: ReactNode;
}) {
  const tg = useTranslations("global");
  return (
    <div className="flex items-center justify-between gap-2 pb-2 text-sm text-muted-foreground">
      <span>{tg("list.counter", { current, total })}</span>
      <div className="flex items-center gap-2">
        {children}
        {onAdd && <Button size="sm" onClick={onAdd}><PlusIcon data-icon="inline-start" />{addLabel ?? tg("actions.add")}</Button>}
      </div>
    </div>
  );
}
