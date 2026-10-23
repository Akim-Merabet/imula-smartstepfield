import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";

export type FormNature = Enums<"form_nature">;

export type LibraryFormFilters = {
  textSearch?: string;
  natures?: FormNature[];
  families?: string[];
  statuses?: string[];
  companies?: string[];
  accounts?: string[];
  archived?: "active" | "archived" | "all";
  limit?: number;
};

const FORM_SELECT = `
  id, name, description, reference, index_label, nature, location, origin, project_id, lineage_id, enabled, archived,
  updated_at, created_at, structure_rev, current_version_id, sourced_from_form_id, sourced_from_version_id, pdf_template,
  object_attributes_link, account_id, custom_status_id, family_id,
  family:label_families!forms_family_id_fkey(id, short_name, long_name, color),
  status:custom_statuses(id, name, color, importable),
  account:accounts(id, name),
  companies:form_companies(company:companies(id, name))
`;

type Rel = { id: string; name: string };
export type FormListItem = {
  id: string; name: string; description: string | null; reference: string | null; index_label: string | null;
  nature: FormNature; location: Enums<"form_location">; origin: Enums<"form_origin"> | null; project_id: string | null;
  lineage_id: string; enabled: boolean; archived: boolean; updated_at: string; created_at: string; structure_rev: number;
  current_version_id: string | null; sourced_from_form_id: string | null; sourced_from_version_id: string | null;
  pdf_template: { enabled?: boolean } | null; object_attributes_link: Enums<"object_attr_link">; account_id: string;
  custom_status_id: string | null; family_id: string | null;
  family: { id: string; short_name: string; long_name: string | null; color: string } | null;
  status: { id: string; name: string; color: string; importable: boolean } | null;
  account: Rel | null;
  companies: { company: Rel | null }[];
};

export const LIBRARY_PAGE_SIZE = 50;

export async function listLibraryForms(filters: LibraryFormFilters) {
  const supabase = await createClient();
  const limit = filters.limit ?? LIBRARY_PAGE_SIZE;
  let query = supabase.from("forms").select(FORM_SELECT, { count: "exact" })
    .eq("location", "library").is("deleted_at", null).order("updated_at", { ascending: false });
  if (filters.textSearch) {
    const q = filters.textSearch.replace(/[%,()]/g, " ");
    query = query.or(`name.ilike.%${q}%,reference.ilike.%${q}%,description.ilike.%${q}%`);
  }
  if (filters.natures?.length) query = query.in("nature", filters.natures);
  if (filters.families?.length) query = query.in("family_id", filters.families);
  if (filters.statuses?.length) query = query.in("custom_status_id", filters.statuses);
  if (filters.accounts?.length) query = query.in("account_id", filters.accounts);
  const archived = filters.archived ?? "active";
  if (archived === "active") query = query.eq("archived", false);
  if (archived === "archived") query = query.eq("archived", true);
  if (filters.companies?.length) {
    const { data: links } = await supabase.from("form_companies").select("form_id").in("company_id", filters.companies);
    query = query.in("id", [...new Set((links ?? []).map((l) => l.form_id))].concat("00000000-0000-0000-0000-000000000000"));
  }
  const { data, count, error } = await query.range(0, limit - 1);
  if (error) throw error;
  const items = (data ?? []) as unknown as FormListItem[];
  // Formulaires déjà importés (au moins un import visible) → suppression bloquée.
  const ids = items.map((f) => f.id);
  const imported = new Set<string>();
  if (ids.length) {
    const { data: imports } = await supabase.from("forms").select("sourced_from_form_id")
      .in("sourced_from_form_id", ids).eq("location", "project").is("deleted_at", null);
    for (const i of imports ?? []) if (i.sourced_from_form_id) imported.add(i.sourced_from_form_id);
  }
  return {
    items: items.map((f) => ({ ...f, already_imported: imported.has(f.id) })),
    total: count ?? items.length,
    hasMore: (count ?? 0) > items.length,
  };
}
export type LibraryFormItem = Awaited<ReturnType<typeof listLibraryForms>>["items"][number];

