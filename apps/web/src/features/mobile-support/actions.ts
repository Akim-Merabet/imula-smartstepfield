"use server";

import { decryptBackup } from "@imula/backup-core";
import { authorize, fail, ok, type ActionResult } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * « Télécharger » une sauvegarde : déchiffrée sur le serveur avec la clé privée de l'organisation (qui ne quitte
 * jamais le serveur) et renvoyée en JSON : tables locales du profil et écritures non encore envoyées.
 */
export async function downloadMobileBackup(id: string): Promise<ActionResult<{ fileName: string; json: string }>> {
  const auth = await authorize("SettingsBackups", "read");
  if ("error" in auth) return fail(auth.error);
  // Lecture sous RLS : seule une sauvegarde de l'organisation de l'admin est accessible.
  const supabase = await createClient();
  const { data: backup } = await supabase.from("mobile_backups").select("organization_id, storage_path, created_at").eq("id", id).maybeSingle();
  if (!backup) return fail("not_found");
  const admin = createAdminClient();
  const [{ data: file }, { data: secret }] = await Promise.all([
    admin.storage.from("mobile-backups").download(backup.storage_path),
    admin.rpc("backup_secret_key", { p_organization_id: backup.organization_id }),
  ]);
  if (!file || !secret) return fail("not_found");
  try {
    const content = decryptBackup(new Uint8Array(await file.arrayBuffer()), secret);
    const json = JSON.stringify(JSON.parse(new TextDecoder().decode(content)), null, 2);
    return ok({ fileName: `sauvegarde-${backup.created_at.slice(0, 19).replace(/[:T]/g, "-")}.json`, json });
  } catch {
    return fail("corrupted");
  }
}
