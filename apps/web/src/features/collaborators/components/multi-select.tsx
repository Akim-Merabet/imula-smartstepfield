"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type MultiOption = { id: string; label: string; color?: string };

/** Sélection multiple compacte (popover + recherche). */
export function MultiSelect({ id, options, value, onChange, placeholder, disabled }: {
  id?: string; options: MultiOption[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string; disabled?: boolean;
}) {
  const labels = options.filter((o) => value.includes(o.id)).map((o) => o.label).join(" ; ");
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled} className="w-full justify-between font-normal">
          <span className={labels ? "truncate" : "truncate text-muted-foreground"}>{labels || placeholder}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>—</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.id} value={o.label} onSelect={() => toggle(o.id)}>
                  <span className="flex size-4 items-center justify-center">{value.includes(o.id) && <CheckIcon />}</span>
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
