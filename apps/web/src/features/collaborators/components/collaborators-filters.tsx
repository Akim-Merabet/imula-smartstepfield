"use client";

import { useTranslations } from "next-intl";
import { ClearFiltersButton, FacetFilter, FilterBar, SearchFilter, type FacetOption } from "@/components/data-table/filter-bar";
import { AUTHORITY_ORDER, COLLABORATOR_STATUSES, OPERATOR_STATUSES, familyLabel, type CollaboratorKind } from "../meta";
import type { CollaboratorOptions } from "../queries";

export const COLLABORATOR_FILTER_PARAMS = [
  "textSearch", "account", "authority", "status", "company", "function", "group", "hierarchy", "skill", "domain", "legal", "contract",
];

type Fam = { id: string; short_name: string; long_name: string | null; color: string };
const fam = (list: Fam[]): FacetOption[] => list.map((f) => ({ value: f.id, label: familyLabel(f), color: f.color }));

export function CollaboratorsFilters({ kind, options }: { kind: CollaboratorKind; options: CollaboratorOptions }) {
  const t = useTranslations("collaborators");
  const statuses = kind === "user" ? COLLABORATOR_STATUSES : OPERATOR_STATUSES;
  return (
    <FilterBar end={<ClearFiltersButton params={COLLABORATOR_FILTER_PARAMS} />}>
      <SearchFilter />
      {options.accounts.length > 1 && (
        <FacetFilter param="account" label={t("filters.applicability")} options={options.accounts.map((a) => ({ value: a.id, label: a.name }))} />
      )}
      {kind === "user" && (
        <FacetFilter param="authority" label={t("filters.authority")}
          options={AUTHORITY_ORDER.map((a) => ({ value: a, label: t(`authority.${a}`) }))} />
      )}
      <FacetFilter param="status" label={t("filters.status")} options={statuses.map((s) => ({ value: s, label: t(`status.${s}`) }))} />
      <FacetFilter param="company" label={t("filters.company")} options={options.companies.map((c) => ({ value: c.id, label: c.name }))} />
      <FacetFilter param="function" label={t("filters.function")} options={fam(options.functions)} />
      <FacetFilter param="group" label={t("filters.group")} options={fam(options.groups)} />
      <FacetFilter param="hierarchy" label={t("filters.hierarchy")}
        options={[{ value: "none", label: t("filters.noHierarchy") }, ...fam(options.hierarchies)]} />
      <FacetFilter param="skill" label={t("filters.skill")}
        options={[{ value: "none", label: t("filters.noSkill") }, { value: "expired", label: t("filters.expiredSkill") }, ...fam(options.skills)]} />
      {options.domains.length > 0 && <FacetFilter param="domain" label={t("filters.domain")} options={fam(options.domains)} />}
      <FacetFilter param="legal" label={t("filters.legal")} options={[{ value: "none", label: t("filters.noLegal") }, ...fam(options.legals)]} />
      <FacetFilter param="contract" label={t("filters.contract")} options={[{ value: "none", label: t("filters.noContract") }, ...fam(options.contracts)]} />
    </FilterBar>
  );
}
