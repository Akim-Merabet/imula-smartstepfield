/**
 * Primitives cryptographiques du partage externe (spec 03 §9, spec 04 §5.8).
 * Module pur (sans dépendance Next / Supabase) : testé par `crypto.test.ts`.
 *
 * - Jeton de lien : 32 octets aléatoires (base64url, 43 caractères), stocké haché (HMAC-SHA256 + secret serveur).
 * - Code secret : 6 chiffres, haché avec le secret et l'id du partage, expiration courte, essais limités.
 * - Cookie de session de partage : charge utile JSON signée HMAC-SHA256, liée au partage et au jeton courant.
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const TOKEN_BYTES = 32;
export const CODE_LENGTH = 6;
/** Durée de validité d'un code secret. */
export const CODE_TTL_MS = 10 * 60_000;
/** Nombre d'essais de code avant blocage du partage. */
export const MAX_CODE_ATTEMPTS = 5;
/** Délai minimal entre deux envois de code. */
export const CODE_RESEND_COOLDOWN_MS = 30_000;
/** Délai restant avant de pouvoir redemander un code. */
export function remainingCooldownMs(codeSentAt: string | null, now = Date.now()): number {
  if (!codeSentAt) return 0;
  return Math.max(0, CODE_RESEND_COOLDOWN_MS - (now - new Date(codeSentAt).getTime()));
}

/** Durée de la session externe (cookie). */
export const SESSION_TTL_MS = 4 * 60 * 60_000;

export type ShareKind = "form" | "document";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const CODE_RE = /^\d{6}$/;

/** Jeton de lien non devinable (256 bits). */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Forme attendue d'un jeton (refus précoce des valeurs arbitraires). */
export function isTokenFormat(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

function hmac(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

/** Empreinte stockée du jeton (seule valeur conservée en base). */
export function hashToken(token: string, secret: string): string {
  return hmac(secret, `share-token:${token}`);
}

/** Code secret à 6 chiffres (tirage uniforme). */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

export function isCodeFormat(code: unknown): code is string {
  return typeof code === "string" && CODE_RE.test(code);
}

/** Empreinte du code, liée au partage (un code ne vaut que pour son partage). */
export function hashCode(code: string, shareId: string, secret: string): string {
  return hmac(secret, `share-code:${shareId}:${code}`);
}

/** Comparaison en temps constant de deux chaînes (longueurs différentes = faux, sans fuite de contenu). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    // Comparaison factice pour un temps comparable.
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

export type CodeCheck =
  | { ok: true }
  | { ok: false; reason: "blocked" | "no_code" | "expired" | "invalid"; attempts: number; blocked: boolean };

/**
 * Vérifie un code saisi. `attempts` = essais infructueux déjà comptés.
 * Un échec incrémente le compteur ; au-delà de MAX_CODE_ATTEMPTS, le partage est bloqué.
 */
export function checkCode(input: {
  code: string; shareId: string; secret: string; codeHash: string | null; codeExpiresAt: string | Date | null;
  attempts: number; blocked: boolean; now?: number;
}): CodeCheck {
  const now = input.now ?? Date.now();
  if (input.blocked || input.attempts >= MAX_CODE_ATTEMPTS) return { ok: false, reason: "blocked", attempts: input.attempts, blocked: true };
  if (!input.codeHash || !input.codeExpiresAt) return { ok: false, reason: "no_code", attempts: input.attempts, blocked: false };
  const attempts = input.attempts + 1;
  const blocked = attempts >= MAX_CODE_ATTEMPTS;
  if (new Date(input.codeExpiresAt).getTime() <= now) return { ok: false, reason: "expired", attempts, blocked };
  const candidate = isCodeFormat(input.code) ? hashCode(input.code, input.shareId, input.secret) : "";
  if (!safeEqual(candidate, input.codeHash)) return { ok: false, reason: "invalid", attempts, blocked };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Cookie de session de partage
// ---------------------------------------------------------------------------------------------

export type ShareSessionPayload = {
  v: 1;
  /** Type de cible. */
  k: ShareKind;
  /** Id du partage (form_shares / document_shares). */
  sid: string;
  /** 16 premiers caractères de l'empreinte du jeton courant : un renvoi (nouveau jeton) invalide la session. */
  th: string;
  /** Échéance (ms epoch). */
  exp: number;
};

export function signSession(payload: ShareSessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(`share-session:${body}`).digest("base64url");
  return `${body}.${sig}`;
}

/** Charge utile d'un cookie si la signature est valide et non expirée ; null sinon. */
export function verifySession(value: string | null | undefined, secret: string, now = Date.now()): ShareSessionPayload | null {
  if (!value || value.length > 1024) return null;
  const dot = value.indexOf(".");
  if (dot <= 0 || dot !== value.lastIndexOf(".")) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(`share-session:${body}`).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const p = parsed as Partial<ShareSessionPayload>;
  if (p?.v !== 1 || (p.k !== "form" && p.k !== "document") || typeof p.sid !== "string" || typeof p.th !== "string"
    || typeof p.exp !== "number" || p.exp <= now) return null;
  return p as ShareSessionPayload;
}

/**
 * Contrôle d'accès : la session n'ouvre que le partage auquel elle est liée,
 * pour le jeton courant (empreinte), et pour le bon type de cible.
 */
export function sessionGrants(session: ShareSessionPayload | null, share: { id: string; kind: ShareKind; tokenHash: string }): boolean {
  if (!session) return false;
  return session.k === share.kind
    && safeEqual(session.sid, share.id)
    && safeEqual(session.th, share.tokenHash.slice(0, 16));
}
