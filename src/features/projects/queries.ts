import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { PROJECTS_PAGE_SIZE, type ProjectType } from "./meta";

export type ProjectFilters = {
  textSearch?: string;
  types?: ProjectType[];
  state?: "visible" | "hidden" | "all";
  families?: string[];
  clients?: string[];
  statuses?: string[];
  sharing?: "public" | "private" | "all";
  limit?: number;
};

const LIST_SELECT = `
  id, type, designation, business_ref, contract_ref, location_label, description, published, archived,
  internal_command, external_command, market_number, technical_deal, keywords, business_domain,
  national_program, complement_ref_1, complement_ref_2, project_index, is_sub_folder, folder_id, account_id, updated_at,
  family:label_families!projects_family_id_fkey(id, short_name, long_name, color),
  status:custom_statuses!projects_custom_status_id_fkey(id, name, color, category, hide_entity),
  client:clients(id, name),
  account:accounts(id, name),
  members:project_members(role, collaborator:collaborators(id, first_name, last_name))
`;

export type ProjectListItem = Awaited<ReturnType<typeof listProjects>>["items"][number];

export function isProjectHidden(p: { archived: boolean; status: { category: string; hide_entity: boolean } | null }) {
  return p.archived || (!!p.status?.hide_entity && p.status.category === "done");
}

export async function listProjects(filters: ProjectFilters) {
  const supabase = await createClient();
  const limit = filters.limit ?? PROJECTS_PAGE_SIZE;
  let query = supabase
    .from("projects")
    .select(LIST_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .eq("is_sub_folder", false)
    .order("updated_at", { ascending: false });

  if (filters.textSearch) {
    const q = filters.textSearch.replace(/[%,()]/g, " ");
    query = query.or(`designation.ilike.%${q}%,business_ref.ilike.%${q}%,location_label.ilike.%${q}%`);
  }
  if (filters.types?.length) query = query.in("type", filters.types);
  if (filters.families?.length) query = query.in("family_id", filters.families);
  if (filters.clients?.length) query = query.in("client_id", filters.clients);
  if (filters.statuses?.length) query = query.in("custom_status_id", filters.statuses);
  if (filters.sharing === "public") query = query.eq("published", true);
  if (filters.sharing === "private") query = query.eq("published", false);

  const { data, count, error } = await query.range(0, limit * 4 - 1);
  if (error) throw error;

  const state = filters.state ?? "visible";
  const items = (data ?? []).filter((p) =>
    state === "all" ? true : state === "hidden" ? isProjectHidden(p) : !isProjectHidden(p),
  );
  return { items: items.slice(0, limit), total: count ?? items.length, hasMore: items.length > limit };
}

export type ProjectDetail = Tables<"projects"> & {
  family: Pick<Tables<"label_families">, "id" | "short_name" | "long_name" | "color"> | null;
  status: Pick<Tables<"custom_statuses">, "id" | "name" | "color"> | null;
  client: Pick<Tables<"clients">, "id" | "name"> | null;
};

/** Entité + rôle de l'utilisateur courant (null si RLS refuse ou introuvable). */
export async function getProject(projectId: string, collaboratorId: string) {
  const supabase = await createClient();
  const [{ data: project }, { data: member }] = await Promise.all([
    supabase.from("projects")
      .select(`*, family:label_families!projects_family_id_fkey(id, short_name, long_name, color),
               status:custom_statuses!projects_custom_status_id_fkey(id, name, color),
               client:clients(id, name)`)
      .eq("id", projectId).is("deleted_at", null).maybeSingle(),
    supabase.from("project_members").select("role").eq("project_id", projectId).eq("collaborator_id", collaboratorId).maybeSingle(),
  ]);
  if (!project) return null;
  return { project: project as ProjectDetail, role: member?.role ?? null };
}

/** Options des filtres de la liste des entités. */
export async function getProjectFilterOptions() {
  const supabase = await createClient();
  const [families, clients, statuses] = await Promise.all([
    supabase.from("label_families").select("id, short_name, long_name, color, parent_id")
      .eq("kind", "family").eq("nature", "project").eq("relative_nature", "child").eq("active", true).is("deleted_at", null)
      .order("priority").order("short_name"),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("custom_statuses").select("id, name, color").eq("nature", "project").eq("active", true).order("sort_order"),
  ]);
  return { families: families.data ?? [], clients: clients.data ?? [], statuses: statuses.data ?? [] };
}
