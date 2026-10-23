"use client";

import { useTranslations } from "next-intl";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type MultiOption = { value: string; label: string; color?: string | null };

/** Sélection multiple avec recherche (responsables, étiquettes, compétences…). */
export function MultiSelect({ options, value, onChange, placeholder, disabled, id }: {
  options: MultiOption[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string; disabled?: boolean; id?: string;
}) {
  const tg = useTranslations("global");
  const selected = options.filter((o) => value.includes(o.value));
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" disabled={disabled} className="h-auto min-h-9 w-full justify-between px-2 py-1 font-normal">
          <span className="flex flex-wrap gap-1">
            {selected.length === 0 && <span className="px-1 text-muted-foreground">{placeholder ?? tg("actions.select")}</span>}
            {selected.map((o) => (
              <Badge key={o.value} variant="secondary" className="gap-1">
                {o.color && <span className="size-2 rounded-full" style={{ backgroundColor: o.color ?? undefined }} />}
                {o.label}
                <span role="button" tabIndex={-1} aria-label={tg("actions.delete")} onClick={(e) => { e.stopPropagation(); toggle(o.value); }}>
                  <XIcon className="size-3" />
                </span>
              </Badge>
            ))}
          </span>
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder={tg("actions.search")} />
          <CommandList>
            <CommandEmpty>—</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => toggle(o.value)}>
                  <span className="flex size-4 items-center justify-center">{value.includes(o.value) && <CheckIcon />}</span>
                  {o.color && <span className="size-3 rounded-sm" style={{ backgroundColor: o.color ?? undefined }} />}
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
