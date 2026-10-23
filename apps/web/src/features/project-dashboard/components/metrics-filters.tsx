"use client";

import { useTranslations } from "next-intl";
import { ClearFiltersButton, FacetFilter, FilterBar, type FacetOption } from "@/components/data-table/filter-bar";

export function MetricsFilters({ families, categories }: { families: FacetOption[]; categories: FacetOption[] }) {
  const t = useTranslations("dashboard.metrics.filters");
  return (
    <FilterBar end={<ClearFiltersButton params={["family", "category"]} />}>
      <FacetFilter param="family" label={t("family")} options={families} />
      <FacetFilter param="category" label={t("category")} options={categories} />
    </FilterBar>
  );
}
