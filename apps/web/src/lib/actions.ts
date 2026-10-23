import "server-only";
import { getSession, type Session } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import type { Action } from "@/lib/permissions/types";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; details?: unknown };

export const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (error: string, details?: unknown): ActionResult<never> => ({ ok: false, error, details });

/**
 * Vérifie session + permission UI (la RLS reste l'autorité finale).
 * En contexte d'entité, le rôle de l'utilisateur dans l'entité est pris en compte.
 */
export async function authorize(routeId: string, action: Action, projectId?: string | null):
  Promise<{ session: Session } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "unauthenticated" };
  let projectRole = null;
  if (projectId) {
    const supabase = await createClient();
    const { data } = await supabase.from("project_members").select("role")
      .eq("project_id", projectId).eq("collaborator_id", session.collaborator.id).maybeSingle();
    projectRole = data?.role ?? null;
  }
  if (!can(routeId, action, { authority: session.collaborator.authority, projectRole })) return { error: "forbidden" };
  return { session };
}

/** Traduit les erreurs Postgres courantes en codes applicatifs. */
export function dbError(error: { code?: string; message?: string } | null): string {
  if (!error) return "unknown";
  if (error.code === "23505") return "duplicate";
  if (error.code === "23503") return "in_use";
  if (error.code === "42501") return "forbidden";
  if (error.code === "23514") return "invalid";
  return "unknown";
}
