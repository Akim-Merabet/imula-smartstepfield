"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { EllipsisVerticalIcon, type LucideIcon } from "lucide-react";
import { ClearFiltersButton, FacetFilter, FilterBar, SearchFilter, type FacetOption } from "@/components/data-table/filter-bar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Opt = { id: string; label: string; color?: string };

/** Barre de filtres d'une liste de bibliothèque : recherche, Applicabilité, Famille (+ filtres propres). */
export function LibraryFilterBar({ families, accounts, extra, extraParams = [], end, accountsExtra }: {
  families?: Opt[]; accounts: { id: string; name: string }[]; extra?: ReactNode; extraParams?: string[]; end?: ReactNode;
  accountsExtra?: FacetOption[];
}) {
  const t = useTranslations("libraryShared");
  const accountOptions = [...(accountsExtra ?? []), ...accounts.map((a) => ({ value: a.id, label: a.name }))];
  return (
    <FilterBar end={end}>
      <SearchFilter />
      {accountOptions.length > 1 && <FacetFilter param="account" label={t("applicability")} options={accountOptions} />}
      {families && <FacetFilter param="family" label={t("family")} options={families.map((f) => ({ value: f.id, label: f.label, color: f.color }))} />}
      {extra}
      <ClearFiltersButton params={["textSearch", "account", "family", ...extraParams]} />
    </FilterBar>
  );
}

export type RowAction = { id: string; label: string; icon: LucideIcon; onSelect: () => void; destructive?: boolean; hidden?: boolean };

/** Menu « … » d'une ligne ; les actions destructives sont séparées en bas. */
export function RowActions({ actions, label }: { actions: RowAction[]; label: string }) {
  const visible = actions.filter((a) => !a.hidden);
  if (!visible.length) return null;
  const main = visible.filter((a) => !a.destructive);
  const danger = visible.filter((a) => a.destructive);
  const item = (a: RowAction) => (
    <DropdownMenuItem key={a.id} variant={a.destructive ? "destructive" : "default"} onSelect={a.onSelect}><a.icon />{a.label}</DropdownMenuItem>
  );
  return (
    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={label}><EllipsisVerticalIcon /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {main.length > 0 && <DropdownMenuGroup>{main.map(item)}</DropdownMenuGroup>}
          {main.length > 0 && danger.length > 0 && <DropdownMenuSeparator />}
          {danger.length > 0 && <DropdownMenuGroup>{danger.map(item)}</DropdownMenuGroup>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
