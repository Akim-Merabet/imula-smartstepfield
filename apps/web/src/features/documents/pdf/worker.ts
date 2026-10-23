/**
 * Worker de génération documentaire : consomme `background_tasks` (kind = 'document_generation').
 * Statuts : acknowledged → in_progress → done | error ; échec transitoire → to_retry (3 tentatives).
 * Le PDF est déposé dans le bucket `documents`, puis `document_complete_generation` clôt la tâche
 * (et fige le PDF sur la ligne de suivi pour freeze / regenerate / refresh_*).
 * Journalisation minimale : identifiant de tâche, statut, nombre de pages — jamais de contenu métier.
 */
import type { Tables } from "@/lib/supabase/database.types";
import { generateDocumentPdf, type GenerationAction } from "./generate";
import { createWorkerClient, type DB } from "./service-client";

export const DOCUMENT_TASK_KIND = "document_generation";
export const MAX_ATTEMPTS = 3;
/** Une tâche « en cours » depuis plus longtemps est considérée comme abandonnée (worker arrêté). */
export const STALE_AFTER_MS = 15 * 60_000;

type Task = Tables<"background_tasks">;
const FREEZING = new Set(["freeze", "regenerate", "refresh_config", "refresh_last_index"]);

const log = (msg: string) => console.info(`[document-worker] ${msg}`);

/** Prise de la tâche avec contrôle optimiste (statut + nombre de tentatives inchangés). */
async function claim(db: DB, task: Pick<Task, "id" | "status" | "attempts">): Promise<Task | null> {
  if (task.status !== "acknowledged" && task.status !== "to_retry") return null;
  const { data } = await db.from("background_tasks")
    .update({ status: "in_progress", started_at: new Date().toISOString(), attempts: task.attempts + 1, error: null })
    .eq("id", task.id).eq("status", task.status).eq("attempts", task.attempts)
    .select("*").maybeSingle();
  return data ?? null;
}

function errorCode(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Codes courts uniquement (pas de données dans le message d'erreur persisté).
  return /^[a-z_]{3,40}$/.test(msg) ? msg : "generation_failed";
}

/** Traite une tâche déjà réclamée. */
async function run(db: DB, task: Task): Promise<"done" | "error" | "retry"> {
  const meta = (task.metadata ?? {}) as Record<string, unknown>;
  const versionId = typeof meta.document_version_id === "string" ? meta.document_version_id : null;
  const action = (typeof meta.action === "string" ? meta.action : "preview") as GenerationAction;
  try {
    if (!versionId) throw new Error("missing_version");
    let uiLocale: "fr" | "en" = "fr";
    if (task.user_id) {
      const { data: me } = await db.from("collaborators").select("language").eq("id", task.user_id).maybeSingle();
      if (me?.language === "en") uiLocale = "en";
    }
    const pdf = await generateDocumentPdf(db, versionId, action, meta, { uiLocale, serviceDb: db });
    if (!pdf) throw new Error("nothing_to_generate");
    const { data: v } = await db.from("document_versions").select("id, document_id, document:documents(project_id)").eq("id", versionId).maybeSingle();
    const projectId = (v?.document as { project_id: string | null } | null)?.project_id ?? task.project_id;
    if (!v || !projectId) throw new Error("not_found");
    const stamp = Date.now().toString(36);
    const path = `projects/${projectId}/${v.document_id}/${v.id}/${action}-${stamp}-${pdf.fileName}`;
    const { error: upErr } = await db.storage.from("documents").upload(path, pdf.bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error("upload_failed");
    const { error: rpcErr } = await db.rpc("document_complete_generation", { p_task_id: task.id, p_path: path, p_size: pdf.bytes.byteLength });
    if (rpcErr) throw new Error("complete_failed");
    await db.from("background_tasks").update({ metadata: { ...meta, page_count: pdf.pageCount, file_name: pdf.fileName, warnings: pdf.warnings } }).eq("id", task.id);
    if (FREEZING.has(action)) await db.from("document_versions").update({ pdf_name: pdf.fileName }).eq("id", versionId);
    log(`task ${task.id} done (${pdf.pageCount} pages, ${action})`);
    return "done";
  } catch (err) {
    const code = errorCode(err);
    if (code !== "generation_failed" || !(err instanceof Error)) log(`task ${task.id} failed: ${code}`);
    else log(`task ${task.id} failed: ${code} (${err.name})`);
    if (task.attempts < MAX_ATTEMPTS && !["missing_version", "nothing_to_generate", "not_found"].includes(code)) {
      await db.from("background_tasks").update({ status: "to_retry", error: code }).eq("id", task.id);
      return "retry";
    }
    await db.rpc("document_complete_generation", { p_task_id: task.id, p_path: "", p_size: 0, p_error: code });
    return "error";
  }
}

/** Remet en file les tâches « en cours » abandonnées. */
export async function requeueStaleTasks(db: DB): Promise<number> {
  const limit = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data } = await db.from("background_tasks").update({ status: "to_retry", error: "stale" })
    .eq("kind", DOCUMENT_TASK_KIND).eq("status", "in_progress").lt("started_at", limit).select("id");
  return data?.length ?? 0;
}

/**
 * Vide la file (au plus `max` tâches). `taskIds` : ne traiter que ces tâches (déclenchement immédiat).
 * Renvoie le nombre de tâches traitées.
 */
export async function drainDocumentQueue(opts: { db?: DB; max?: number; taskIds?: string[] } = {}): Promise<number> {
  const db = opts.db ?? createWorkerClient();
  let q = db.from("background_tasks").select("id, status, attempts").eq("kind", DOCUMENT_TASK_KIND)
    .in("status", ["acknowledged", "to_retry"]).order("created_at").limit(opts.max ?? 10);
  if (opts.taskIds?.length) q = q.in("id", opts.taskIds);
  const { data: pending } = await q;
  let done = 0;
  for (const p of pending ?? []) {
    const task = await claim(db, p);
    if (!task) continue;
    await run(db, task);
    done += 1;
  }
  return done;
}
