import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSkillExpired, type Authority, type CollaboratorKind, type CollaboratorStatus } from "./meta";

const FAMILY = "id, short_name, long_name, color";
const COLLABORATOR_SELECT = `
  id, kind, first_name, last_name, trigram, email, authority, status, account_id, company_id,
  function_id, group_id, legal_id, contract_type_id, register_number, updated_at, deleted_at, auth_user_id,
  company:companies(id, name, is_parent_company),
  account:accounts(id, name),
  function:label_families!collaborators_function_id_fkey(${FAMILY}),
  group:label_families!collaborators_group_id_fkey(${FAMILY}),
  hierarchies:collaborator_default_hierarchies(hierarchy:label_families(${FAMILY})),
  skills:collaborator_skills(id, ended_at, activity_domain_id, skill:label_families!collaborator_skills_skill_id_fkey(${FAMILY}))
`;

export type CollaboratorFilters = {
  textSearch?: string;
  accounts?: string[];
  authorities?: string[];
  statuses?: string[];
  companies?: string[];
  functions?: string[];
  groups?: string[];
  hierarchies?: string[];
  skills?: string[];
  domains?: string[];
  legals?: string[];
  contracts?: string[];
};

/** Valeur spéciale des filtres « Sans … » / « Compétence(s) expirée(s) ». */
export const NONE = "none";
export const EXPIRED = "expired";

export type CollaboratorListItem = Awaited<ReturnType<typeof listCollaborators>>["items"][number];

export async function listCollaborators(kind: CollaboratorKind, f: CollaboratorFilters) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("collaborators").select(COLLABORATOR_SELECT)
    .eq("kind", kind).order("last_name").order("first_name");
  if (error) throw error;
  const all = data ?? [];
  const showDeleted = f.statuses?.includes("deleted");
  const base = all.filter((c) => (showDeleted ? true : c.status !== "deleted"));

  const match = (values: string[] | undefined, id: string | null) =>
    !values?.length || (id ? values.includes(id) : values.includes(NONE));
  const q = f.textSearch?.trim().toLowerCase();

  const items = base.filter((c) => {
    if (q && ![c.first_name, c.last_name, c.trigram, c.email, c.register_number].some((v) => v?.toLowerCase().includes(q))) return false;
    if (f.accounts?.length && !f.accounts.includes(c.account_id)) return false;
    if (f.authorities?.length && !(c.authority && f.authorities.includes(c.authority))) return false;
    if (f.statuses?.length && !f.statuses.includes(c.status)) return false;
    if (f.companies?.length && !(c.company_id && f.companies.includes(c.company_id))) return false;
    if (!match(f.functions, c.function_id) || !match(f.groups, c.group_id)) return false;
    if (!match(f.legals, c.legal_id) || !match(f.contracts, c.contract_type_id)) return false;
    if (f.hierarchies?.length) {
      const ids = c.hierarchies.map((h) => h.hierarchy?.id).filter(Boolean) as string[];
      if (!(ids.length === 0 ? f.hierarchies.includes(NONE) : ids.some((id) => f.hierarchies!.includes(id)))) return false;
    }
    if (f.skills?.length) {
      const ok = (c.skills.length === 0 && f.skills.includes(NONE))
        || (f.skills.includes(EXPIRED) && c.skills.some((s) => isSkillExpired(s.ended_at)))
        || c.skills.some((s) => s.skill && f.skills!.includes(s.skill.id));
      if (!ok) return false;
    }
    if (f.domains?.length && !c.skills.some((s) => s.activity_domain_id && f.domains!.includes(s.activity_domain_id))) return false;
    return true;
  });
  return { items, total: base.length };
}

type FamilyOpt = { id: string; short_name: string; long_name: string | null; color: string; parent_id: string | null };

