"use client";

import { useTranslations } from "next-intl";
import { ClearFiltersButton, FacetFilter, FilterBar, SearchFilter, ToggleFilter } from "@/components/data-table/filter-bar";
import { PROJECT_TYPES } from "../meta";

type Opt = { id: string; name?: string; short_name?: string; long_name?: string | null; color?: string };

export function ProjectsFilters({ options }: { options: { families: Opt[]; clients: Opt[]; statuses: Opt[] } }) {
  const t = useTranslations("projects");
  return (
    <FilterBar end={<ClearFiltersButton params={["textSearch", "type", "state", "family", "client", "status", "published", "limit"]} />}>
      <SearchFilter />
      <FacetFilter param="type" label={t("filters.types")} options={PROJECT_TYPES.map((v) => ({ value: v, label: t(`types.${v}`) }))} />
      <ToggleFilter param="state" defaultValue="visible" options={[
        { value: "visible", label: t("filters.visible") },
        { value: "hidden", label: t("filters.hidden") },
        { value: "all", label: t("filters.all") },
      ]} />
      <FacetFilter param="family" label={t("filters.family")}
        options={options.families.map((f) => ({ value: f.id, label: f.long_name ? `${f.short_name} - ${f.long_name}` : f.short_name ?? "", color: f.color }))} />
      <FacetFilter param="client" label={t("filters.client")} options={options.clients.map((c) => ({ value: c.id, label: c.name ?? "" }))} />
      <FacetFilter param="status" label={t("filters.status")} options={options.statuses.map((s) => ({ value: s.id, label: s.name ?? "", color: s.color }))} />
      <ToggleFilter param="published" defaultValue="all" options={[
        { value: "all", label: t("filters.all") },
        { value: "public", label: t("filters.public") },
        { value: "private", label: t("filters.private") },
      ]} />
    </FilterBar>
  );
}
