"use server";

import { fail, ok, type ActionResult } from "@/lib/actions";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { createClient } from "@/lib/supabase/server";
import { LIBRARY_BUCKET } from "./server";

/** URL signée (1 h) d'un fichier du bucket « library » ; la politique Storage applique les droits. */
export async function getLibraryFileUrl(path: string): Promise<ActionResult<string>> {
  if (!(await getSession())) return fail("unauthenticated");
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(LIBRARY_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return fail("not_found");
  return ok(data.signedUrl);
}

/** Droits UI d'un écran de la bibliothèque (pour les modales-routes chargées côté client). */
export async function getLibraryRights(routeId: "LibraryRisks" | "LibraryEquipments" | "LibraryObjectManagement" | "LibraryTags") {
  const session = await getSession();
  const ctx = { authority: session?.collaborator.authority ?? null };
  return {
    add: !!session && can(routeId, "add", ctx),
    edit: !!session && can(routeId, "edit", ctx),
    delete: !!session && can(routeId, "delete", ctx),
  };
}
