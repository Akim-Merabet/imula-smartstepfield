"use client";

import { useTranslations } from "next-intl";
import { ClearFiltersButton, FacetFilter, FilterBar, SearchFilter, ToggleFilter } from "@/components/data-table/filter-bar";

type Opt = { id: string; name?: string; short_name?: string; long_name?: string | null; color?: string };

export function LibraryFormsFilters({ options, showAccounts }: {
  options: { families: Opt[]; statuses: Opt[]; companies: Opt[]; accounts: Opt[] }; showAccounts: boolean;
}) {
  const t = useTranslations("forms");
  return (
    <FilterBar end={<ClearFiltersButton params={["textSearch", "type", "family", "status", "company", "account", "archived", "limit"]} />}>
      <SearchFilter />
      {showAccounts && <FacetFilter param="account" label={t("filters.account")} options={options.accounts.map((a) => ({ value: a.id, label: a.name ?? "" }))} />}
      <FacetFilter param="company" label={t("filters.company")} options={options.companies.map((c) => ({ value: c.id, label: c.name ?? "" }))} />
      <FacetFilter param="family" label={t("filters.family")}
        options={options.families.map((f) => ({ value: f.id, label: f.long_name ? `${f.short_name} - ${f.long_name}` : f.short_name ?? "", color: f.color }))} />
      <FacetFilter param="status" label={t("filters.status")} options={options.statuses.map((s) => ({ value: s.id, label: s.name ?? "", color: s.color }))} />
      <FacetFilter param="type" label={t("filters.type")} options={(["model", "generic", "other"] as const).map((v) => ({ value: v, label: t(`natures.${v}`) }))} />
      <ToggleFilter param="archived" defaultValue="active" options={[
        { value: "active", label: t("filters.archivedState.active") },
        { value: "archived", label: t("filters.archivedState.archived") },
        { value: "all", label: t("filters.archivedState.all") },
      ]} />
    </FilterBar>
  );
}
