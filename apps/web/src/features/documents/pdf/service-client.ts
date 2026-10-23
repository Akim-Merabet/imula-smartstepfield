import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type DB = SupabaseClient<Database>;

/**
 * Client service du worker PDF (contourne la RLS : les tâches ont été mises en file après contrôle des droits).
 * Volontairement sans `server-only` pour être chargé par le script `scripts/document-worker.ts` (tsx) ;
 * n'est importé que par du code serveur.
 */
export function createWorkerClient(): DB {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("missing_supabase_env");
  return createSupabaseClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
