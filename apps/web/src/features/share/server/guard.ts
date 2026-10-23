import "server-only";
import { redirect } from "next/navigation";
import { resolveShareAccess, type ResolvedShare, type ShareState } from "./access";
import { describeTarget, type TargetInfo } from "./target";

export const shareBase = (token: string) => `/share/${token}`;
export const initPath = (token: string, share: ResolvedShare) => `${shareBase(token)}/${share.kind === "form" ? "init-form" : "init-document"}`;

/** Étape suivant l'authentification par code. */
export function nextStep(token: string, share: ResolvedShare): string {
  if (!share.contributor) return `${shareBase(token)}/contributor-info`;
  if (share.kind === "document") return `${shareBase(token)}/document`;
  return share.respondedAt ? `${shareBase(token)}/finish` : `${shareBase(token)}/form`;
}

export type GuardResult =
  | { ok: true; share: ResolvedShare; target: TargetInfo; authenticated: boolean }
  | { ok: false; reason: "not_found" | Exclude<ShareState, "ok"> };

/**
 * Garde d'une page du parcours externe.
 * - `public` : page accessible sans session (init, login) ; redirige vers l'étape suivante si déjà authentifié.
 * - `session` : session de partage exigée.
 * - `contributor` : session + informations contributeur renseignées.
 */
export async function guardSharePage(token: string, need: "public" | "session" | "contributor", kind?: "form" | "document"): Promise<GuardResult> {
  const access = await resolveShareAccess(token);
  if (!access.ok) return { ok: false, reason: access.reason };
  const { share, authenticated } = access;
  if (kind && share.kind !== kind) redirect(initPath(token, share));
  const target = await describeTarget(share);
  if (!target) return { ok: false, reason: "not_found" };
  if (need === "public") {
    if (authenticated) redirect(nextStep(token, share));
    return { ok: true, share, target, authenticated };
  }
  if (!authenticated) redirect(initPath(token, share));
  if (need === "contributor" && !share.contributor) redirect(`${shareBase(token)}/contributor-info`);
  return { ok: true, share, target, authenticated };
}
