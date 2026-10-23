import { describe, expect, it } from "vitest";
import { generateAccessToken, generateClientId, generateClientSecret, hashSecret, hashToken, safeEqual, verifySecret } from "./crypto";
import { classAllows } from "./meta";
import { hitRateLimit } from "./rest/rate-limit";

describe("API credentials crypto", () => {
  it("generates identifiers with the expected shape and entropy", () => {
    expect(generateClientId()).toMatch(/^sfc_[0-9a-f]{32}$/);
    expect(generateClientSecret()).toMatch(/^sfs_[A-Za-z0-9_-]{43}$/);
    expect(generateAccessToken()).toMatch(/^sfat_[A-Za-z0-9_-]{43}$/);
    expect(generateClientSecret()).not.toBe(generateClientSecret());
  });

  it("hashes secrets with scrypt and a random salt, never storing the secret", async () => {
    const secret = generateClientSecret();
    const a = await hashSecret(secret);
    const b = await hashSecret(secret);
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(a).not.toContain(secret.slice(4));
    expect(a).not.toBe(b);
    expect(await verifySecret(secret, a)).toBe(true);
    expect(await verifySecret(secret, b)).toBe(true);
    expect(await verifySecret(`${secret}x`, a)).toBe(false);
    expect(await verifySecret(secret, "scrypt$bad")).toBe(false);
  }, 30_000);

  it("hashes tokens with SHA-256 and compares in constant time", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("Service classes", () => {
  it("L1 ⊂ L2 ⊂ L3", () => {
    expect(classAllows("L1", "L1")).toBe(true);
    expect(classAllows("L1", "L2")).toBe(false);
    expect(classAllows("L2", "L1")).toBe(true);
    expect(classAllows("L2", "L3")).toBe(false);
    expect(classAllows("L3", "L2")).toBe(true);
  });
});

describe("Rate limiting", () => {
  it("blocks after the limit within the window and resets after it", () => {
    const key = `test-${Math.random()}`;
    const now = 1_000_000;
    expect(hitRateLimit(key, 2, 60_000, now).allowed).toBe(true);
    expect(hitRateLimit(key, 2, 60_000, now + 1).allowed).toBe(true);
    const third = hitRateLimit(key, 2, 60_000, now + 2);
    expect(third.allowed).toBe(false);
    expect(third.retryAfter).toBeGreaterThan(0);
    expect(hitRateLimit(key, 2, 60_000, now + 60_001).allowed).toBe(true);
  });
});
