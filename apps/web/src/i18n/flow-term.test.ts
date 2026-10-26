import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { flowTerms, locales } from "./config";
import { mergeMessages, type Messages } from "./merge-messages";

// Surcouches de vocabulaire (organizations.flow_term) : chaque libellé où « flow » apparaît doit être redéfini,
// sinon une organisation « Procédure » verrait encore « flow » dans l'interface ou les PDF.
const root = path.join(__dirname, "../../messages");
const FLOW = /(?<![{\w])flows?(?!\w)/i;
/** Libellés qui gardent « flow » quel que soit le vocabulaire : noms de l'API, le réglage du vocabulaire lui-même. */
const KEEP = new Set(["apiAccess.v1.explanation", "settings.organization.flowTerms.flow", "settings.organization.fields.flow_term"]);

function read(dir: string): Messages {
  const out: Messages = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) out[f.slice(0, -5)] = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
  return out;
}

function flatten(m: Messages, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(m)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

/** Noms des arguments ICU (`{name}`, `{count, plural, …}`), pas le texte des branches. */
const args = (s: string) => [...s.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]).sort();

describe("surcouches de vocabulaire", () => {
  for (const locale of locales) {
    for (const term of flowTerms.filter((x) => x !== "flow")) {
      const base = flatten(read(path.join(root, locale)));
      const overlay = flatten(read(path.join(root, `${locale}.${term}`)));

      it(`${locale}.${term} redéfinit chaque libellé contenant « flow »`, () => {
        const missing = [...base].filter(([k, v]) => FLOW.test(v) && !KEEP.has(k) && !overlay.has(k)).map(([k]) => k);
        expect(missing).toEqual([]);
      });

      it(`${locale}.${term} ne contient que des clés existantes, sans « flow », aux mêmes paramètres`, () => {
        for (const [k, v] of overlay) {
          expect(base.has(k), k).toBe(true);
          expect(FLOW.test(v), `${k} : ${v}`).toBe(false);
          expect(args(v), k).toEqual(args(base.get(k)!));
        }
      });
    }
  }

  it("superpose sans perdre les autres libellés", () => {
    expect(mergeMessages({ a: { b: "flow", c: "x" } }, { a: { b: "procédure" } })).toEqual({ a: { b: "procédure", c: "x" } });
  });
});
