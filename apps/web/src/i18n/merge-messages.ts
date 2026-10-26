export type Messages = { [key: string]: string | Messages };

/** Superpose `overlay` à `base` clé par clé (récursif) ; les clés absentes de la surcouche gardent le texte de base. */
export function mergeMessages(base: Messages, overlay: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = out[key];
    out[key] = typeof value === "object" && typeof current === "object" ? mergeMessages(current, value) : value;
  }
  return out;
}
