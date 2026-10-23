"use client";

import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import { JOB_ERROR_CODES_CLIENT } from "./codes";

export type JobOutcome = { ok: true; result: Json } | { ok: false; error: string };

const POLL_MS = 1500;
const MAX_MS = 15 * 60 * 1000;

/** Traduit l'erreur brute d'un job en code applicatif connu (ou « job_failed »). */
export function jobErrorCode(error: string | null | undefined): string {
  if (!error) return "job_failed";
  if (error.includes("row-level security") || error.includes("forbidden")) return "forbidden";
  return JOB_ERROR_CODES_CLIENT.find((k) => error.includes(k)) ?? "job_failed";
}

/**
 * Suit un job jusqu'à sa fin (done / failed) par sondage de async_jobs.
 * Indépendant du composant appelant : la modale peut être fermée pendant le traitement.
 */
export function watchJob(jobId: string): Promise<JobOutcome> {
  const supabase = createClient();
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      const { data } = await supabase.from("async_jobs").select("status, result, error").eq("id", jobId).maybeSingle();
      if (data?.status === "done") { resolve({ ok: true, result: data.result ?? {} }); return; }
      if (data?.status === "failed") { resolve({ ok: false, error: jobErrorCode(data.error) }); return; }
      if (Date.now() - started > MAX_MS) { resolve({ ok: false, error: "timeout" }); return; }
      setTimeout(() => void tick(), POLL_MS);
    };
    setTimeout(() => void tick(), 600);
  });
}
