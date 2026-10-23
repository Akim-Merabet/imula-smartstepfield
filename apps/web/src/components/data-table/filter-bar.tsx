"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQueryState, parseAsArrayOf, parseAsString } from "nuqs";
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const URL_OPTIONS = { shallow: false, history: "replace" } as const;

/** Recherche texte liée au paramètre d'URL `textSearch` (debounce 300 ms). */
export function SearchFilter({ param = "textSearch" }: { param?: string }) {
  const t = useTranslations("global.list");
  const [value, setValue] = useQueryState(param, parseAsString.withDefault("").withOptions(URL_OPTIONS));
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    const id = setTimeout(() => { if (draft !== value) void setValue(draft || null); }, 300);
    return () => clearTimeout(id);
  }, [draft, value, setValue]);

  return (
    <InputGroup className={cn("w-64 bg-input-bg", value && "border-primary")}>
      <InputGroupAddon><SearchIcon /></InputGroupAddon>
      <InputGroupInput value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("searchPlaceholder")} />
    </InputGroup>
  );
}

export type FacetOption = { value: string; label: string; color?: string };

/** Filtre à facettes multi-valeurs lié à un paramètre d'URL (valeurs séparées par « , »). */
export function FacetFilter({ param, label, options }: { param: string; label: string; options: FacetOption[] }) {
  const [values, setValues] = useQueryState(param, parseAsArrayOf(parseAsString).withDefault([]).withOptions(URL_OPTIONS));
  const toggle = (v: string) => {
    const next = values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
    void setValues(next.length ? next : null);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" className={cn(values.length && "border-primary")}>
          {label}
          {values.length > 0 && <Badge variant="default" className="h-5 px-1.5">{values.length}</Badge>}
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={label} />
          <CommandList>
            <CommandEmpty>—</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)}>
                  <span className="flex size-4 items-center justify-center">{values.includes(o.value) && <CheckIcon />}</span>
                  {o.color && <span className="size-3 rounded-sm" style={{ backgroundColor: o.color }} />}
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Bascule à choix unique (ex. État : Visible / Masquée / Toutes). */
export function ToggleFilter({ param, options, defaultValue }: { param: string; options: FacetOption[]; defaultValue: string }) {
  const [value, setValue] = useQueryState(param, parseAsString.withDefault(defaultValue).withOptions(URL_OPTIONS));
  return (
    <div className="flex rounded-md bg-input-bg p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => void setValue(o.value === defaultValue ? null : o.value)}
          className={cn("rounded px-2.5 py-1 text-sm", value === o.value ? "bg-white font-medium shadow-sm" : "text-muted-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ClearFiltersButton({ params }: { params: string[] }) {
  const t = useTranslations("global.actions");
  const clear = () => {
    const url = new URL(window.location.href);
    params.forEach((p) => url.searchParams.delete(p));
    window.location.assign(url.toString());
  };
  return (
    <Button variant="ghost" onClick={clear}><XIcon data-icon="inline-start" />{t("clearFilters")}</Button>
  );
}

export function FilterBar({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 pb-3">
      {children}
      {end && <div className="ml-auto flex items-center gap-2">{end}</div>}
    </div>
  );
}
