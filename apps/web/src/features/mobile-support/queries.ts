import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Sauvegardes déposées par les appareils (RLS : admin Siteflow de l'organisation). */
export async function listMobileBackups() {
  const supabase = await createClient();
  const { data } = await supabase.from("mobile_backups")
    .select("id, created_at, trigger, device_id, size, app_version, principal:collaborators!mobile_backups_principal_id_fkey(first_name, last_name, kind)")
    .order("created_at", { ascending: false }).limit(500);
  return data ?? [];
}
export type MobileBackupRow = Awaited<ReturnType<typeof listMobileBackups>>[number];

/** Journal d'actions des appareils (« Logs push »), filtrable par action et par profil. */
export async function listMobileLogs(f: { actions: string[]; principals: string[] }) {
  const supabase = await createClient();
  let q = supabase.from("mobile_log_entries")
    .select("id, occurred_at, received_at, action, detail, device_id, app_version, principal_id, principal:collaborators!mobile_log_entries_principal_id_fkey(first_name, last_name)")
    .order("occurred_at", { ascending: false }).limit(1000);
  if (f.actions.length) q = q.in("action", f.actions);
  if (f.principals.length) q = q.in("principal_id", f.principals);
  const { data } = await q;
  return data ?? [];
}
export type MobileLogRow = Awaited<ReturnType<typeof listMobileLogs>>[number];
