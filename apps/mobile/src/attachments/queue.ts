// Pièces jointes (photos, signatures de formulaire) : fichiers locaux + file d'envoi / de téléchargement
// (spec 05 §9.8). La donnée métier référence tout de suite le chemin Storage cible ; le fichier suit dès que possible.
// Sans dépendance React Native : l'accès aux fichiers et au stockage distant est injecté (testable).

export type AttachmentDb = {
  getAll<T>(sql: string, params?: unknown[]): Promise<T[]>;
  getOptional<T>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<unknown>;
};

/** Fichiers de l'appareil, indexés par chemin Storage. */
export type FileStore = {
  exists(path: string): boolean;
  write(path: string, bytes: Uint8Array): Promise<void>;
  read(path: string): Promise<Uint8Array>;
  /** Copie un fichier de l'appareil (photo prise, image choisie) vers le stockage des pièces jointes. */
  copyFrom(uri: string, path: string): Promise<void>;
  download(url: string, path: string): Promise<void>;
  uriOf(path: string): string;
};

export type RemoteStorage = {
  upload(bucket: string, path: string, bytes: Uint8Array, mime: string | null): Promise<{ error: { message: string; statusCode?: string | number } | null }>;
  signedUrl(bucket: string, path: string): Promise<string | null>;
};

export const FORM_FILES_BUCKET = "form-files";

type QueueRow = { id: string; bucket: string; path: string; state: "upload" | "download"; mime: string | null; attempts: number };

const safe = (name: string) => name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);

/** Chemin Storage d'un fichier de réponse (même convention que la WebApp). */
export const responseFilePath = (responseId: string, sub: "photos" | "files" | "signatures", name: string, id: string) =>
  `responses/${responseId}/${sub}/${id}-${safe(name)}`;

async function enqueue(db: AttachmentDb, row: { id: string; bucket: string; path: string; state: "upload" | "download"; mime: string | null }) {
  const existing = await db.getOptional<{ id: string; state: string }>("select id, state from attachment_queue where path = ?", [row.path]);
  if (existing) return;
  const now = new Date().toISOString();
  await db.execute(
    `insert into attachment_queue (id, bucket, path, state, mime, attempts, last_error, created_at, updated_at)
     values (?, ?, ?, ?, ?, 0, null, ?, ?)`, [row.id, row.bucket, row.path, row.state, row.mime, now, now]);
}

/** Fichier produit sur l'appareil : écrit localement puis mis en file d'envoi. */
export async function saveLocalFile(db: AttachmentDb, store: FileStore, p: {
  id: string; bucket: string; path: string; mime: string | null; bytes?: Uint8Array; sourceUri?: string;
}) {
  if (p.bytes) await store.write(p.path, p.bytes);
  else if (p.sourceUri) await store.copyFrom(p.sourceUri, p.path);
  await enqueue(db, { id: p.id, bucket: p.bucket, path: p.path, state: "upload", mime: p.mime });
}

/** Fichiers référencés par les réponses synchronisées (photos, signatures) absents de l'appareil : à télécharger. */
export async function referencedPaths(db: AttachmentDb): Promise<string[]> {
  const rows = await db.getAll<{ question_type: string; value_json: string | null }>(
    "select question_type, value_json from form_response_values where question_type in ('photo', 'file', 'collaborator') and value_json is not null");
  const out = new Set<string>();
  for (const r of rows) {
    try {
      const v = JSON.parse(r.value_json!);
      if (Array.isArray(v)) for (const f of v) if (typeof f?.fileId === "string") out.add(f.fileId);
      if (v && typeof v.signaturePath === "string") out.add(v.signaturePath);
    } catch {
      // valeur illisible : ignorée
    }
  }
  return [...out];
}

export type SyncResult = { uploaded: number; downloaded: number; pending: number };

/**
 * Un passage de synchronisation des fichiers : envois en attente, puis téléchargements des fichiers référencés.
 * Un envoi refusé (réponse pas encore créée côté serveur, réseau) reste en file et sera retenté au passage suivant.
 */
export async function syncAttachments(db: AttachmentDb, store: FileStore, remote: RemoteStorage, randomId: () => string): Promise<SyncResult> {
  let uploaded = 0;
  let downloaded = 0;
  for (const path of await referencedPaths(db)) {
    if (!store.exists(path)) await enqueue(db, { id: randomId(), bucket: FORM_FILES_BUCKET, path, state: "download", mime: null });
  }
  // Téléchargements abandonnés après 5 échecs (fichier supprimé côté serveur…) ; les envois sont retentés sans limite.
  const rows = await db.getAll<QueueRow>(
    "select id, bucket, path, state, mime, attempts from attachment_queue where state = 'upload' or attempts < 5 order by created_at");
  for (const row of rows) {
    const now = new Date().toISOString();
    try {
      if (row.state === "upload") {
        if (!store.exists(row.path)) throw new Error("Fichier local introuvable");
        const { error } = await remote.upload(row.bucket, row.path, await store.read(row.path), row.mime);
        // Déjà présent côté serveur (rejeu) : considéré comme envoyé.
        if (error && !/exists|duplicate/i.test(error.message)) throw new Error(error.message);
        uploaded += 1;
      } else {
        if (!store.exists(row.path)) {
          const url = await remote.signedUrl(row.bucket, row.path);
          if (!url) throw new Error("Fichier distant indisponible");
          await store.download(url, row.path);
        }
        downloaded += 1;
      }
      await db.execute("delete from attachment_queue where id = ?", [row.id]);
    } catch (e) {
      await db.execute("update attachment_queue set attempts = attempts + 1, last_error = ?, updated_at = ? where id = ?",
        [e instanceof Error ? e.message : String(e), now, row.id]);
    }
  }
  const pending = (await db.getOptional<{ n: number }>("select count(*) as n from attachment_queue where state = 'upload'"))?.n ?? 0;
  return { uploaded, downloaded, pending };
}
