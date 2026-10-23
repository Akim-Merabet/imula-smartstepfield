"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { familyLabel, type FamilyNature } from "../meta";

type Opt = { id: string; short_name: string; long_name: string | null; color: string; parent_id: string | null };

/** Sélecteur de famille (parent ou enfant) d'une nature, partagé dans l'organisation. */
export function FamilySelect({ nature, relative, value, onChange, disabled, invalid }: {
  nature: FamilyNature; relative: "parent" | "child"; value: string | null | undefined; onChange: (id: string) => void;
  disabled?: boolean; invalid?: boolean;
}) {
  const tg = useTranslations("global");
  const [items, setItems] = useState<Opt[]>([]);
  const [parents, setParents] = useState<Opt[]>([]);
  useEffect(() => {
    const supabase = createClient();
    supabase.from("label_families").select("id, short_name, long_name, color, parent_id, relative_nature")
      .eq("kind", "family").eq("nature", nature).is("project_id", null).is("deleted_at", null)
      .order("priority").order("short_name")
      .then(({ data }) => {
        setItems((data ?? []).filter((f) => f.relative_nature === relative));
        setParents((data ?? []).filter((f) => f.relative_nature === "parent"));
      });
  }, [nature, relative]);

  const option = (f: Opt) => (
    <SelectItem key={f.id} value={f.id}><span className="size-3 rounded-sm" style={{ backgroundColor: f.color }} />{familyLabel(f)}</SelectItem>
  );
  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-invalid={invalid}><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
      <SelectContent>
        {relative === "parent" ? <SelectGroup>{items.map(option)}</SelectGroup> : parents.map((p) => {
          const children = items.filter((c) => c.parent_id === p.id);
          if (!children.length) return null;
          return <SelectGroup key={p.id}><SelectLabel>{familyLabel(p)}</SelectLabel>{children.map(option)}</SelectGroup>;
        })}
      </SelectContent>
    </Select>
  );
}
