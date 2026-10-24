import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from "@powersync/react-native";

import { config } from "@/config";
import { supabase } from "@/lib/supabase";

import { UploadError, uploadEntry } from "./uploaders";

export type ConnectorEvents = {
  /** Accès retiré à une entité (403) : l'UI passe hors ligne et affiche la modale R-SES-2. */
  onForbidden: (message: string) => void;
  /** Écritures refusées pour une raison métier, consignées dans sync_rejections. */
  onRejected: (count: number) => void;
};

export class SupabaseConnector implements PowerSyncBackendConnector {
  /** @param authUserId compte du profil dont la base est ouverte */
  constructor(
    private readonly authUserId: string,
    private readonly events: ConnectorEvents,
  ) {}

  async fetchCredentials() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    // Jamais de synchro avec la session d'un autre profil (cf. blocage RN 2.8 de l'outil d'origine).
    if (!data.session || data.session.user.id !== this.authUserId) return null;
    return { endpoint: config.powersyncUrl, token: data.session.access_token };
  }

  // Une transaction locale = un envoi atomique (ex. signature + événement) ; on vide la file dans l'ordre.
  async uploadData(db: AbstractPowerSyncDatabase) {
    // Même garde-fou que fetchCredentials : jamais d'envoi avec la session d'un autre profil (la file attend).
    const { data: auth } = await supabase.auth.getSession();
    if (auth.session?.user.id !== this.authUserId) throw new Error("Session d'un autre profil : envoi différé");
    let rejected = 0;
    try {
      for (;;) {
        const tx = await db.getNextCrudTransaction();
        if (!tx) return;
        try {
          for (const op of tx.crud) await uploadEntry(op, db);
        } catch (e) {
          if (!(e instanceof UploadError) || e.kind === "retry") throw e;
          if (e.kind === "forbidden") {
            // Envoi suspendu sans compléter la transaction : reprise manuelle une fois l'accès rétabli.
            this.events.onForbidden(e.message);
            return;
          }
          const now = new Date().toISOString();
          for (const op of tx.crud) {
            await db.execute(
              `insert into sync_rejections (id, table_name, row_id, op, payload, error_code, message, created_at)
               values (uuid(), ?, ?, ?, ?, ?, ?, ?)`,
              [op.table, op.id, op.op, JSON.stringify(op.opData ?? null), e.code, e.message, now],
            );
          }
          rejected += tx.crud.length;
        }
        await tx.complete();
      }
    } finally {
      if (rejected) this.events.onRejected(rejected);
    }
  }
}
