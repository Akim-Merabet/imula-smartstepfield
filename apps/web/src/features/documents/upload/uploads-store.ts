"use client";

import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { DOCUMENTS_BUCKET } from "../meta";

/** Import de document en cours ou terminé (panneau « Imports de documents », spec 00 §5.6). */
export type UploadItem = {
  id: string;
  name: string;
  context: string | null;
  documentId: string | null;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
  startedAt: number;
  read: boolean;
};

let items: UploadItem[] = [];
const listeners = new Set<() => void>();
const emit = () => { items = [...items]; listeners.forEach((l) => l()); };
const patch = (id: string, values: Partial<UploadItem>) => {
  items = items.map((i) => (i.id === id ? { ...i, ...values } : i));
  emit();
};

export const uploadsStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get: () => items,
  markAllRead() { items = items.map((i) => (i.status === "uploading" ? i : { ...i, read: true })); emit(); },
  remove(id: string) { items = items.filter((i) => i.id !== id); emit(); },
};

const EMPTY: UploadItem[] = [];
export function useUploads() {
  return useSyncExternalStore(uploadsStore.subscribe, uploadsStore.get, () => EMPTY);
}

/** Vrai tant qu'un import concerne ce document (spinner « Fichier en cours d'import »). */
export function useIsUploading(documentId: string) {
  const list = useUploads();
  return list.some((i) => i.documentId === documentId && i.status === "uploading");
}

/**
 * Téléverse un fichier dans le bucket privé « documents » avec suivi de progression (XHR sur l'API Storage).
 * Lève une erreur « too_large » si la limite du serveur Storage est dépassée (local : 50 Mo par défaut).
 */
export async function uploadDocumentFile(file: File, path: string, meta: { context?: string | null; documentId?: string | null }) {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  items = [{ id, name: file.name, context: meta.context ?? null, documentId: meta.documentId ?? null, progress: 0,
    status: "uploading" as const, startedAt: Date.now(), read: false }, ...items];
  emit();

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${DOCUMENTS_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
  try {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("Authorization", `Bearer ${token ?? ""}`);
      xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "");
      xhr.setRequestHeader("x-upsert", "true");
      xhr.setRequestHeader("Content-Type", file.type || "application/pdf");
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) patch(id, { progress: Math.round((e.loaded / e.total) * 100) }); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          const tooLarge = xhr.status === 413 || /maximum allowed size|too large|exceeded/i.test(xhr.responseText);
          reject(new Error(tooLarge ? "too_large" : "upload_failed"));
        }
      };
      xhr.onerror = () => reject(new Error("network"));
      xhr.send(file);
    });
    patch(id, { status: "done", progress: 100 });
    return path;
  } catch (e) {
    patch(id, { status: "error", error: (e as Error).message });
    throw e;
  }
}

/** Rejette les PDF chiffrés (« verrouillé avec un mot de passe ») par une lecture rapide de l'en-tête. */
export async function isPasswordProtectedPdf(file: File) {
  try {
    const tail = await file.slice(Math.max(0, file.size - 4096)).text();
    const head = await file.slice(0, Math.min(file.size, 4096)).text();
    return /\/Encrypt\s/.test(tail) || /\/Encrypt\s/.test(head);
  } catch {
    return false;
  }
}
