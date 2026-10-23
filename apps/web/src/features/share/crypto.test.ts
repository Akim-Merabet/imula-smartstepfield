import { describe, expect, it } from "vitest";
import {
  CODE_LENGTH, MAX_CODE_ATTEMPTS, checkCode, generateCode, generateToken, hashCode, hashToken, isCodeFormat, isTokenFormat,
  safeEqual, sessionGrants, signSession, verifySession, type ShareSessionPayload,
} from "./crypto";

const SECRET = "test-secret-0123456789";
const OTHER = "other-secret-9876543210";

describe("jetons de lien", () => {
  it("génère des jetons de 256 bits au format base64url, tous distincts", () => {
    const set = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const t = generateToken();
      expect(isTokenFormat(t)).toBe(true);
      expect(Buffer.from(t, "base64url")).toHaveLength(32);
      set.add(t);
    }
    expect(set.size).toBe(500);
  });

  it("refuse les formats arbitraires", () => {
    for (const v of ["", "abc", "x".repeat(44), "../../etc/passwd", "a b".repeat(15), null, 42, "00000000-0000-4000-8000-000000000100"]) {
      expect(isTokenFormat(v)).toBe(false);
    }
  });

  it("hache de façon déterministe, dépendante du secret et sans révéler le jeton", () => {
    const t = generateToken();
    const h = hashToken(t, SECRET);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t, SECRET)).toBe(h);
    expect(hashToken(t, OTHER)).not.toBe(h);
    expect(hashToken(generateToken(), SECRET)).not.toBe(h);
    expect(h).not.toContain(t);
  });
});

describe("codes secrets", () => {
  it("génère des codes à 6 chiffres répartis sur tout l'intervalle", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const c = generateCode();
      expect(c).toHaveLength(CODE_LENGTH);
      expect(isCodeFormat(c)).toBe(true);
      seen.add(c[0]);
    }
    expect(seen.size).toBe(10);
  });

  it("lie le code au partage", () => {
    expect(hashCode("123456", "share-a", SECRET)).not.toBe(hashCode("123456", "share-b", SECRET));
  });

  const base = (over: Partial<Parameters<typeof checkCode>[0]> = {}) => ({
    code: "123456", shareId: "s1", secret: SECRET, codeHash: hashCode("123456", "s1", SECRET),
    codeExpiresAt: new Date(Date.now() + 60_000), attempts: 0, blocked: false, ...over,
  });

  it("accepte le bon code", () => {
    expect(checkCode(base())).toEqual({ ok: true });
  });

  it("refuse un mauvais code et compte l'essai", () => {
    const r = checkCode(base({ code: "654321" }));
    expect(r).toMatchObject({ ok: false, reason: "invalid", attempts: 1, blocked: false });
  });

  it("refuse le code d'un autre partage", () => {
    expect(checkCode(base({ codeHash: hashCode("123456", "s2", SECRET) })).ok).toBe(false);
  });

  it("refuse un code expiré", () => {
    expect(checkCode(base({ codeExpiresAt: new Date(Date.now() - 1) }))).toMatchObject({ ok: false, reason: "expired" });
  });

  it("refuse en l'absence de code demandé", () => {
    expect(checkCode(base({ codeHash: null }))).toMatchObject({ ok: false, reason: "no_code" });
  });

  it("bloque au-delà du nombre d'essais, même avec le bon code", () => {
    const last = checkCode(base({ code: "000000", attempts: MAX_CODE_ATTEMPTS - 1 }));
    expect(last).toMatchObject({ ok: false, blocked: true, attempts: MAX_CODE_ATTEMPTS });
    expect(checkCode(base({ attempts: MAX_CODE_ATTEMPTS }))).toMatchObject({ ok: false, reason: "blocked" });
    expect(checkCode(base({ blocked: true }))).toMatchObject({ ok: false, reason: "blocked" });
  });

  it("refuse les saisies mal formées sans lever d'exception", () => {
    for (const code of ["", "12345", "1234567", "abcdef", " 123456"]) expect(checkCode(base({ code })).ok).toBe(false);
  });
});

describe("comparaison en temps constant", () => {
  it("compare correctement", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("cookie de session de partage", () => {
  const token = generateToken();
  const tokenHash = hashToken(token, SECRET);
  const payload: ShareSessionPayload = { v: 1, k: "form", sid: "11111111-1111-4111-8111-111111111111", th: tokenHash.slice(0, 16), exp: Date.now() + 60_000 };
  const share = { id: payload.sid, kind: "form" as const, tokenHash };

  it("vérifie une session signée et l'accepte pour son partage", () => {
    const cookie = signSession(payload, SECRET);
    const s = verifySession(cookie, SECRET);
    expect(s).toEqual(payload);
    expect(sessionGrants(s, share)).toBe(true);
  });

  it("refuse une signature d'un autre secret ou altérée", () => {
    expect(verifySession(signSession(payload, OTHER), SECRET)).toBeNull();
    const cookie = signSession(payload, SECRET);
    const [body, sig] = cookie.split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, sid: "22222222-2222-4222-8222-222222222222" })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(verifySession(`${body}.${sig.slice(0, -2)}xx`, SECRET)).toBeNull();
    expect(verifySession(`${body}`, SECRET)).toBeNull();
    expect(verifySession(`${body}.${sig}.x`, SECRET)).toBeNull();
    expect(verifySession("", SECRET)).toBeNull();
    expect(verifySession(null, SECRET)).toBeNull();
  });

  it("refuse une session expirée", () => {
    expect(verifySession(signSession({ ...payload, exp: Date.now() - 1 }, SECRET), SECRET)).toBeNull();
  });

  it("n'ouvre pas un autre partage avec le même cookie", () => {
    const s = verifySession(signSession(payload, SECRET), SECRET);
    const other = { id: "22222222-2222-4222-8222-222222222222", kind: "form" as const, tokenHash: hashToken(generateToken(), SECRET) };
    expect(sessionGrants(s, other)).toBe(false);
    // Même id mais autre type de cible (document) : refusé.
    expect(sessionGrants(s, { ...share, kind: "document" })).toBe(false);
  });

  it("est invalidée quand le jeton est renouvelé (renvoi du lien)", () => {
    const s = verifySession(signSession(payload, SECRET), SECRET);
    expect(sessionGrants(s, { ...share, tokenHash: hashToken(generateToken(), SECRET) })).toBe(false);
  });

  it("refuse l'absence de session", () => {
    expect(sessionGrants(null, share)).toBe(false);
  });
});
