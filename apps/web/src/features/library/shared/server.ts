import "server-only";
import { authorize } from "@/lib/actions";
import type { Session } from "@/lib/auth/session";
import type { Action } from "@/lib/permissions/types";
import { createClient } from "@/lib/supabase/server";

export const LIBRARY_BUCKET = "library";
export const MAX_FILE_MB = 20;

export type Supa = Awaited<ReturnType<typeof createClient>>;

/** Session + droit UI de l'écran (la RLS reste l'autorité). */
export async function libraryAuth(routeId: string, action: Action): Promise<{ session: Session; supabase: Supa } | { error: string }> {
  const auth = await authorize(routeId, action);
  if ("error" in auth) return auth;
  return { session: auth.session, supabase: await createClient() };
}

const safeName = (name: string) => name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80) || "file";

/** Fichier joint à une modale : File (nouveau), "" (retiré) ou absent (inchangé). */
export function readFile(form: FormData, key: string): File | "" | undefined {
  const v = form.get(key);
  if (v === null) return undefined;
  if (typeof v === "string") return v === "" ? "" : undefined;
  return v.size > 0 ? v : undefined;
}

export function checkFile(file: File, kind: "pdf" | "image"): string | null {
  if (file.size > MAX_FILE_MB * 1024 * 1024) return "too_large";
  if (kind === "pdf" && file.type !== "application/pdf") return "pdf_only";
  if (kind === "image" && !file.type.startsWith("image/")) return "image_only";
  return null;
}

/** Dépose un fichier dans le bucket privé « library » : <prefix>/<uuid>-<nom>. */
export async function uploadLibraryFile(supabase: Supa, prefix: string, file: File): Promise<string | null> {
  const path = `${prefix}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(LIBRARY_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  return error ? null : path;
}

export async function removeLibraryFiles(supabase: Supa, paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (list.length) await supabase.storage.from(LIBRARY_BUCKET).remove(list);
}

/** Copie d'un fichier (duplication d'un élément). */
export async function copyLibraryFile(supabase: Supa, from: string | null, prefix: string): Promise<string | null> {
  if (!from) return null;
  const to = `${prefix}/${crypto.randomUUID()}-${from.split("/").pop()?.replace(/^[0-9a-f-]{36}-/, "") ?? "file"}`;
  const { error } = await supabase.storage.from(LIBRARY_BUCKET).copy(from, to);
  return error ? null : to;
}

/** Chaîne vide → null, avec troncature défensive. */
export const clean = (v: unknown, max = 255): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};
