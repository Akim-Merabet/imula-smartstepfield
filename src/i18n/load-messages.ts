import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Locale } from "./config";

type Messages = Record<string, unknown>;
const cache = new Map<Locale, Messages>();

/** Fusionne messages/<locale>/*.json : chaque fichier = un namespace (nom du fichier). */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const cached = cache.get(locale);
  if (cached && process.env.NODE_ENV === "production") return cached;

  const dir = path.join(process.cwd(), "messages", locale);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const messages: Messages = {};
  for (const file of files) {
    const ns = file.slice(0, -".json".length);
    messages[ns] = JSON.parse(await readFile(path.join(dir, file), "utf8"));
  }
  cache.set(locale, messages);
  return messages;
}
