import { describe, expect, it } from "vitest";

import { decryptBackup, encryptBackup, fromBase64, generateBackupKeyPair, toBase64 } from "./index";

const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));

describe("sauvegardes chiffrées", () => {
  it("base64 aller-retour", () => {
    for (const n of [0, 1, 2, 3, 31, 32, 100]) {
      const b = rnd(n);
      expect(fromBase64(toBase64(b))).toEqual(b);
    }
    expect(toBase64(new TextEncoder().encode("IMB"))).toBe("SU1C");
  });

  it("chiffre avec la clé publique, déchiffre avec la clé privée", () => {
    const keys = generateBackupKeyPair(rnd);
    const content = new TextEncoder().encode(JSON.stringify({ tables: { steps: [{ id: "a", name: "Étape é" }] } }));
    const sealed = encryptBackup(content, keys.publicKey, rnd);
    expect(new TextDecoder().decode(sealed.subarray(0, 4))).toBe("IMB1");
    expect(new TextDecoder().decode(decryptBackup(sealed, keys.secretKey))).toContain("Étape é");
  });

  it("refuse une autre clé et un contenu altéré", () => {
    const keys = generateBackupKeyPair(rnd);
    const other = generateBackupKeyPair(rnd);
    const sealed = encryptBackup(new Uint8Array([1, 2, 3]), keys.publicKey, rnd);
    expect(() => decryptBackup(sealed, other.secretKey)).toThrow("Clé privée incorrecte");
    const broken = sealed.slice();
    broken[broken.length - 1] ^= 1;
    expect(() => decryptBackup(broken, keys.secretKey)).toThrow("Sauvegarde altérée");
    expect(() => decryptBackup(new Uint8Array(10), keys.secretKey)).toThrow("invalide");
  });
});
