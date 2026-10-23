"use client";

import { useTranslations } from "next-intl";
import { ClearFiltersButton, FacetFilter, FilterBar, SearchFilter } from "@/components/data-table/filter-bar";
import type { FacetOption } from "@/components/data-table/filter-bar";

export const MEMBER_FILTER_PARAMS = ["textSearch", "type", "role", "function", "group", "hierarchy", "company"];

export function MembersFilters({ options }: {
  options: { functions: FacetOption[]; groups: FacetOption[]; hierarchies: FacetOption[]; companies: FacetOption[] };
}) {
  const t = useTranslations("dashboard");
  return (
    <FilterBar end={<ClearFiltersButton params={MEMBER_FILTER_PARAMS} />}>
      <SearchFilter />
      <FacetFilter param="type" label={t("members.filters.type")}
        options={(["user", "operator"] as const).map((k) => ({ value: k, label: t(`kinds.${k}`) }))} />
      <FacetFilter param="role" label={t("members.filters.role")}
        options={(["readonly", "operator", "writer", "expert", "responsible"] as const).map((r) => ({ value: r, label: t(`roles.${r}`) }))} />
      <FacetFilter param="function" label={t("members.filters.function")} options={options.functions} />
      <FacetFilter param="group" label={t("members.filters.group")} options={options.groups} />
      <FacetFilter param="hierarchy" label={t("members.filters.hierarchy")}
        options={[{ value: "none", label: t("members.filters.withoutHierarchy") }, ...options.hierarchies]} />
      <FacetFilter param="company" label={t("members.filters.company")} options={options.companies} />
    </FilterBar>
  );
}
