"use client";

import { createClient } from "@/lib/supabase/client";
import { FORM_FILES_BUCKET } from "../../meta";

/** Accès aux fichiers substituable (mode partagé : route handlers liés à la session de partage). */
export type ResponseStorageAdapter = {
  upload: (responseId: string, file: Blob, name: string, sub: string) => Promise<string>;
  signedUrl: (path: string) => Promise<string | null>;
};
let adapter: ResponseStorageAdapter | null = null;
export function setResponseStorageAdapter(a: ResponseStorageAdapter | null) {
  adapter = a;
  cache.clear();
}

const safe = (name: string) => name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);

/** Dépose un fichier dans le bucket privé : responses/<responseId>/<sous-dossier>/<uuid>-<nom>. */
export async function uploadResponseFile(responseId: string, file: Blob, name: string, sub = "files"): Promise<string> {
  if (adapter) return adapter.upload(responseId, file, name, sub);
  const path = `responses/${responseId}/${sub}/${crypto.randomUUID()}-${safe(name)}`;
  const { error } = await createClient().storage.from(FORM_FILES_BUCKET).upload(path, file, {
    contentType: file.type || undefined, upsert: false,
  });
  if (error) throw error;
  return path;
}

const cache = new Map<string, { url: string; at: number }>();
/** URL signée (1 h, mise en cache 50 min). */
export async function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < 50 * 60_000) return hit.url;
  if (adapter) {
    const url = await adapter.signedUrl(path);
    if (url) cache.set(path, { url, at: Date.now() });
    return url;
  }
  const { data } = await createClient().storage.from(FORM_FILES_BUCKET).createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, at: Date.now() });
  return data.signedUrl;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/png";
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
