"use client";

import { useTranslations } from "next-intl";
import { ClearFiltersButton, FacetFilter, FilterBar, SearchFilter, ToggleFilter } from "@/components/data-table/filter-bar";

type Opt = { id: string; name?: string; short_name?: string; long_name?: string | null; color?: string };

export function ProjectFormsFilters({ options }: { options: { families: Opt[]; statuses: Opt[] } }) {
  const t = useTranslations("forms");
  return (
    <FilterBar end={<ClearFiltersButton params={["textSearch", "type", "family", "status", "provenance", "state"]} />}>
      <SearchFilter />
      <FacetFilter param="type" label={t("filters.type")} options={(["model", "generic", "local"] as const).map((v) => ({ value: v, label: t(`natures.${v}`) }))} />
      <FacetFilter param="family" label={t("filters.family")}
        options={options.families.map((f) => ({ value: f.id, label: f.long_name ? `${f.short_name} - ${f.long_name}` : f.short_name ?? "", color: f.color }))} />
      <FacetFilter param="status" label={t("filters.status")} options={options.statuses.map((s) => ({ value: s.id, label: s.name ?? "", color: s.color }))} />
      <ToggleFilter param="provenance" defaultValue="all" options={[
        { value: "all", label: t("filters.all") },
        { value: "imported", label: t("provenance.imported") },
        { value: "local", label: t("provenance.local") },
      ]} />
      <ToggleFilter param="state" defaultValue="all" options={[
        { value: "all", label: t("filters.all") },
        { value: "enabled", label: t("state.enabled") },
        { value: "disabled", label: t("state.disabled") },
      ]} />
    </FilterBar>
  );
}
