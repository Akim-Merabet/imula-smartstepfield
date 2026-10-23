import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { HierarchyOption } from "./components/hierarchy-picker";

/**
 * Catégories de nature Hiérarchie utilisables dans une entité : catégories locales de l'entité
 * puis catégories par défaut (project_id null). Enfants libellés « parent / enfant ».
 */
export async function loadHierarchyOptions(supabase: SupabaseClient<Database>, projectId: string): Promise<HierarchyOption[]> {
  const { data } = await supabase.from("label_families")
    .select("id, short_name, long_name, color, parent_id, project_id, priority")
    .eq("kind", "category").eq("nature", "hierarchy").eq("active", true).is("deleted_at", null)
    .or(`project_id.eq.${projectId},project_id.is.null`)
    .order("priority").order("short_name");
  const rows = data ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const name = (r: { short_name: string; long_name: string | null }) => (r.long_name ? `${r.short_name} - ${r.long_name}` : r.short_name);
  return rows
    .sort((a, b) => Number(!!b.project_id) - Number(!!a.project_id))
    .map((r) => {
      const parent = r.parent_id ? byId.get(r.parent_id) : null;
      return { id: r.id, color: r.color, label: parent ? `${parent.short_name} / ${name(r)}` : name(r) };
    });
}
