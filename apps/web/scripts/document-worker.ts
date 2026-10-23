/**
 * Worker de génération PDF (reprises / file d'attente) — `npm run worker:documents`.
 *   --once              traite la file une fois puis s'arrête
 *   --interval=<ms>     intervalle de sondage (défaut 5000)
 *   --render=<versionId> [--action=preview] [--out=fichier.pdf]   rendu direct sans file (diagnostic)
 * Variables lues dans .env.local : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";

/*
 * tsx exécute ce script en CommonJS : les paquets ESM-only n'exposant que la condition « import »
 * (ex. @react-pdf/hyphenate/*) ne sont pas résolubles par require(). Repli : résolution manuelle de
 * leur champ `exports` avec la condition « import ».
 */
type Resolver = (request: string, parent: { filename?: string | null } | null, ...rest: unknown[]) => string;
const mod = Module as unknown as { _resolveFilename: Resolver };
const original = mod._resolveFilename;
mod._resolveFilename = function patched(request, parent, ...rest) {
  try {
    return original.call(this, request, parent, ...rest);
  } catch (err) {
    if ((err as { code?: string }).code !== "ERR_PACKAGE_PATH_NOT_EXPORTED" || !parent?.filename) throw err;
    const parts = request.split("/");
    const name = request.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
    const sub = `.${request.slice(name.length)}` || ".";
    for (let dir = path.dirname(parent.filename); dir !== path.dirname(dir); dir = path.dirname(dir)) {
      const pkgDir = path.join(dir, "node_modules", name);
      const pkgFile = path.join(pkgDir, "package.json");
      if (!existsSync(pkgFile)) continue;
      const exportsField = JSON.parse(readFileSync(pkgFile, "utf8")).exports as Record<string, Record<string, string> | string>;
      const pick = (target: Record<string, string> | string | undefined) => (typeof target === "string" ? target : target?.import ?? target?.default);
      let target = pick(exportsField[sub === "." ? "." : sub]);
      if (!target && exportsField["./*"]) target = pick(exportsField["./*"])?.replace("*", sub.slice(2));
      if (target) return path.join(pkgDir, target);
    }
    throw err;
  }
};

const envFile = path.join(process.cwd(), ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? "true"] as const;
}));

async function main() {
  const { drainDocumentQueue, requeueStaleTasks } = await import("../src/features/documents/pdf/worker");
  const { createWorkerClient } = await import("../src/features/documents/pdf/service-client");
  const db = createWorkerClient();

  const render = args.get("render");
  if (render) {
    const { generateDocumentPdf } = await import("../src/features/documents/pdf/generate");
    const pdf = await generateDocumentPdf(db, render, (args.get("action") ?? "preview") as never, {}, { serviceDb: db });
    if (!pdf) throw new Error("nothing_to_generate");
    const out = args.get("out") ?? pdf.fileName;
    writeFileSync(out, pdf.bytes);
    console.info(`[document-worker] ${out} : ${pdf.pageCount} pages${pdf.warnings.length ? ` (${pdf.warnings.join(", ")})` : ""}`);
    return;
  }

  const interval = Number(args.get("interval") ?? 5000);
  let stop = false;
  process.on("SIGINT", () => { stop = true; });
  process.on("SIGTERM", () => { stop = true; });
  do {
    const stale = await requeueStaleTasks(db);
    if (stale) console.info(`[document-worker] ${stale} tâche(s) abandonnée(s) remise(s) en file`);
    const n = await drainDocumentQueue({ db, max: 20 });
    if (n) console.info(`[document-worker] ${n} tâche(s) traitée(s)`);
    if (args.has("once")) break;
    await new Promise((r) => setTimeout(r, interval));
  } while (!stop);
}

main().catch((err) => {
  console.error(`[document-worker] ${err instanceof Error ? err.message : "error"}`);
  process.exit(1);
});
