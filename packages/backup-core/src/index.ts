/**
 * Sauvegardes chiffrées de l'app terrain (spec 05 §6.1, §9.9) : l'appareil chiffre avec la clé PUBLIQUE de
 * l'organisation, seul le serveur (clé privée) peut relire. Chiffrement hybride NaCl (tweetnacl, JavaScript pur) :
 * une clé symétrique aléatoire chiffre le contenu (secretbox), elle-même chiffrée pour l'organisation (box, clé
 * éphémère). Format « IMB1 » :
 *   "IMB1" | clé publique éphémère (32) | nonce (24) | box(clé symétrique) (48) | nonce (24) | secretbox(deflate(contenu))
 */
import { deflate, inflate } from "pako";
import nacl from "tweetnacl";

export type RandomBytes = (n: number) => Uint8Array;

const MAGIC = new Uint8Array([0x49, 0x4d, 0x42, 0x31]); // "IMB1"
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? B64[n & 63] : "=");
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12)
      | ((B64.indexOf(clean[i + 2] ?? "A") & 63) << 6) | (B64.indexOf(clean[i + 3] ?? "A") & 63);
    out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

/** Paire de clés d'une organisation (publique : diffusée aux appareils ; privée : gardée par le serveur). */
export function generateBackupKeyPair(randomBytes: RandomBytes): { publicKey: string; secretKey: string } {
  const kp = nacl.box.keyPair.fromSecretKey(randomBytes(nacl.box.secretKeyLength));
  return { publicKey: toBase64(kp.publicKey), secretKey: toBase64(kp.secretKey) };
}

export function encryptBackup(content: Uint8Array, publicKey: string, randomBytes: RandomBytes): Uint8Array {
  const recipient = fromBase64(publicKey);
  if (recipient.length !== nacl.box.publicKeyLength) throw new Error("Clé publique de sauvegarde invalide");
  const ephemeral = nacl.box.keyPair.fromSecretKey(randomBytes(nacl.box.secretKeyLength));
  const key = randomBytes(nacl.secretbox.keyLength);
  const keyNonce = randomBytes(nacl.box.nonceLength);
  const boxedKey = nacl.box(key, keyNonce, recipient, ephemeral.secretKey);
  const dataNonce = randomBytes(nacl.secretbox.nonceLength);
  const sealed = nacl.secretbox(deflate(content), dataNonce, key);
  const parts = [MAGIC, ephemeral.publicKey, keyNonce, boxedKey, dataNonce, sealed];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function decryptBackup(data: Uint8Array, secretKey: string): Uint8Array {
  if (data.length < 4 + 32 + 24 + 48 + 24 || !MAGIC.every((b, i) => data[i] === b)) throw new Error("Fichier de sauvegarde invalide");
  let o = 4;
  const take = (n: number) => data.subarray(o, (o += n));
  const ephemeralPublic = take(32);
  const keyNonce = take(24);
  const boxedKey = take(48);
  const dataNonce = take(24);
  const sealed = data.subarray(o);
  const key = nacl.box.open(boxedKey, keyNonce, ephemeralPublic, fromBase64(secretKey));
  if (!key) throw new Error("Clé privée incorrecte");
  const plain = nacl.secretbox.open(sealed, dataNonce, key);
  if (!plain) throw new Error("Sauvegarde altérée");
  return inflate(plain);
}

/** Contenu d'une sauvegarde : données locales du profil et file d'envoi (écritures non encore envoyées). */
export type BackupContent = {
  version: 1;
  createdAt: string;
  trigger: "manual" | "support" | "auto" | "database_error";
  principalId: string;
  deviceId: string | null;
  appVersion: string | null;
  /** Écritures en attente d'envoi (ps_crud), dans l'ordre. */
  pending: unknown[];
  /** Lignes par table (tables synchronisées et tables propres à l'appareil). */
  tables: Record<string, Record<string, unknown>[]>;
};
