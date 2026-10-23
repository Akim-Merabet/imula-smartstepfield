"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryState, parseAsString } from "nuqs";
import { PlusIcon, SlidersHorizontalIcon, Trash2Icon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ADVANCED_FIELDS, operatorsFor, parseAdvancedSearch, serializeAdvancedSearch, VALUELESS,
  type AdvancedCriterion, type AdvancedField, type AdvancedOperator,
} from "../advanced-search";

export type AdvancedOptions = Partial<Record<AdvancedField, { value: string; label: string }[]>>;

const FIELDS = Object.keys(ADVANCED_FIELDS) as AdvancedField[];

/** Bouton + modale « Recherche avancée » : critères Champ / Action / Valeur(s) liés par « ou ». */
export function AdvancedSearchButton({ options }: { options: AdvancedOptions }) {
  const t = useTranslations("flows.advancedSearch");
  const tg = useTranslations("global");
  const [raw, setRaw] = useQueryState("advancedSearch", parseAsString.withOptions({ shallow: false, history: "replace" }));
  const current = parseAdvancedSearch(raw);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AdvancedCriterion[]>([]);

  const openDialog = () => {
    setRows(current.length ? current : [{ field: "name", op: "contains", values: [""] }]);
    setOpen(true);
  };
  const update = (i: number, patch: Partial<AdvancedCriterion>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const search = () => { void setRaw(serializeAdvancedSearch(rows)); setOpen(false); };

  const valueInput = (row: AdvancedCriterion, i: number, k: number) => {
    const kind = ADVANCED_FIELDS[row.field].kind;
    const set = (v: string) => update(i, { values: row.values.map((x, j) => (j === k ? v : x)) });
    if (kind === "list" || kind === "type") {
      const opts = options[row.field] ?? [];
      return (
        <Select value={row.values[k] || undefined} onValueChange={set}>
          <SelectTrigger className="w-full"><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
          <SelectContent><SelectGroup>{opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      );
    }
    return <Input type={kind === "date" ? "date" : "text"} value={row.values[k] ?? ""} onChange={(e) => set(e.target.value)} />;
  };

  return (
    <>
      <Button variant="secondary" onClick={openDialog} className={cn(current.length && "border-primary")}>
        <SlidersHorizontalIcon data-icon="inline-start" />{t("title")}
        {current.length > 0 && <Badge className="h-5 px-1.5">{current.length}</Badge>}
      </Button>
      {current.length > 0 && (
        <Button variant="ghost" size="icon-sm" aria-label={t("reset")} onClick={() => void setRaw(null)}><XIcon /></Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[56rem]" onKeyDown={(e) => { if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); search(); } }}>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("subtitle")}</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            <div className="grid grid-cols-[14rem_12rem_1fr_2rem] gap-2 text-xs font-medium text-muted-foreground">
              <span>{t("field")}</span><span>{t("action")}</span><span>{t("values")}</span><span />
            </div>
            {rows.map((row, i) => {
              const kind = ADVANCED_FIELDS[row.field].kind;
              const valueCount = VALUELESS.includes(row.op) ? 0 : row.op === "between" ? 2 : row.values.length || 1;
              return (
                <div key={i} className="grid grid-cols-[14rem_12rem_1fr_2rem] items-start gap-2">
                  <Select value={row.field} onValueChange={(v) => {
                    const f = v as AdvancedField;
                    update(i, { field: f, op: operatorsFor(f)[0], values: [""] });
                  }}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup>{FIELDS.map((f) => <SelectItem key={f} value={f}>{t(`fields.${f}`)}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                  <Select value={row.op} onValueChange={(v) => update(i, { op: v as AdvancedOperator, values: v === "between" ? ["", ""] : [row.values[0] ?? ""] })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup>{operatorsFor(row.field).map((op) => <SelectItem key={op} value={op}>{t(`operators.${op}`)}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                  <div className="flex flex-col gap-1.5">
                    {Array.from({ length: valueCount }).map((_, k) => (
                      <div key={k} className="flex items-center gap-2">
                        {k > 0 && <span className="w-6 text-xs text-muted-foreground">{row.op === "between" ? t("and") : t("or")}</span>}
                        <div className="flex-1">{valueInput(row, i, k)}</div>
                      </div>
                    ))}
                    {valueCount > 0 && row.op !== "between" && kind !== "date" && (
                      <Button variant="link" size="sm" className="self-start px-0" onClick={() => update(i, { values: [...row.values, ""] })}>
                        <PlusIcon data-icon="inline-start" />{t("addValue")}
                      </Button>
                    )}
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={tg("actions.delete")} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
                    <Trash2Icon />
                  </Button>
                </div>
              );
            })}
            <Button variant="link" className="self-start px-0" onClick={() => setRows((r) => [...r, { field: "name", op: "contains", values: [""] }])}>
              <PlusIcon data-icon="inline-start" />{t("addCriterion")}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRows([]); void setRaw(null); setOpen(false); }}>{t("reset")}</Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>{tg("actions.close")}</Button>
            <Button onClick={search}>{tg("actions.search")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
