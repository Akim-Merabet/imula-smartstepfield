// « Importer les données » (spec 05 §6.1) : restauration d'une sauvegarde du profil sur l'appareil.
// Les données synchronisées reviennent du serveur ; ce qui ne peut venir que de la sauvegarde est rejoué :
//  1. tables propres à l'appareil (flows sélectionnés hors ligne, exécutions, signatures de changement) ;
//  2. écritures non envoyées, réappliquées par les vues PowerSync dans l'ordre d'origine → nouvelle file d'envoi.
// Le rejeu est sûr à répéter : une création déjà présente, une modification déjà appliquée ou une suppression déjà
// faite sont ignorées, et les RPC serveur acceptent le rejeu d'un même identifiant.
import type { Db } from "./form-response";

export type RestorePayload = {
  createdAt?: string;
  pending: unknown[];
  tables: Record<string, Record<string, unknown>[]>;
};

export type TableInfo = { name: string; columns: string[]; insertOnly: boolean };
export type RestoreReport = { replayed: number; alreadyApplied: number; missing: number; ignored: number; local: number };

/** Tables propres à l'appareil restaurées, et la clé métier qui évite les doublons. */
export const RESTORED_LOCAL_TABLES: Record<string, string[]> = {
  offline_selection: ["flow_id"],
  flow_executions: ["flow_id"],
  value_change_signatures: ["response_id", "option_lineage_id"],
};

type Entry = { op: "PUT" | "PATCH" | "DELETE"; type: string; id: string; data: Record<string, unknown> };

function asEntry(raw: unknown): Entry | null {
  const e = raw as Partial<Entry> | null;
  if (!e || typeof e.type !== "string" || !/^\w+$/.test(e.type) || typeof e.id !== "string") return null;
  if (e.op !== "PUT" && e.op !== "PATCH" && e.op !== "DELETE") return null;
  return { op: e.op, type: e.type, id: e.id, data: e.data && typeof e.data === "object" ? e.data : {} };
}

const ISO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
/** Valeur identique ; deux horodatages sont comparés en instants (le serveur renvoie « +00:00 » là où l'appareil écrit « Z »). */
export function same(a: unknown, b: unknown): boolean {
  if ((a ?? null) === (b ?? null)) return true;
  if (a == null || b == null) return false;
  if (String(a) === String(b)) return true;
  return typeof a === "string" && typeof b === "string" && ISO.test(a) && ISO.test(b) && Date.parse(a) === Date.parse(b);
}

/** Étape 1 : lignes des tables propres à l'appareil absentes de la base actuelle. */
export async function restoreLocalTables(db: Pick<Db, "writeTransaction">, payload: RestorePayload, tables: TableInfo[]): Promise<number> {
  let n = 0;
  await db.writeTransaction(async (tx) => {
    for (const [name, key] of Object.entries(RESTORED_LOCAL_TABLES)) {
      const info = tables.find((t) => t.name === name);
      if (!info) continue;
      for (const row of payload.tables[name] ?? []) {
        if (typeof row.id !== "string" || key.some((k) => row[k] == null)) continue;
        const exists = await tx.getOptional(`select 1 from ${name} where id = ? or (${key.map((k) => `${k} = ?`).join(" and ")})`,
          [row.id, ...key.map((k) => row[k])]);
        if (exists) continue;
        const cols = info.columns.filter((c) => c in row);
        await tx.execute(`insert into ${name} (id${cols.map((c) => `, ${c}`).join("")}) values (?${cols.map(() => ", ?").join("")})`,
          [row.id, ...cols.map((c) => row[c] ?? null)]);
        n += 1;
      }
    }
  });
  return n;
}

/** Étape 2 : écritures non envoyées de la sauvegarde, réappliquées dans l'ordre. */
export async function replayPending(db: Pick<Db, "writeTransaction">, payload: RestorePayload, tables: TableInfo[]): Promise<Omit<RestoreReport, "local">> {
  const report = { replayed: 0, alreadyApplied: 0, missing: 0, ignored: 0 };
  const byName = new Map(tables.map((t) => [t.name, t]));
  await db.writeTransaction(async (tx) => {
    for (const raw of payload.pending) {
      const entry = asEntry(raw);
      const info = entry && byName.get(entry.type);
      // Tables propres à l'appareil : jamais envoyées, déjà traitées à l'étape 1.
      if (!entry || !info || entry.type in RESTORED_LOCAL_TABLES) {
        report.ignored += 1;
        continue;
      }
      const cols = info.columns.filter((c) => c in entry.data);
      if (info.insertOnly) {
        // Journal sans lignes locales : renvoyé tel quel, le serveur écarte un doublon.
        if (entry.op !== "PUT") report.ignored += 1;
        else {
          await tx.execute(`insert into ${entry.type} (id${cols.map((c) => `, ${c}`).join("")}) values (?${cols.map(() => ", ?").join("")})`,
            [entry.id, ...cols.map((c) => entry.data[c] ?? null)]);
          report.replayed += 1;
        }
        continue;
      }
      const current = await tx.getOptional<Record<string, unknown>>(`select * from ${entry.type} where id = ?`, [entry.id]);
      if (entry.op === "PUT") {
        if (current) report.alreadyApplied += 1;
        else {
          await tx.execute(`insert into ${entry.type} (id${cols.map((c) => `, ${c}`).join("")}) values (?${cols.map(() => ", ?").join("")})`,
            [entry.id, ...cols.map((c) => entry.data[c] ?? null)]);
          report.replayed += 1;
        }
      } else if (entry.op === "PATCH") {
        if (!current) {
          report.missing += 1;
          continue;
        }
        const changed = cols.filter((c) => !same(current[c], entry.data[c]));
        if (!changed.length) report.alreadyApplied += 1;
        else {
          await tx.execute(`update ${entry.type} set ${changed.map((c) => `${c} = ?`).join(", ")} where id = ?`,
            [...changed.map((c) => entry.data[c] ?? null), entry.id]);
          report.replayed += 1;
        }
      } else if (!current) report.alreadyApplied += 1;
      else {
        await tx.execute(`delete from ${entry.type} where id = ?`, [entry.id]);
        report.replayed += 1;
      }
    }
  });
  return report;
}
