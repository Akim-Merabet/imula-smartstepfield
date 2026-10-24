import type { AbstractPowerSyncDatabase } from "@powersync/react-native";
import { randomUUID } from "expo-crypto";

import { config } from "@/config";
import { getDeviceId } from "@/lib/device";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/session/profiles";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Erreur liée au contenu (classes Postgres 22 « donnée » et 23 « contrainte », dont le doublon 23505), pas à l'accès. */
const isDataError = (code: string | undefined) => !!code && /^2[23]/.test(code);

/** Envoie le journal local par lots (« Logs push ») puis l'efface ; un doublon (rejeu) vaut succès. */
export async function flushLogs(db: AbstractPowerSyncDatabase, profile: Profile): Promise<void> {
  const deviceId = await getDeviceId().catch(() => null);
  for (let batch = 0; batch < 10; batch++) {
    const rows = await db.getAll<{ id: string; action: string; detail: string | null; occurred_at: string }>(
      "select id, action, detail, occurred_at from app_logs order by occurred_at limit 200");
    if (!rows.length) return;
    const entries = rows.map((r) => ({
      // Entrées des versions qui n'écrivaient pas d'UUID : un identifiant valide est attribué à l'envoi.
      id: UUID.test(r.id) ? r.id : randomUUID(), organization_id: profile.organizationId, principal_id: profile.principalId, device_id: deviceId,
      app_version: config.appVersion, action: r.action, detail: r.detail ? JSON.parse(r.detail) : null, occurred_at: r.occurred_at,
    }));
    // Insertion simple : un upsert exigerait le droit de relire le journal (réservé aux admins Siteflow).
    const { error } = await supabase.from("mobile_log_entries").insert(entries);
    if (error && isDataError(error.code)) {
      // Lot déjà partiellement reçu (rejeu) ou entrée invalide : ligne par ligne. Un doublon vaut succès ; une entrée
      // refusée pour son contenu est abandonnée plutôt que de bloquer tout le journal.
      for (const e of entries) {
        const { error: one } = await supabase.from("mobile_log_entries").insert(e);
        if (one && !isDataError(one.code)) return;
      }
    } else if (error) {
      return;
    }
    await db.execute(`delete from app_logs where id in (${rows.map(() => "?").join(",")})`, rows.map((r) => r.id));
  }
}
