// Écritures locales de l'écran d'exécution (instructions multiples, statut du flow, déverrouillage) ; envoyées ensuite
// par les RPC mobile_* (spec 05 §9.6). Sans dépendance React : testables sur une base synchronisée.
import type { Db } from "./form-response";

const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(", ");

/** Statut d'une ou plusieurs sous-instructions (« Changement de statut multiple » : les statuts existants sont écrasés). */
export async function setMultiPrStatus(db: Db, itemIds: string[], statusId: string | null, me: string) {
  if (!itemIds.length) return;
  await db.execute(
    `update block_multi_pr_items set custom_status_id = ?, updated_by = ?, updated_at = ? where id in (${placeholders(itemIds.length)})
       and ifnull(disabled, 0) = 0`,
    [statusId, me, new Date().toISOString(), ...itemIds]);
}

export async function setMultiPrObservation(db: Db, itemId: string, observation: string, me: string) {
  await db.execute("update block_multi_pr_items set observation = ?, updated_by = ?, updated_at = ? where id = ?",
    [observation.trim() || null, me, new Date().toISOString(), itemId]);
}

/** Signe les sous-instructions non encore signées (une signature par sous-instruction). Renvoie le nombre signé. */
export async function signMultiPrItems(db: Db, items: { id: string; flowId: string }[], p: { signaturePath: string; signedAt: string; me: string },
  randomId: () => string): Promise<number> {
  let n = 0;
  await db.writeTransaction(async (tx) => {
    for (const item of items) {
      if (await tx.getOptional("select 1 from block_multi_pr_signatures where item_id = ?", [item.id])) continue;
      await tx.execute(
        `insert into block_multi_pr_signatures (id, item_id, flow_id, signatory_id, signed_at, signature_path, source)
         values (?, ?, ?, ?, ?, ?, 'mobile')`, [randomId(), item.id, item.flowId, p.me, p.signedAt, p.signaturePath]);
      n += 1;
    }
  });
  return n;
}

/** Changement de statut du flow : demande envoyée au serveur + copie locale mise à jour (même transaction). */
export async function changeFlowStatus(db: Db, flowId: string, statusId: string, comment: string | null, randomId: () => string) {
  await db.writeTransaction(async (tx) => {
    await tx.execute("insert into flow_status_changes (id, flow_id, status_id, comment, changed_at) values (?, ?, ?, ?, ?)",
      [randomId(), flowId, statusId, comment?.trim() || null, new Date().toISOString()]);
    await tx.execute("update flows set custom_status_id = ? where id = ?", [statusId, flowId]);
  });
}

/** Déverrouillage du flow (R-SEQ-4) : signataire, commentaire obligatoire ; toutes les étapes deviennent saisissables. */
export async function unlockFlow(db: Db, p: { id: string; flowId: string; unlockedBy: string; signaturePath: string | null; comment: string; signedAt: string; qr: boolean }) {
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `insert into flow_fill_unlocks (id, flow_id, unlocked_by, signature_path, comment, sign_with_qr_code, signed_at, source, created_at)
       values (?, ?, ?, ?, ?, ?, ?, 'mobile', ?)`,
      [p.id, p.flowId, p.unlockedBy, p.signaturePath, p.comment.trim(), p.qr ? 1 : 0, p.signedAt, new Date().toISOString()]);
    await tx.execute("update flows set fill_restrictions_skipped = 1 where id = ?", [p.flowId]);
  });
}
