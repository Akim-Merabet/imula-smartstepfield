import { type Bool, on } from "./types";

/** Numéro affiché : numéro personnalisé, sinon préfixe + rang (hors éléments exclus de la numérotation). */
export function numberItems<T extends { id: string; custom_number: string | null; exclude_numbering: Bool }>(
  items: T[], prefix: string,
): Map<string, string> {
  const out = new Map<string, string>();
  let n = 0;
  for (const it of items) {
    if (!on(it.exclude_numbering)) n += 1;
    out.set(it.id, it.custom_number?.trim() || (on(it.exclude_numbering) ? "—" : `${prefix}${n}`));
  }
  return out;
}