export type ProjectFormFilters = {
  textSearch?: string;
  natures?: FormNature[];
  families?: string[];
  statuses?: string[];
  provenance?: "imported" | "local" | "all";
  state?: "enabled" | "disabled" | "all";
};

export async function listProjectForms(projectId: string, filters: ProjectFormFilters) {
  const supabase = await createClient();
  let query = supabase.from("forms").select(FORM_SELECT).eq("location", "project").eq("project_id", projectId)
    .is("deleted_at", null).order("name");
  if (filters.textSearch) {
    const q = filters.textSearch.replace(/[%,()]/g, " ");
    query = query.or(`name.ilike.%${q}%,reference.ilike.%${q}%`);
  }
  if (filters.natures?.length) query = query.in("nature", filters.natures);
  if (filters.families?.length) query = query.in("family_id", filters.families);
  if (filters.statuses?.length) query = query.in("custom_status_id", filters.statuses);
  if (filters.provenance && filters.provenance !== "all") query = query.eq("origin", filters.provenance);
  if (filters.state === "enabled") query = query.eq("enabled", true);
  if (filters.state === "disabled") query = query.eq("enabled", false);
  const { data, error } = await query;
  if (error) throw error;
  const items = (data ?? []) as unknown as FormListItem[];

  // Mise à jour disponible : la structure de la source bibliothèque a changé depuis la version importée.
  const sourceIds = [...new Set(items.map((f) => f.sourced_from_form_id).filter((x): x is string => !!x))];
  const versionIds = [...new Set(items.map((f) => f.sourced_from_version_id).filter((x): x is string => !!x))];
  const [sources, versions, responses] = await Promise.all([
    sourceIds.length ? supabase.from("forms").select("id, structure_rev, updated_at, deleted_at").in("id", sourceIds) : Promise.resolve({ data: [] }),
    versionIds.length ? supabase.from("form_versions").select("id, structure_rev").in("id", versionIds) : Promise.resolve({ data: [] }),
    items.length ? supabase.from("form_responses").select("form_id").in("form_id", items.map((f) => f.id)).is("deleted_at", null) : Promise.resolve({ data: [] }),
  ]);
  const srcRev = new Map((sources.data ?? []).filter((s) => !s.deleted_at).map((s) => [s.id, s.structure_rev]));
  const verRev = new Map((versions.data ?? []).map((v) => [v.id, v.structure_rev]));
  const respCount = new Map<string, number>();
  for (const r of responses.data ?? []) respCount.set(r.form_id, (respCount.get(r.form_id) ?? 0) + 1);
  return items.map((f) => ({
    ...f,
    update_available: f.origin === "imported" && !!f.sourced_from_form_id && srcRev.has(f.sourced_from_form_id)
      && (f.sourced_from_version_id ? srcRev.get(f.sourced_from_form_id) !== verRev.get(f.sourced_from_version_id) : true),
    response_count: respCount.get(f.id) ?? 0,
  }));
}
export type ProjectFormItem = Awaited<ReturnType<typeof listProjectForms>>[number];

/** Options des filtres (familles et statuts de nature formulaire, sociétés, applicabilités). */
export async function getFormFilterOptions() {
  const supabase = await createClient();
  const [families, statuses, companies, accounts] = await Promise.all([
    supabase.from("label_families").select("id, short_name, long_name, color")
      .eq("kind", "family").eq("nature", "form").eq("relative_nature", "child").eq("active", true).is("deleted_at", null)
      .is("project_id", null).order("priority").order("short_name"),
    supabase.from("custom_statuses").select("id, name, color").eq("nature", "form").eq("active", true).order("sort_order"),
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("accounts").select("id, name").order("name"),
  ]);
  return { families: families.data ?? [], statuses: statuses.data ?? [], companies: companies.data ?? [], accounts: accounts.data ?? [] };
}
