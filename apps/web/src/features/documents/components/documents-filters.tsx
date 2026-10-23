"use client";

import { useTranslations } from "next-intl";
import { parseAsString, useQueryState } from "nuqs";
import { ClearFiltersButton, FacetFilter, FilterBar, SearchFilter, type FacetOption } from "@/components/data-table/filter-bar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { WORDING_KEYS } from "../meta";

const URL_OPTIONS = { shallow: false, history: "replace" } as const;
export const DOCUMENT_FILTER_PARAMS = ["textSearch", "family", "category", "closingCategory", "provenance", "state", "flow", "applicability", "dateField", "period", "from", "to"];

export function DocumentsFilters({ mode, options }: {
  mode: "project" | "library";
  options: { families: FacetOption[]; categories: FacetOption[]; flows: FacetOption[]; accounts: FacetOption[] };
}) {
  const t = useTranslations("documents");
  const states = WORDING_KEYS.filter((k) => !["bpoModification", "vso", "vsoSr", "vao", "bpaOk", "bpaKo", "bpaModification"].includes(k))
    .map((k) => ({ value: k, label: t(`wording.${k}.value`) }));
  return (
    <FilterBar end={<ClearFiltersButton params={DOCUMENT_FILTER_PARAMS} />}>
      <SearchFilter />
      {mode === "library" && <FacetFilter param="applicability" label={t("filters.applicability")} options={options.accounts} />}
      <FacetFilter param="family" label={t("filters.family")} options={options.families} />
      <FacetFilter param="category" label={t("filters.category")} options={options.categories} />
      <FacetFilter param="closingCategory" label={t("filters.closingCategory")} options={options.categories} />
      {mode === "project" && (
        <FacetFilter param="provenance" label={t("filters.provenance")}
          options={(["local", "imported_from_library", "derived_from_standard"] as const).map((v) => ({ value: v, label: t(`provenances.${v}`) }))} />
      )}
      <FacetFilter param="state" label={t("filters.state")} options={states} />
      {mode === "project" && <FacetFilter param="flow" label={t("filters.flow")} options={options.flows} />}
      {mode === "project" && <DateFilter />}
    </FilterBar>
  );
}

/** « Filtrer par date » : champ (création / diffusion) + période prédéfinie ou bornes. */
function DateFilter() {
  const t = useTranslations("documents.filters");
  const [field, setField] = useQueryState("dateField", parseAsString.withDefault("created").withOptions(URL_OPTIONS));
  const [period, setPeriod] = useQueryState("period", parseAsString.withDefault("none").withOptions(URL_OPTIONS));
  const [from, setFrom] = useQueryState("from", parseAsString.withDefault("").withOptions(URL_OPTIONS));
  const [to, setTo] = useQueryState("to", parseAsString.withDefault("").withOptions(URL_OPTIONS));
  return (
    <div className={cn("flex items-center gap-1 rounded-md", period !== "none" && "ring-1 ring-primary")}>
      <Select value={field} onValueChange={(v) => void setField(v === "created" ? null : v)}>
        <SelectTrigger className="w-40" aria-label={t("date")}><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>
          <SelectItem value="created">{t("dateField.created")}</SelectItem>
          <SelectItem value="diffusion">{t("dateField.diffusion")}</SelectItem>
        </SelectGroup></SelectContent>
      </Select>
      <Select value={period} onValueChange={(v) => void setPeriod(v === "none" ? null : v)}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>
          {(["none", "day", "week", "month", "lastMonth", "custom"] as const).map((p) => <SelectItem key={p} value={p}>{t(`period.${p}`)}</SelectItem>)}
        </SelectGroup></SelectContent>
      </Select>
      {period === "custom" && (
        <>
          <Input type="date" aria-label={t("from")} className="w-40" value={from} onChange={(e) => void setFrom(e.target.value || null)} />
          <Input type="date" aria-label={t("to")} className="w-40" value={to} onChange={(e) => void setTo(e.target.value || null)} />
        </>
      )}
    </div>
  );
}
