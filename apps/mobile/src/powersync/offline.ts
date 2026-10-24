// Données hors ligne (= « checkout » d'origine, spec 05 §5.2, §9.4) : la table locale offline_selection fait foi.
// Chaque flow sélectionné ouvre un abonnement flow_offline ; ses entités (project_offline) et les formulaires
// qu'il référence (flow_forms) suivent automatiquement.
import type { AbstractPowerSyncDatabase, SyncStreamSubscription } from "@powersync/react-native";
import { randomUUID } from "expo-crypto";

/** Les abonnements restent actifs tant que le flow est sélectionné : TTL « infini » (10 ans) côté service. */
const KEEP = 10 * 365 * 24 * 3600;

type Key = string;
const keyOf = (name: string, params: Record<string, string>) => `${name}:${JSON.stringify(params)}`;

/** Maintient les abonnements du profil ouvert alignés sur offline_selection. Une instance par base. */
export class OfflineSubscriptions {
  private handles = new Map<Key, SyncStreamSubscription>();
  private abort = new AbortController();
  // Les résultats successifs sont appliqués l'un après l'autre (pas de double abonnement).
  private queue: Promise<void> = Promise.resolve();

  constructor(private db: AbstractPowerSyncDatabase) {}

  start() {
    // Formulaires des flows et entités sélectionnés : versions épinglées ou version courante (flow_forms).
    this.db.watch(
      `select 'flow_offline' as name, flow_id as param from offline_selection
       union select distinct 'project_offline', project_id from offline_selection
       union select distinct 'flow_forms', l.form_id from form_block_links l
              join offline_selection o on o.flow_id = l.flow_id where l.form_id is not null
       union select distinct 'flow_forms', f.id from forms f
              join offline_selection o on o.project_id = f.project_id`,
      [],
      {
        onResult: (r) => {
          const rows = r.rows?._array ?? [];
          this.queue = this.queue.then(() => this.apply(rows)).catch((e) => console.warn("Abonnements hors ligne", e));
        },
      },
      { signal: this.abort.signal },
    );
  }

  stop() {
    this.abort.abort();
    for (const h of this.handles.values()) h.unsubscribe();
    this.handles.clear();
  }

  private async apply(rows: { name: string; param: string }[]) {
    const wanted = new Map<Key, { name: string; params: Record<string, string> }>();
    for (const { name, param } of rows) {
      const params = { [name === "flow_offline" ? "flow_id" : name === "project_offline" ? "project_id" : "form_id"]: param };
      wanted.set(keyOf(name, params), { name, params });
    }
    for (const [key, { name, params }] of wanted) {
      if (this.handles.has(key)) continue;
      const handle = await this.db.syncStream(name, params).subscribe({ ttl: KEEP });
      if (this.abort.signal.aborted) return handle.unsubscribe();
      this.handles.set(key, handle);
    }
    for (const [key, handle] of this.handles) {
      if (wanted.has(key)) continue;
      handle.unsubscribe();
      this.handles.delete(key);
      // Désélection explicite : on libère tout de suite au lieu d'attendre l'expiration du TTL.
      await this.db.syncStream(handle.name, handle.parameters ?? undefined).unsubscribeAll();
    }
  }
}

/** « Télécharger » : ajoute les flows à la sélection hors ligne. */
export async function selectForOffline(db: AbstractPowerSyncDatabase, flows: { id: string; project_id: string }[]) {
  const now = new Date().toISOString();
  await db.writeTransaction(async (tx) => {
    for (const f of flows) {
      const existing = await tx.getOptional("select id from offline_selection where flow_id = ?", [f.id]);
      if (!existing) {
        await tx.execute("insert into offline_selection (id, flow_id, project_id, subscribed_at) values (?, ?, ?, ?)",
          [randomUUID(), f.id, f.project_id, now]);
      }
    }
  });
}

/**
 * Écritures en attente d'envoi concernant un flow (interdit de le retirer de la tablette, spec 05 §9.7).
 * Une modification partielle ne porte pas forcément flow_id : on le relit sur la ligne locale.
 */
export async function pendingWritesForFlow(db: AbstractPowerSyncDatabase, flowId: string): Promise<number> {
  const crud = await db.getAll<{ data: string }>("select data from ps_crud");
  let n = 0;
  for (const { data } of crud) {
    const op = JSON.parse(data) as { type: string; id: string; data?: { flow_id?: string } };
    if (op.data?.flow_id === flowId || (op.type === "flows" && op.id === flowId)) n += 1;
    else if (!op.data?.flow_id && /^\w+$/.test(op.type)) {
      const row = await db.getOptional<{ flow_id: string | null }>(`select flow_id from ${op.type} where id = ?`, [op.id]).catch(() => null);
      if (row?.flow_id === flowId) n += 1;
    }
  }
  return n;
}

/** « Supprimer de la tablette » : retire les flows de la sélection (leurs données disparaissent à la synchro suivante). */
export async function unselectForOffline(db: AbstractPowerSyncDatabase, flowIds: string[]) {
  if (!flowIds.length) return;
  await db.execute(`delete from offline_selection where flow_id in (${flowIds.map(() => "?").join(",")})`, flowIds);
}
