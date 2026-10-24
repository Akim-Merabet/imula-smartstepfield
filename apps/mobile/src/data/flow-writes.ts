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

/**
 * « Ajouter un formulaire » / « Déclarer un aléa » (spec 05 §4.7.8) : lie un formulaire générique à l'étape.
 * Réutilise le lien existant pour ce formulaire ; crée le bloc Formulaires si l'étape n'en a pas. Renvoie le lien.
 */
export async function addFormLink(db: Db, p: { stepId: string; flowId: string; formId: string }, randomId: () => string): Promise<string> {
  return db.writeTransaction(async (tx) => {
    let block = await tx.getOptional<{ id: string }>("select id from blocks where step_id = ? and type = 'form' and ifnull(enabled, 1) = 1", [p.stepId]);
    if (!block) {
      block = { id: randomId() };
      await tx.execute(
        `insert into blocks (id, step_id, flow_id, type, enabled, state, created_at, updated_at) values (?, ?, ?, 'form', 1, 'validated', ?, ?)`,
        [block.id, p.stepId, p.flowId, new Date().toISOString(), new Date().toISOString()]);
    }
    const existing = await tx.getOptional<{ id: string }>(
      "select id from form_block_links where block_id = ? and form_id = ? and ifnull(enabled, 1) = 1", [block.id, p.formId]);
    if (existing) return existing.id;
    const max = await tx.getOptional<{ n: number | null }>("select max(position) as n from form_block_links where block_id = ?", [block.id]);
    const id = randomId();
    await tx.execute(
      `insert into form_block_links (id, block_id, step_id, flow_id, form_id, position, enabled, mandatory, unique_response, unique_mode, created_at)
       values (?, ?, ?, ?, ?, ?, 1, 0, 0, 'new_or_resume', ?)`,
      [id, block.id, p.stepId, p.flowId, p.formId, (max?.n ?? 0) + 1, new Date().toISOString()]);
    return id;
  });
}

/** « Paramètres des signatures » : active des points d'arrêt supplémentaires sur un bloc Contrôles (irréversible). */
export async function addDsiBreakpoints(db: Db, blockId: string, natures: string[]) {
  const valid = natures.filter((n) => /^breakpoint_(int|ext)_[123]$/.test(n));
  if (!valid.length) return;
  await db.execute(`update block_dsi_configs set ${valid.map((n) => `${n} = 1`).join(", ")} where block_id = ?`, [blockId]);
}
