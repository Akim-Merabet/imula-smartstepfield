import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { FlowTerm, Locale } from "./config";
import { mergeMessages, type Messages } from "./merge-messages";

const cache = new Map<string, Messages>();

async function readDir(dir: string): Promise<Messages> {
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".json")).sort();
  const messages: Messages = {};
  for (const file of files) {
    const ns = file.slice(0, -".json".length);
    messages[ns] = JSON.parse(await readFile(path.join(dir, file), "utf8"));
  }
  return messages;
}

/**
 * Fusionne messages/<locale>/*.json (chaque fichier = un namespace), puis la surcouche du vocabulaire de
 * l'organisation messages/<locale>.<terme>/*.json : seuls les libellés où le terme apparaît y sont redéfinis.
 */
export async function loadMessages(locale: Locale, term: FlowTerm = "flow"): Promise<Messages> {
  const key = `${locale}.${term}`;
  const cached = cache.get(key);
  if (cached && process.env.NODE_ENV === "production") return cached;

  const root = path.join(process.cwd(), "messages");
  const base = await readDir(path.join(root, locale));
  const messages = term === "flow" ? base : mergeMessages(base, await readDir(path.join(root, `${locale}.${term}`)));
  cache.set(key, messages);
  return messages;
}
