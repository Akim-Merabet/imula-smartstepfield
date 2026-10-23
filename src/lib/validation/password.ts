/** Politique de mot de passe (recommandations ANSSI) — spec 01 §2.4. */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
const SPECIALS = "!@#$%^&*()_+€£µ§?/\\|{}[].,=-";
const COMMON_WORDS = ["password", "motdepasse", "qwerty", "azerty", "admin", "welcome", "login"];

export type PasswordRules = { length: boolean; letter: boolean; digit: boolean; special: boolean; common: boolean };
export type PasswordLevel = "insufficient" | "weak" | "medium" | "strong";

function hasAscendingRun(value: string): boolean {
  for (let i = 0; i + 2 < value.length; i++) {
    const a = value.charCodeAt(i);
    if (value.charCodeAt(i + 1) === a + 1 && value.charCodeAt(i + 2) === a + 2) return true;
  }
  return false;
}

export function checkPassword(value: string): PasswordRules {
  const lower = value.toLowerCase();
  return {
    length: value.length >= PASSWORD_MIN && value.length <= PASSWORD_MAX,
    letter: /[a-zA-Z]/.test(value),
    digit: /\d/.test(value),
    special: [...value].some((c) => SPECIALS.includes(c)),
    common:
      value.length > 0 &&
      !COMMON_WORDS.some((w) => lower.includes(w)) &&
      !/(.)\1{2,}/.test(value) &&
      !hasAscendingRun(value),
  };
}

export function passwordLevel(value: string): PasswordLevel {
  const rules = checkPassword(value);
  const specials = [...value].filter((c) => SPECIALS.includes(c)).length;
  const alphabet = (/[a-z]/.test(value) ? 26 : 0) + (/[A-Z]/.test(value) ? 26 : 0) + (/\d/.test(value) ? 10 : 0) + (specials ? SPECIALS.length : 0);
  const entropy = alphabet > 0 ? value.length * Math.log2(alphabet) : 0;
  if (entropy < 60) return "insufficient";
  const ratio = Object.values(rules).filter(Boolean).length / 5;
  if (ratio < 0.4) return "weak";
  if (ratio < 0.8) return "medium";
  return "strong";
}

export function isPasswordValid(value: string): boolean {
  return Object.values(checkPassword(value)).every(Boolean);
}
