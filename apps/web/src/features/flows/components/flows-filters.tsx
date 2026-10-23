"use client";

import { useTranslations } from "next-intl";
import { useQueryState, parseAsArrayOf, parseAsString } from "nuqs";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { ClearFiltersButton, FacetFilter, FilterBar, SearchFilter } from "@/components/data-table/filter-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { FlowType } from "../meta";
import { AdvancedSearchButton, type AdvancedOptions } from "./advanced-search-dialog";
import { STATUS_CATEGORIES, type StatusOption } from "./status-select";

const URL_OPTIONS = { shallow: false, history: "replace" } as const;
export const FLOW_FILTER_PARAMS = ["textSearch", "type", "family", "category", "status", "advancedSearch", "limit", "sortBy", "direction"];

type Fam = { id: string; short_name: string; long_name: string | null; color: string };

/** Puces de type (« Filtrer par flow spécifique / générique / … »). */
function TypeChips({ types }: { types: FlowType[] }) {
  const t = useTranslations("flows");
  const [values, setValues] = useQueryState("type", parseAsArrayOf(parseAsString).withDefault([]).withOptions(URL_OPTIONS));
  const toggle = (v: string) => {
    const next = values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
    void setValues(next.length ? next : null);
  };
  return (
    <div className="flex items-center gap-1 rounded-md bg-input-bg p-0.5">
      {types.map((type) => (
        <button key={type} type="button" title={t("filters.byType", { type: t(`types.${type}`) })} onClick={() => toggle(type)}
          className={cn("flex h-7 min-w-7 items-center justify-center rounded px-2 text-xs font-semibold",
            values.includes(type) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white")}>
          {t(`letters.${type}`)}
        </button>
      ))}
    </div>
  );
}

/** Filtre Statut en arbre par état (§3.1). */
function StatusFacet({ statuses }: { statuses: StatusOption[] }) {
  const t = useTranslations("flows");
  const [values, setValues] = useQueryState("status", parseAsArrayOf(parseAsString).withDefault([]).withOptions(URL_OPTIONS));
  const toggle = (ids: string[], on: boolean) => {
    const next = on ? [...new Set([...values, ...ids])] : values.filter((x) => !ids.includes(x));
    void setValues(next.length ? next : null);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" className={cn(values.length && "border-primary")}>
          {t("filters.status")}
          {values.length > 0 && <Badge className="h-5 px-1.5">{values.length}</Badge>}
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={t("filters.status")} />
          <CommandList>
            <CommandEmpty>—</CommandEmpty>
            {STATUS_CATEGORIES.map((cat) => {
              const items = statuses.filter((s) => s.category === cat);
              if (!items.length) return null;
              const all = items.every((s) => values.includes(s.id));
              return (
                <CommandGroup key={cat} heading={
                  <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => toggle(items.map((s) => s.id), !all)}>
                    <span className="flex size-4 items-center justify-center">{all && <CheckIcon className="size-3.5" />}</span>
                    {t(`statusCategories.${cat}`)}
                  </button>
                }>
                  {items.map((s) => (
                    <CommandItem key={s.id} value={`${cat} ${s.name}`} onSelect={() => toggle([s.id], !values.includes(s.id))} className="pl-6">
                      <span className="flex size-4 items-center justify-center">{values.includes(s.id) && <CheckIcon />}</span>
                      <span className="size-3 rounded-sm" style={{ backgroundColor: s.color }} />
                      <span className="truncate">{s.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function FlowsFilters({ types, families, categories, statuses, advanced }: {
  types: FlowType[]; families: Fam[]; categories: Fam[]; statuses: StatusOption[]; advanced: AdvancedOptions;
}) {
  const t = useTranslations("flows");
  const label = (f: Fam) => (f.long_name ? `${f.short_name} - ${f.long_name}` : f.short_name);
  return (
    <FilterBar end={<ClearFiltersButton params={FLOW_FILTER_PARAMS} />}>
      <SearchFilter />
      <AdvancedSearchButton options={advanced} />
      <TypeChips types={types} />
      <FacetFilter param="family" label={t("filters.family")} options={families.map((f) => ({ value: f.id, label: label(f), color: f.color }))} />
      <FacetFilter param="category" label={t("filters.category")} options={categories.map((f) => ({ value: f.id, label: label(f), color: f.color }))} />
      <StatusFacet statuses={statuses} />
    </FilterBar>
  );
}
