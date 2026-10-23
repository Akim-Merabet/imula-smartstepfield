"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

const MAX_ENTRIES = 5;

/** Historique d'accès (spec 00 §3.1.2) : mémorise l'URL complète du sous-module ouvert, 5 entités au plus. */
export async function recordProjectAccess(projectId: string, url: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("unauthenticated");
  if (!z.uuid().safeParse(projectId).success || !url.startsWith(`/explore/projects/${projectId}/`) || url.length > 2000) return fail("invalid");
  const supabase = await createClient();
  const me = session.collaborator.id;
  const { error } = await supabase.from("project_access_history").upsert({
    collaborator_id: me, project_id: projectId, flow_filters: { url }, accessed_at: new Date().toISOString(),
  }, { onConflict: "collaborator_id,project_id" });
  if (error) return fail(dbError(error));
  const { data: stale } = await supabase.from("project_access_history").select("project_id")
    .eq("collaborator_id", me).order("accessed_at", { ascending: false }).range(MAX_ENTRIES, MAX_ENTRIES + 50);
  if (stale?.length) {
    await supabase.from("project_access_history").delete().eq("collaborator_id", me).in("project_id", stale.map((s) => s.project_id));
  }
  return ok(undefined);
}

/** « Supprimer de l'historique ». */
export async function removeProjectAccess(projectId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("unauthenticated");
  const supabase = await createClient();
  const { error } = await supabase.from("project_access_history").delete()
    .eq("collaborator_id", session.collaborator.id).eq("project_id", projectId);
  if (error) return fail(dbError(error));
  return ok(undefined);
}
