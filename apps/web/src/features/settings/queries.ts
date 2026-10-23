import "server-only";
import { createClient } from "@/lib/supabase/server";

const like = (q?: string) => (q ? `%${q.replace(/[%,()]/g, " ")}%` : null);

export async function listClients(textSearch?: string) {
  const supabase = await createClient();
  const { count: total } = await supabase.from("clients").select("id", { count: "exact", head: true });
  let query = supabase.from("clients").select("id, name, name_2, address, zip_code, city, country, updated_at").order("name");
  const q = like(textSearch);
  if (q) query = query.or(`name.ilike.${q},city.ilike.${q},zip_code.ilike.${q}`);
  const { data } = await query;
  return { items: data ?? [], total: total ?? 0 };
}

export async function listCompanies(textSearch?: string) {
  const supabase = await createClient();
  const { count: total } = await supabase.from("companies").select("id", { count: "exact", head: true });
  let query = supabase.from("companies").select("id, name, activity_area, comment, is_parent_company").order("is_parent_company", { ascending: false }).order("name");
  const q = like(textSearch);
  if (q) query = query.or(`name.ilike.${q},activity_area.ilike.${q}`);
  const { data } = await query;
  return { items: data ?? [], total: total ?? 0 };
}

export type FamilyRow = {
  id: string; kind: "family" | "category"; nature: string; relative_nature: "parent" | "child"; parent_id: string | null;
  short_name: string; long_name: string | null; code: string | null; color: string; priority: number; active: boolean;
  provenance: "default" | "entity" | null; client_supervision: boolean; client_supervision_sub_index: boolean;
  default_source_id: string | null;
};

/** Familles (organisation) ou catégories (par défaut du compte, ou locales à une entité). */
export async function listFamilies(kind: "family" | "category", projectId: string | null = null): Promise<FamilyRow[]> {
  const supabase = await createClient();
  let query = supabase.from("label_families")
    .select("id, kind, nature, relative_nature, parent_id, short_name, long_name, code, color, priority, active, provenance, client_supervision, client_supervision_sub_index, default_source_id")
    .eq("kind", kind).is("deleted_at", null).order("priority").order("short_name");
  query = projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
  const { data } = await query;
  return (data ?? []) as FamilyRow[];
}

export async function listStatuses(nature: string, state: "all" | "active" | "inactive") {
  const supabase = await createClient();
  let query = supabase.from("custom_statuses")
    .select("id, nature, name, description, color, category, link_type, is_default, downloadable, importable, exportable, hide_entity, active, sort_order, family:label_families(id, short_name, long_name, color, relative_nature)")
    .eq("nature", nature as never).order("sort_order").order("name");
  const { count: total } = await supabase.from("custom_statuses").select("id", { count: "exact", head: true }).eq("nature", nature as never);
  if (state !== "all") query = query.eq("active", state === "active");
  const { data } = await query;
  return { items: data ?? [], total: total ?? 0 };
}
export type StatusRow = Awaited<ReturnType<typeof listStatuses>>["items"][number];

export async function listCustomFields(nature: string, state: "all" | "active" | "inactive") {
  const supabase = await createClient();
  let query = supabase.from("custom_fields")
    .select("id, nature, type, name, link_type, required, read_only, variable_name, active, sort_order, family:label_families(id, short_name, long_name, color, relative_nature)")
    .eq("nature", nature as never).is("deleted_at", null).order("sort_order").order("name");
  const { count: total } = await supabase.from("custom_fields").select("id", { count: "exact", head: true }).eq("nature", nature as never).is("deleted_at", null);
  if (state !== "all") query = query.eq("active", state === "active");
  const { data } = await query;
  return { items: data ?? [], total: total ?? 0 };
}
export type CustomFieldRow = Awaited<ReturnType<typeof listCustomFields>>["items"][number];

export async function listReferences(natures: string[]) {
  const supabase = await createClient();
  const { count: total } = await supabase.from("reference_rules").select("id", { count: "exact", head: true });
  let query = supabase.from("reference_rules")
    .select("id, nature, field, link_type, nomenclature, counter_type, counter_format, start_value, active, family:label_families(id, short_name, long_name, color)")
    .order("nature").order("field");
  if (natures.length) query = query.in("nature", natures as never[]);
  const { data } = await query;
  return { items: data ?? [], total: total ?? 0 };
}
export type ReferenceRow = Awaited<ReturnType<typeof listReferences>>["items"][number];

export async function listBackgroundTasks(statuses: string[]) {
  const supabase = await createClient();
  const { count: total } = await supabase.from("background_tasks").select("id", { count: "exact", head: true });
  let query = supabase.from("background_tasks")
    .select("id, kind, file_type, name, status, attempts, created_at, started_at, finished_at, user:collaborators(first_name, last_name), project:projects(designation)")
    .order("created_at", { ascending: false }).limit(500);
  if (statuses.length) query = query.in("status", statuses as never[]);
  const { data } = await query;
  return { items: data ?? [], total: total ?? 0 };
}
export type BackgroundTaskRow = Awaited<ReturnType<typeof listBackgroundTasks>>["items"][number];
