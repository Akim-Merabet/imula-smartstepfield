// Implémentations appareil de la file des pièces jointes : fichiers (expo-file-system) et Storage Supabase.
import type { AbstractPowerSyncDatabase } from "@powersync/react-native";
import { randomUUID } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

import { type FileStore, FORM_FILES_BUCKET, type RemoteStorage, syncAttachments } from "./queue";

const root = () => new Directory(Paths.document, "attachments");
/** Un fichier par chemin Storage, à plat (les « / » sont encodés). */
const fileFor = (path: string) => new File(root(), encodeURIComponent(path));

export const fileStore: FileStore = {
  exists: (path) => fileFor(path).exists,
  async write(path, bytes) {
    const dir = root();
    if (!dir.exists) dir.create({ intermediates: true });
    const f = fileFor(path);
    if (!f.exists) f.create();
    await f.write(bytes);
  },
  read: (path) => fileFor(path).bytes(),
  async copyFrom(uri, path) {
    const dir = root();
    if (!dir.exists) dir.create({ intermediates: true });
    await new File(uri).copy(fileFor(path));
  },
  async download(url, path) {
    const dir = root();
    if (!dir.exists) dir.create({ intermediates: true });
    await File.downloadFileAsync(url, fileFor(path), { idempotent: true });
  },
  uriOf: (path) => fileFor(path).uri,
};

export const remoteStorage: RemoteStorage = {
  async upload(bucket, path, bytes, mime) {
    const { error } = await supabase.storage.from(bucket).upload(path, bytes.buffer as ArrayBuffer, {
      contentType: mime ?? undefined, upsert: false,
    });
    return { error: error ? { message: error.message } : null };
  },
  async signedUrl(bucket, path) {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  },
};

/** Synchronisation périodique des fichiers tant que le profil est en ligne (et à chaque nouvel ajout en file). */
export class AttachmentSyncLoop {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private abort = new AbortController();

  constructor(private db: AbstractPowerSyncDatabase) {}

  start() {
    this.stop();
    this.abort = new AbortController();
    this.timer = setInterval(() => void this.run(), 20_000);
    this.db.watch("select count(*) as n from attachment_queue where state = 'upload'", [], { onResult: () => void this.run() },
      { signal: this.abort.signal });
    void this.run();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.abort.abort();
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      await syncAttachments(this.db, fileStore, remoteStorage, randomUUID);
    } catch (e) {
      console.warn("Pièces jointes", e);
    } finally {
      this.running = false;
    }
  }
}

/** URI affichable d'une pièce jointe : fichier local, sinon URL signée (en ligne), sinon null. */
export function useAttachmentUri(path: string | null | undefined, online: boolean) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) return;
    if (fileStore.exists(path)) {
      queueMicrotask(() => active && setUri(fileStore.uriOf(path)));
    } else if (online) {
      void remoteStorage.signedUrl(FORM_FILES_BUCKET, path).then((u) => active && setUri(u));
    }
    return () => { active = false; };
  }, [path, online]);
  return path ? uri : null;
}

export type OpenResult = "opened" | "not_downloaded" | "unavailable" | "error";

/**
 * Ouvre un fichier (PDF de document, pièce jointe) dans la visionneuse du système : copie locale si présente,
 * sinon téléchargement en ligne (gardé ensuite pour le hors ligne).
 */
export async function openStoredFile(p: { bucket: string; path: string; name?: string | null; mime?: string; online: boolean }): Promise<OpenResult> {
  try {
    if (!fileStore.exists(p.path)) {
      if (!p.online) return "not_downloaded";
      const url = await remoteStorage.signedUrl(p.bucket, p.path);
      if (!url) return "unavailable";
      await fileStore.download(url, p.path);
    }
    await File.preview(fileFor(p.path), { title: p.name ?? undefined, mimeType: p.mime ?? "application/pdf" });
    return "opened";
  } catch {
    return "error";
  }
}
