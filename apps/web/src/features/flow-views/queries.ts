import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type { FlowType } from "@/features/flows/meta";

const VIEW_SELECT = `
  id, flow_type, name, ref_int, family_id, category_id, custom_status_id, reporter_id, origin, unlocked,
  start_date, finish_date, estimated_start_date, estimated_end_date, achieved_start_date, achieved_end_date, bar_color,
  family:label_families!flows_family_id_fkey(id, short_name, long_name, color),
  category:label_families!flows_category_id_fkey(id, short_name, long_name, color),
  status:custom_statuses!flows_custom_status_id_fkey(id, name, color, category),
  reporter:collaborators!flows_reporter_id_fkey(id, first_name, last_name, trigram),
  tablet1:tablets!flows_tablet_1_id_fkey(id, name),
  assignees:flow_assignees(collaborator:collaborators(id, first_name, last_name, trigram))
`;

type Fam = { id: string; short_name: string; long_name: string | null; color: string } | null;
type Person = { id: string; first_name: string; last_name: string; trigram: string };

export type ViewFlow = {
  id: string; flow_type: FlowType; name: string; ref_int: string | null;
  family_id: string | null; category_id: string | null; custom_status_id: string | null; reporter_id: string | null;
  origin: "local" | "derived_from_standard"; unlocked: boolean;
  start_date: string | null; finish_date: string | null;
  estimated_start_date: string | null; estimated_end_date: string | null;
  achieved_start_date: string | null; achieved_end_date: string | null; bar_color: string | null;
  family: Fam; category: Fam;
  status: { id: string; name: string; color: string; category: string } | null;
  reporter: Person | null;
  tablet1: { id: string; name: string } | null;
  assignees: { collaborator: Person | null }[];
};

/** Flows actifs de l'entité, avec les champs utiles aux vues kanban, plan, carte et diagramme. */
export async function listViewFlows(projectId: string): Promise<ViewFlow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("flows").select(VIEW_SELECT)
    .eq("project_id", projectId).is("deleted_at", null).order("name").limit(2000);
  if (error) throw error;
  return (data ?? []) as unknown as ViewFlow[];
}

export async function listFlowGeometries(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("flow_geometries").select("*").eq("project_id", projectId).order("created_at");
  return data ?? [];
}

export async function listGeoJsonLayers(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("project_geojson_layers").select("*").eq("project_id", projectId).order("created_at");
  return data ?? [];
}

export async function listPlans(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("plans").select("*").eq("project_id", projectId).order("created_at");
  return data ?? [];
}

export async function getPlanDetail(planId: string) {
  const supabase = await createClient();
  const [elements, links, milestones] = await Promise.all([
    supabase.from("plan_elements").select("id, flow_id").eq("plan_id", planId),
    supabase.from("plan_element_links").select("id, from_element_id, to_element_id, dependency_type").eq("plan_id", planId),
    supabase.from("plan_milestones").select("*").eq("plan_id", planId).order("date"),
  ]);
  return { elements: elements.data ?? [], links: links.data ?? [], milestones: milestones.data ?? [] };
}

export type DiagramRow = { id: string; name: string; config: Json; document_id: string | null; read_only: boolean };

export async function listDiagrams(projectId: string): Promise<DiagramRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("diagrams").select("id, name, config, document_id, read_only")
    .eq("project_id", projectId).eq("kind", "local").order("created_at");
  return data ?? [];
}

/** Phases / étapes des flows (décomposition des cartes du diagramme). */
export async function listFlowsStructure(flowIds: string[]) {
  if (!flowIds.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("phases")
    .select("id, flow_id, position, custom_number, exclude_numbering, name, disabled, steps(id, position, custom_number, exclude_numbering, name, disabled)")
    .in("flow_id", flowIds).order("position");
  return data ?? [];
}
