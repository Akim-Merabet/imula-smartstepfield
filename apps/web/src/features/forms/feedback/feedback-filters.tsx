"use client";

import { useTranslations } from "next-intl";
import { parseAsString, useQueryState } from "nuqs";
import { ClearFiltersButton, FacetFilter, FilterBar, SearchFilter, ToggleFilter } from "@/components/data-table/filter-bar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const URL_OPTIONS = { shallow: false, history: "replace" } as const;

/** Filtre de date : champ (création, modification, terminaison) + intervalle. */
function DateFilter() {
  const t = useTranslations("forms.feedback.filters");
  const [field, setField] = useQueryState("dateField", parseAsString.withDefault("created_at").withOptions(URL_OPTIONS));
  const [from, setFrom] = useQueryState("from", parseAsString.withDefault("").withOptions(URL_OPTIONS));
  const [to, setTo] = useQueryState("to", parseAsString.withDefault("").withOptions(URL_OPTIONS));
  return (
    <div className="flex items-center gap-1">
      <Select value={field} onValueChange={(v) => void setField(v === "created_at" ? null : v)}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {(["created_at", "updated_at", "done_at"] as const).map((f) => <SelectItem key={f} value={f}>{t(`dates.${f}`)}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Input type="date" aria-label={t("from")} className="w-38" value={from} onChange={(e) => void setFrom(e.target.value || null)} />
      <Input type="date" aria-label={t("to")} className="w-38" value={to} onChange={(e) => void setTo(e.target.value || null)} />
    </div>
  );
}

type Opt = { id: string; name: string; ref_int?: string | null; color?: string };

export function FeedbackFilters({ options }: { options: { flows: Opt[]; forms: Opt[]; statuses: Opt[] } }) {
  const t = useTranslations("forms.feedback.filters");
  const tr = useTranslations("forms.responses");
  return (
    <FilterBar end={<ClearFiltersButton params={["textSearch", "flow", "form", "source", "state", "status", "dateField", "from", "to", "limit"]} />}>
      <SearchFilter />
      <FacetFilter param="flow" label={t("flow")} options={options.flows.map((f) => ({ value: f.id, label: f.ref_int ? `${f.ref_int} - ${f.name}` : f.name }))} />
      <FacetFilter param="form" label={t("form")} options={options.forms.map((f) => ({ value: f.id, label: f.name }))} />
      <FacetFilter param="source" label={t("source")} options={(["webapp", "mobile", "project", "flow"] as const).map((s) => ({ value: s, label: t(`sources.${s}`) }))} />
      <ToggleFilter param="state" defaultValue="all" options={[
        { value: "all", label: t("allStates") },
        { value: "in_progress", label: tr("state.in_progress") },
        { value: "done", label: tr("state.done") },
      ]} />
      <FacetFilter param="status" label={t("status")} options={options.statuses.map((s) => ({ value: s.id, label: s.name, color: s.color }))} />
      <DateFilter />
    </FilterBar>
  );
}
