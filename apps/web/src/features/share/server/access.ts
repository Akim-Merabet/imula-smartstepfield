import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  SESSION_TTL_MS, hashToken, isTokenFormat, sessionGrants, signSession, verifySession, type ShareKind,
} from "../crypto";

export const SHARE_COOKIE = "sf_share";

/** Secret serveur des empreintes et du cookie (SHARE_SECRET, sinon dérivé de la clé service). */
export function shareSecret(): string {
  const s = process.env.SHARE_SECRET;
  if (s && s.length >= 32) return s;
  const k = process.env.SUPABASE_SECRET_KEY;
  if (!k) throw new Error("missing_share_secret");
  return createHash("sha256").update(`share-secret:${k}`).digest("hex");
}

export type Contributor = { firstName: string; lastName: string; email: string; company: string; job: string };

export type ResolvedShare = {
  kind: ShareKind;
  id: string;
  tokenHash: string;
  organizationId: string;
  projectId: string;
  email: string;
  language: "fr" | "en";
  comment: string | null;
  expiresAt: string;
  revokedAt: string | null;
  blocked: boolean;
  respondedAt: string | null;
  codeHash: string | null;
  codeExpiresAt: string | null;
  codeAttempts: number;
  codeSentAt: string | null;
  contributor: Contributor | null;
  externalUserId: string | null;
  sentBy: string | null;
  /** Partage de formulaire : formulaire vierge (formId) ou réponse existante (responseId). */
  formId: string | null;
  responseId: string | null;
  contributionResponseId: string | null;
  /** Partage de document. */
  documentId: string | null;
  versionId: string | null;
};

export type ShareState = "ok" | "expired" | "revoked" | "blocked";

const lang = (l: string): "fr" | "en" => (l === "fr" ? "fr" : "en");
const contributorOf = (j: Json | null): Contributor | null => {
  const c = j as Partial<Contributor> | null;
  return c && typeof c.firstName === "string" && typeof c.lastName === "string"
    ? { firstName: c.firstName, lastName: c.lastName, email: c.email ?? "", company: c.company ?? "", job: c.job ?? "" }
    : null;
};

/** Partage désigné par un jeton (recherche par empreinte uniquement). */
export async function findShareByToken(token: string): Promise<ResolvedShare | null> {
  if (!isTokenFormat(token)) return null;
  const tokenHash = hashToken(token, shareSecret());
  const db = createAdminClient();
  const [{ data: f }, { data: d }] = await Promise.all([
    db.from("form_shares").select("*").eq("token_hash", tokenHash).maybeSingle(),
    db.from("document_shares").select("*").eq("token_hash", tokenHash).maybeSingle(),
  ]);
  if (f) {
    return {
      kind: "form", id: f.id, tokenHash: f.token_hash, organizationId: f.organization_id, projectId: f.project_id, email: f.email,
      language: lang(f.language), comment: f.comment, expiresAt: f.expires_at, revokedAt: f.revoked_at, blocked: f.blocked,
      respondedAt: f.responded_at, codeHash: f.code_hash, codeExpiresAt: f.code_expires_at, codeAttempts: f.code_attempts,
      codeSentAt: f.code_sent_at, contributor: contributorOf(f.contributor), externalUserId: f.external_user_id, sentBy: f.sent_by,
      formId: f.form_id, responseId: f.response_id, contributionResponseId: f.contribution_response_id, documentId: null, versionId: null,
    };
  }
  if (d) {
    return {
      kind: "document", id: d.id, tokenHash: d.token_hash, organizationId: d.organization_id, projectId: d.project_id, email: d.email,
      language: lang(d.language), comment: d.comment, expiresAt: d.expires_at, revokedAt: d.revoked_at, blocked: d.blocked,
      respondedAt: d.downloaded_at, codeHash: d.code_hash, codeExpiresAt: d.code_expires_at, codeAttempts: d.code_attempts,
      codeSentAt: d.code_sent_at, contributor: contributorOf(d.contributor), externalUserId: d.external_user_id, sentBy: d.sent_by,
      formId: null, responseId: null, contributionResponseId: null, documentId: d.document_id, versionId: d.version_id,
    };
  }
  return null;
}

export function shareState(s: ResolvedShare, now = Date.now()): ShareState {
  if (s.revokedAt) return "revoked";
  if (new Date(s.expiresAt).getTime() <= now) return "expired";
  if (s.blocked) return "blocked";
  return "ok";
}

/** Table d'un partage. */
export const shareTable = (kind: ShareKind) => (kind === "form" ? "form_shares" : "document_shares");

/** Lecture du cookie de session de partage (signature + échéance vérifiées). */
export async function readShareSession() {
  const store = await cookies();
  return verifySession(store.get(SHARE_COOKIE)?.value, shareSecret());
}

/** Ouvre une session pour ce partage (remplace toute session précédente : un seul partage par cookie). */
export async function openShareSession(share: ResolvedShare) {
  const store = await cookies();
  const value = signSession({ v: 1, k: share.kind, sid: share.id, th: share.tokenHash.slice(0, 16), exp: Date.now() + SESSION_TTL_MS }, shareSecret());
  store.set(SHARE_COOKIE, value, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/share", maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function closeShareSession() {
  const store = await cookies();
  store.delete({ name: SHARE_COOKIE, path: "/share" });
}

export type ShareAccess =
  | { ok: true; share: ResolvedShare; authenticated: boolean }
  | { ok: false; reason: "not_found" | Exclude<ShareState, "ok"> };

/**
 * Résout un jeton et l'état de la session externe. `authenticated` n'est vrai que si le cookie
 * est lié à CE partage et au jeton courant (sessionGrants).
 */
export async function resolveShareAccess(token: string): Promise<ShareAccess> {
  const share = await findShareByToken(token);
  if (!share) return { ok: false, reason: "not_found" };
  const state = shareState(share);
  if (state !== "ok") return { ok: false, reason: state };
  const session = await readShareSession();
  return { ok: true, share, authenticated: sessionGrants(session, share) };
}

/** Exige une session valide (code vérifié) pour ce partage — à appeler dans chaque handler / action externe. */
export async function requireShareSession(token: string, opts: { kind?: ShareKind; contributor?: boolean } = {}):
  Promise<{ ok: true; share: ResolvedShare } | { ok: false; error: string }> {
  const access = await resolveShareAccess(token);
  if (!access.ok) return { ok: false, error: access.reason };
  if (!access.authenticated) return { ok: false, error: "unauthenticated" };
  if (opts.kind && access.share.kind !== opts.kind) return { ok: false, error: "not_found" };
  if (opts.contributor && !access.share.contributor) return { ok: false, error: "contributor_required" };
  return { ok: true, share: access.share };
}

/** Réponse ciblée par un partage de formulaire (réponse partagée, ou contribution créée par l'externe). */
export const targetResponseId = (s: ResolvedShare) => s.responseId ?? s.contributionResponseId;
