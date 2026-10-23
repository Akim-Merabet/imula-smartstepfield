import "server-only";
import { after } from "next/server";
import type { Json } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type JobKind = "duplicate_project" | "prepare_folder" | "import_referential" | "execute_referential" | "refresh_referential";

/**
 * Met un traitement en file (async_jobs, statut to_do) puis l'exécute après la réponse HTTP (`after()`) :
 * to_do → in_progress (validé tout de suite, visible dans la cloche) → done | failed (public.run_async_job).
 * Le client Supabase de l'utilisateur est réutilisé : la RLS s'applique au traitement.
 */
export async function enqueueJob(supabase: Supabase, job: {
  kind: JobKind; accountId: string; projectId: string | null; requestedBy: string; label: string; params: Record<string, unknown>;
}): Promise<string | null> {
  const { data, error } = await supabase.from("async_jobs").insert({
    account_id: job.accountId, project_id: job.projectId, kind: job.kind, requested_by: job.requestedBy,
    params: { ...job.params, label: job.label } as Json, status: "to_do",
  }).select("id").single();
  if (error || !data) {
    console.error(`[jobs] enqueue ${job.kind} failed: ${error?.message ?? "unknown"}`);
    return null;
  }
  const id = data.id;
  after(async () => {
    try {
      await supabase.from("async_jobs").update({ status: "in_progress" }).eq("id", id).eq("status", "to_do");
      const { error: runError } = await supabase.rpc("run_async_job", { p_job_id: id });
      if (runError) {
        console.error(`[jobs] ${job.kind} ${id} failed: ${runError.message}`);
        await supabase.from("async_jobs").update({ status: "failed", error: runError.message, finished_at: new Date().toISOString() })
          .eq("id", id).in("status", ["to_do", "in_progress"]);
      }
    } catch (err) {
      console.error(`[jobs] ${job.kind} ${id} crashed: ${err instanceof Error ? err.message : "error"}`);
    }
  });
  return id;
}
