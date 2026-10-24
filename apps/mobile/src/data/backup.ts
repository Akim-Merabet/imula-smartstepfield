// Contenu d'une sauvegarde (spec 05 §6.1) : copie logique de la base du profil — toutes les tables et la file
// d'envoi (écritures non encore envoyées) — chiffrée ensuite avec la clé publique de l'organisation.
import { type BackupContent, encryptBackup, type RandomBytes } from "@imula/backup-core";

import type { Db } from "./form-response";

export async function buildBackupContent(db: Pick<Db, "getAll">, tableNames: string[], meta: Omit<BackupContent, "version" | "createdAt" | "pending" | "tables">): Promise<BackupContent> {
  const tables: BackupContent["tables"] = {};
  for (const name of tableNames) {
    if (!/^\w+$/.test(name)) continue;
    tables[name] = await db.getAll<Record<string, unknown>>(`select * from ${name}`).catch(() => []);
  }
  const crud = await db.getAll<{ id: number; tx_id: number | null; data: string }>("select id, tx_id, data from ps_crud order by id").catch(() => []);
  const pending = crud.map((c) => {
    try {
      // crud_id : ordre d'envoi ; id (dans data) : ligne modifiée.
      return { crud_id: c.id, tx_id: c.tx_id, ...JSON.parse(c.data) };
    } catch {
      return { crud_id: c.id, tx_id: c.tx_id, raw: c.data };
    }
  });
  return { version: 1, createdAt: new Date().toISOString(), pending, tables, ...meta };
}

export function sealBackup(content: BackupContent, publicKey: string, randomBytes: RandomBytes): Uint8Array {
  return encryptBackup(new TextEncoder().encode(JSON.stringify(content)), publicKey, randomBytes);
}
