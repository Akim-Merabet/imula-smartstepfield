"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

const nameSchema = z.string().trim().min(1).max(255);
const revalidate = (projectId: string) => revalidatePath(`/explore/projects/${projectId}/dashboard/flow-management/vue-diagram`);

async function diagramRow(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("diagrams").select("id, project_id, document_id, read_only").eq("id", id).maybeSingle();
  return data;
}

export async function createDiagram(projectId: string, name: string): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("FlowManagementDiagram", "add", projectId);
  if ("error" in auth) return fail(auth.error);
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return fail("invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.from("diagrams")
    .insert({ project_id: projectId, name: parsed.data, kind: "local", config: { nodes: [], edges: [] } }).select("id").single();
  if (error || !data) return fail(dbError(error));
  revalidate(projectId);
  return ok({ id: data.id });
}

export async function renameDiagram(id: string, name: string): Promise<ActionResult> {
  const d = await diagramRow(id);
  if (!d) return fail("not_found");
  const auth = await authorize("FlowManagementDiagram", "edit", d.project_id);
  if ("error" in auth) return fail(auth.error);
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return fail("invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("diagrams").update({ name: parsed.data }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidate(d.project_id);
  return ok(undefined);
}

/** Suppression interdite si le diagramme est associé à un document (§3.5). */
export async function deleteDiagram(id: string): Promise<ActionResult> {
  const d = await diagramRow(id);
  if (!d) return fail("not_found");
  const auth = await authorize("FlowManagementDiagram", "delete", d.project_id);
  if ("error" in auth) return fail(auth.error);
  if (d.document_id) return fail("linked_document");
  const supabase = await createClient();
  const { error } = await supabase.from("diagrams").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidate(d.project_id);
  return ok(undefined);
}

/** Enregistre le modèle (nœuds / liens) et synchronise diagram_flows (bloque la suppression des flows présents). */
export async function saveDiagram(id: string, config: { nodes: unknown[]; edges: unknown[] }, flowIds: string[]): Promise<ActionResult> {
  const d = await diagramRow(id);
  if (!d) return fail("not_found");
  const auth = await authorize("FlowManagementDiagram", "edit", d.project_id);
  if ("error" in auth) return fail(auth.error);
  if (d.read_only) return fail("read_only");
  if (!Array.isArray(config?.nodes) || !Array.isArray(config?.edges) || JSON.stringify(config).length > 4_000_000) return fail("invalid");
  const ids = [...new Set(flowIds.filter((x) => z.string().uuid().safeParse(x).success))];
  const supabase = await createClient();
  if (ids.length) {
    const { data: valid } = await supabase.from("flows").select("id").eq("project_id", d.project_id).in("id", ids);
    if ((valid ?? []).length !== ids.length) return fail("invalid");
  }
  const { error } = await supabase.from("diagrams").update({ config: config as unknown as Json }).eq("id", id);
  if (error) return fail(dbError(error));
  const { data: current } = await supabase.from("diagram_flows").select("flow_id").eq("diagram_id", id);
  const before = new Set((current ?? []).map((r) => r.flow_id));
  const toAdd = ids.filter((x) => !before.has(x));
  const toRemove = [...before].filter((x) => !ids.includes(x));
  if (toRemove.length) {
    const { error: e } = await supabase.from("diagram_flows").delete().eq("diagram_id", id).in("flow_id", toRemove);
    if (e) return fail(dbError(e));
  }
  if (toAdd.length) {
    const { error: e } = await supabase.from("diagram_flows").insert(toAdd.map((flow_id) => ({ diagram_id: id, flow_id })));
    if (e) return fail(dbError(e));
  }
  if (toAdd.length || toRemove.length) revalidatePath(`/explore/projects/${d.project_id}/dashboard/flow-management`, "layout");
  return ok(undefined);
}
