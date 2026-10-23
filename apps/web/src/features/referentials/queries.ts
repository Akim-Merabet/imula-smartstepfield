import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FlowType } from "@/features/flows/meta";

type Fam = { id: string; short_name: string; long_name: string | null; color: string } | null;

export type ReferentialFlow = {
  id: string; flow_type: FlowType; name: string; ref_int: string | null; unlocked: boolean; sourced_from_index: string | null;
  sourced_from_flow_id: string | null; family_id: string | null; category_id: string | null; custom_status_id: string | null;
  family: Fam; category: Fam; status: { id: string; name: string; color: string } | null;
  source: { id: string; name: string; updated_at: string; content_updated_at: string | null; project: { id: string; designation: string } | null } | null;
  lastImport: string | null; updateAvailable: boolean; executions: number;
};

/** Flows référentiels importés dans l'entité (origin = derived_from_standard). */
export async function listReferentialFlows(projectId: string): Promise<ReferentialFlow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("flows").select(`
      id, flow_type, name, ref_int, unlocked, sourced_from_index, sourced_from_flow_id, family_id, category_id, custom_status_id,
      family:label_families!flows_family_id_fkey(id, short_name, long_name, color),
      category:label_families!flows_category_id_fkey(id, short_name, long_name, color),
      status:custom_statuses!flows_custom_status_id_fkey(id, name, color),
      imports:flow_content_imports!flow_content_imports_flow_id_fkey(imported_at)`)
    .eq("project_id", projectId).eq("origin", "derived_from_standard").is("deleted_at", null).order("name");
  if (error) throw error;
  const ids = (data ?? []).map((f) => f.id);
  const { data: executed } = ids.length
    ? await supabase.from("flows").select("executed_from_flow_id").in("executed_from_flow_id", ids).is("deleted_at", null)
    : { data: [] };
  const sourceIds = [...new Set((data ?? []).flatMap((f) => (f.sourced_from_flow_id ? [f.sourced_from_flow_id] : [])))];
  const { data: sources } = sourceIds.length
    ? await supabase.from("flows").select("id, name, updated_at, content_updated_at, project:projects!flows_project_id_fkey(id, designation)").in("id", sourceIds)
    : { data: [] };
  const sourceById = new Map((sources ?? []).map((s) => [s.id, s as unknown as NonNullable<ReferentialFlow["source"]>]));
  const execCount = new Map<string, number>();
  for (const e of executed ?? []) if (e.executed_from_flow_id) execCount.set(e.executed_from_flow_id, (execCount.get(e.executed_from_flow_id) ?? 0) + 1);
  return (data ?? []).map((row) => {
    const f = { ...(row as unknown as Omit<ReferentialFlow, "lastImport" | "updateAvailable" | "executions" | "source"> & { imports: { imported_at: string }[] }),
      source: row.sourced_from_flow_id ? sourceById.get(row.sourced_from_flow_id) ?? null : null };
    const lastImport = f.imports.map((i) => i.imported_at).sort().at(-1) ?? null;
    const srcChanged = f.source ? [f.source.updated_at, f.source.content_updated_at].filter(Boolean).sort().at(-1) ?? null : null;
    const { imports, ...rest } = f;
    void imports;
    return { ...rest, lastImport, executions: execCount.get(f.id) ?? 0,
      updateAvailable: !f.unlocked && !!lastImport && !!srcChanged && srcChanged > lastImport };
  });
}
