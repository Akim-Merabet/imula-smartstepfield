"use server";

import { authorize, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { scheduleDocumentGeneration } from "./pdf/trigger";

/**
 * Contrat avec le module de génération PDF : met en file une tâche `background_tasks`
 * (kind = 'document_generation', file_type = 'pdf', status = 'acknowledged',
 *  metadata = { document_version_id, document_id, action, ...extra }).
 * Le worker PDF consomme ces tâches puis appelle `public.document_complete_generation(task_id, path, size, error)`
 * (rôle service) qui fige le PDF sur la ligne de suivi pour les actions freeze / regenerate / refresh_*.
 */
export type GenerationAction =
  | "preview" | "freeze" | "regenerate" | "refresh_config" | "refresh_last_index" | "without_field_data"
  | "closing_folder" | "closing_section";

export async function enqueueDocumentGeneration(versionId: string, action: GenerationAction = "preview", extra: Record<string, unknown> = {}):
  Promise<ActionResult<{ taskId: string }>> {
  const supabase = await createClient();
  const { data: version } = await supabase.from("document_versions").select("document:documents(project_id, nature, scope)").eq("id", versionId).maybeSingle();
  const doc = version?.document as { project_id: string | null; nature: string; scope: string } | null;
  if (!doc) return fail("not_found");
  const auth = await authorize(doc.nature === "rfi" ? "DashboardClosingFolder" : "DashboardDocuments", "edit", doc.project_id);
  if ("error" in auth) return fail(auth.error);
  const { data, error } = await supabase.rpc("document_enqueue_generation", { p_version_id: versionId, p_action: action, p_extra: extra as Json });
  if (error || !data) return fail(error?.message ?? "unknown");
  scheduleDocumentGeneration([data]);
  return ok({ taskId: data });
}