/** Options des filtres et des modales collaborateurs. */
export async function getCollaboratorOptions() {
  const supabase = await createClient();
  const families = (nature: "function" | "team" | "legal" | "contract" | "skill" | "activity_domain") =>
    supabase.from("label_families").select("id, short_name, long_name, color, parent_id")
      .eq("kind", "family").eq("nature", nature).eq("relative_nature", "child").eq("active", true).is("deleted_at", null)
      .order("priority").order("short_name");
  const [accounts, companies, fn, team, legal, contract, skill, domain, hierarchy] = await Promise.all([
    supabase.from("accounts").select("id, name").order("name"),
    supabase.from("companies").select("id, name, is_parent_company").order("name"),
    families("function"), families("team"), families("legal"), families("contract"), families("skill"), families("activity_domain"),
    supabase.from("label_families").select("id, short_name, long_name, color, parent_id")
      .eq("kind", "category").eq("nature", "hierarchy").is("project_id", null).eq("active", true).is("deleted_at", null)
      .order("priority").order("short_name"),
  ]);
  const list = (r: { data: FamilyOpt[] | null }) => r.data ?? [];
  return {
    accounts: accounts.data ?? [],
    companies: companies.data ?? [],
    functions: list(fn), groups: list(team), legals: list(legal), contracts: list(contract),
    skills: list(skill), domains: list(domain), hierarchies: list(hierarchy),
  };
}
export type CollaboratorOptions = Awaited<ReturnType<typeof getCollaboratorOptions>>;

export async function listExternalUsers(textSearch?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("external_users").select("*").is("converted_to", null).order("last_name");
  if (error) throw error;
  const all = data ?? [];
  const q = textSearch?.trim().toLowerCase();
  const items = q ? all.filter((u) => [u.first_name, u.last_name, u.email, u.company_name].some((v) => v.toLowerCase().includes(q))) : all;
  return { items, total: all.length };
}
export type ExternalUserItem = Awaited<ReturnType<typeof listExternalUsers>>["items"][number];

export type TabletFilters = {
  textSearch?: string; accounts?: string[]; companies?: string[]; families?: string[];
  natures?: string[]; statuses?: string[]; profileStatuses?: string[];
};

export async function listTablets(f: TabletFilters) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tablets")
    .select(`id, name, nature, status, profile_status, account_id, company_id, family_id, app_version, last_push_at,
      last_latitude, last_longitude, battery_level,
      family:label_families!tablets_family_id_fkey(${FAMILY}), company:companies(id, name), account:accounts(id, name)`)
    .is("deleted_at", null).order("name");
  if (error) throw error;
  const all = data ?? [];
  const q = f.textSearch?.trim().toLowerCase();
  const items = all.filter((x) => {
    if (q && !x.name.toLowerCase().includes(q)) return false;
    if (f.accounts?.length && !f.accounts.includes(x.account_id)) return false;
    if (f.companies?.length && !f.companies.includes(x.company_id)) return false;
    if (f.families?.length && !f.families.includes(x.family_id)) return false;
    if (f.natures?.length && !f.natures.includes(x.nature)) return false;
    if (f.statuses?.length && !f.statuses.includes(x.status)) return false;
    if (f.profileStatuses?.length && !f.profileStatuses.includes(x.profile_status)) return false;
    return true;
  });
  return { items, total: all.length };
}
export type TabletListItem = Awaited<ReturnType<typeof listTablets>>["items"][number];

export async function getTabletFilterOptions() {
  const supabase = await createClient();
  const [accounts, companies, families] = await Promise.all([
    supabase.from("accounts").select("id, name").order("name"),
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("label_families").select("id, short_name, long_name, color")
      .eq("kind", "family").eq("nature", "device").eq("relative_nature", "child").is("deleted_at", null).order("short_name"),
  ]);
  return { accounts: accounts.data ?? [], companies: companies.data ?? [], families: families.data ?? [] };
}

export async function listAuthorizedDevices(textSearch?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("authorized_devices").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  const all = data ?? [];
  const q = textSearch?.trim().toLowerCase();
  const items = q ? all.filter((d) => d.designation.toLowerCase().includes(q) || d.device_id.toLowerCase().includes(q)) : all;
  return { items, total: all.length };
}
export type AuthorizedDeviceItem = Awaited<ReturnType<typeof listAuthorizedDevices>>["items"][number];

export type { Authority, CollaboratorStatus };
