import type { AbstractPowerSyncDatabase } from "@powersync/react-native";

import { config } from "@/config";
import { getDeviceId } from "@/lib/device";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/session/profiles";

/** Envoie le journal local par lots (« Logs push ») puis l'efface ; un doublon (rejeu) vaut succès. */
export async function flushLogs(db: AbstractPowerSyncDatabase, profile: Profile): Promise<void> {
  const deviceId = await getDeviceId().catch(() => null);
  for (let batch = 0; batch < 10; batch++) {
    const rows = await db.getAll<{ id: string; action: string; detail: string | null; occurred_at: string }>(
      "select id, action, detail, occurred_at from app_logs order by occurred_at limit 200");
    if (!rows.length) return;
    const entries = rows.map((r) => ({
      id: r.id, organization_id: profile.organizationId, principal_id: profile.principalId, device_id: deviceId,
      app_version: config.appVersion, action: r.action, detail: r.detail ? JSON.parse(r.detail) : null, occurred_at: r.occurred_at,
    }));
    // Insertion simple : un upsert exigerait le droit de relire le journal (réservé aux admins Siteflow).
    const { error } = await supabase.from("mobile_log_entries").insert(entries);
    if (error?.code === "23505") {
      // Lot déjà partiellement reçu (rejeu) : ligne par ligne, les doublons valent succès.
      for (const e of entries) {
        const { error: one } = await supabase.from("mobile_log_entries").insert(e);
        if (one && one.code !== "23505") return;
      }
    } else if (error) {
      return;
    }
    await db.execute(`delete from app_logs where id in (${rows.map(() => "?").join(",")})`, rows.map((r) => r.id));
  }
}
