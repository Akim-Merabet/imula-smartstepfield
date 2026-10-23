import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Primitives cryptographiques des clés API (sans dépendance externe, `node:crypto`).
 * - client_id : identifiant public `sfc_<32 hex>` ;
 * - client_secret : `sfs_<43 base64url>` (256 bits), stocké sous forme d'empreinte scrypt salée ;
 * - jeton d'accès : opaque `sfat_<43 base64url>` (256 bits), stocké sous forme d'empreinte SHA-256.
 * Ce module n'importe rien de Next ni de Supabase : il est testable directement (vitest).
 */

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

function scryptAsync(secret: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export function generateClientId(): string {
  return `sfc_${randomBytes(16).toString("hex")}`;
}

export function generateClientSecret(): string {
  return `sfs_${randomBytes(32).toString("base64url")}`;
}

export function generateAccessToken(): string {
  return `sfat_${randomBytes(32).toString("base64url")}`;
}

/** Empreinte scrypt au format `scrypt$N$r$p$<sel b64>$<empreinte b64>`. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(secret, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), key.toString("base64")].join("$");
}

// Empreinte factice : vérification de durée équivalente quand le client_id est inconnu (pas d'oracle temporel).
let dummyHash: Promise<string> | null = null;
export function dummySecretHash(): Promise<string> {
  dummyHash ??= hashSecret(randomBytes(32).toString("base64url"));
  return dummyHash;
}

/** Vérifie un secret contre son empreinte, comparaison en temps constant. */
export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const N = Number(n), R = Number(r), P = Number(p);
  if (!Number.isInteger(N) || !Number.isInteger(R) || !Number.isInteger(P) || expected.length === 0) return false;
  const actual = await scryptAsync(secret, Buffer.from(saltB64, "base64"), expected.length, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Empreinte SHA-256 (hex) d'un jeton d'accès : seule cette valeur est stockée. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Comparaison de chaînes en temps constant (longueurs différentes → false, sans court-circuit sur le contenu). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

export const ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60;
