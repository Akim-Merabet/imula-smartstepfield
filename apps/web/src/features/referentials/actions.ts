"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { authorize, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { contentDbError } from "@/features/flows/server-utils";
import { enqueueJob } from "@/features/jobs/server";

type JobStarted = { jobId: string };

const revalidate = (projectId: string) => {
  revalidatePath(`/explore/projects/${projectId}/dashboard/flow-referential`, "layout");
  revalidatePath(`/explore/projects/${projectId}/dashboard/flow-management`, "layout");
};

async function flowProject(flowId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("flows").select("project_id, account_id").eq("id", flowId).maybeSingle();
  return data ?? null;
}

/**
 * Importer depuis une entité référentiel (≤ 10 flows « en préparation ») — traitement en tâche de fond
 * (async_jobs + after()) ; le client suit le job puis rafraîchit la liste.
 */
export async function importReferentials(projectId: string, flowIds: string[], updateExisting: boolean): Promise<ActionResult<JobStarted>> {
  const auth = await authorize("FlowReferential", "import", projectId);
  if ("error" in auth) return fail(auth.error);
  const ids = z.array(z.string().uuid()).min(1).safeParse(flowIds);
  if (!ids.success) return fail("no_selection");
  if (ids.data.length > 10) return fail("size_limit");
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("account_id, type").eq("id", projectId).maybeSingle();
  if (!project) return fail("not_found");
  if (project.type !== "project" && project.type !== "pgac") return fail("invalid_target");
  const t = await getTranslations("referentials.jobs");
  const jobId = await enqueueJob(supabase, {
    kind: "import_referential", accountId: project.account_id, projectId, requestedBy: auth.session.collaborator.id,
    label: t("import", { count: ids.data.length }), params: { flow_ids: ids.data, update_existing: updateExisting },
  });
  return jobId ? ok({ jobId }) : fail("unknown");
}

/** Exécuter un ou plusieurs référentiels (n copies chacun) — tâche de fond. */
export async function executeReferentials(flowIds: string[], copies: number, resetInternal: boolean): Promise<ActionResult<JobStarted>> {
  if (!flowIds.length || flowIds.length > 10) return fail(flowIds.length ? "size_limit" : "no_selection");
  if (!Number.isInteger(copies) || copies < 1 || copies > 50) return fail("invalid_copies");
  const first = await flowProject(flowIds[0]);
  if (!first) return fail("not_found");
  for (const id of flowIds) {
    const flow = id === flowIds[0] ? first : await flowProject(id);
    if (!flow || flow.project_id !== first.project_id) return fail("not_found");
  }
  const auth = await authorize("FlowReferential", "executeFlowRef", first.project_id);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const t = await getTranslations("referentials.jobs");
  const jobId = await enqueueJob(supabase, {
    kind: "execute_referential", accountId: first.account_id, projectId: first.project_id, requestedBy: auth.session.collaborator.id,
    label: t("execute", { count: flowIds.length }), params: { flow_ids: flowIds, copies, reset_internal: resetInternal },
  });
  return jobId ? ok({ jobId }) : fail("unknown");
}

/** Mettre à jour des référentiels importés depuis leur source (contenu écrasé) — tâche de fond. */
export async function refreshReferentials(flowIds: string[]): Promise<ActionResult<JobStarted>> {
  if (!flowIds.length) return fail("no_selection");
  const first = await flowProject(flowIds[0]);
  if (!first) return fail("not_found");
  const auth = await authorize("FlowReferential", "edit", first.project_id);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const t = await getTranslations("referentials.jobs");
  const jobId = await enqueueJob(supabase, {
    kind: "refresh_referential", accountId: first.account_id, projectId: first.project_id, requestedBy: auth.session.collaborator.id,
    label: t("refresh", { count: flowIds.length }), params: { flow_ids: flowIds },
  });
  return jobId ? ok({ jobId }) : fail("unknown");
}

/** Débloquer : plus aucune mise à jour possible, contenu éditable. */
export async function unlockReferential(flowId: string, resetInternal: boolean): Promise<ActionResult> {
  const projectId = (await flowProject(flowId))?.project_id;
  if (!projectId) return fail("not_found");
  const auth = await authorize("FlowReferential", "unlock", projectId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("unlock_referential_flow", { p_flow_id: flowId, p_reset_internal: resetInternal });
  if (error) return fail(contentDbError(error));
  revalidate(projectId);
  revalidatePath(`/explore/projects/${projectId}/flow/${flowId}`, "layout");
  return ok(undefined);
}
