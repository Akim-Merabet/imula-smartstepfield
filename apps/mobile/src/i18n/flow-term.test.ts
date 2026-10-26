import { afterEach, describe, expect, it } from "vitest";

import { fr, setFlowTerm, t } from "./fr";
import { frIntervention } from "./fr-intervention";
import { frProcedure } from "./fr-procedure";

// Vocabulaires d'organisation (organizations.flow_term) : chaque libellé où « flow » apparaît doit être redéfini.
const FLOW = /(?<![{\w])flows?(?!\w)/i;
/** Libellés qui gardent « flow » quel que soit le vocabulaire : nom du produit. */
const KEEP = new Set(["login.errors.INVALID_QR"]);

function flatten(node: object, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else for (const [kk, vv] of flatten(v as object, key)) out.set(kk, vv);
  }
  return out;
}

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("vocabulaires d'organisation", () => {
  const base = flatten(fr);
  afterEach(() => setFlowTerm(null));

  for (const [term, messages] of [["procedure", frProcedure], ["intervention", frIntervention]] as const) {
    const overlay = flatten(messages);

    it(`${term} redéfinit chaque libellé contenant « flow »`, () => {
      expect([...base].filter(([k, v]) => FLOW.test(v) && !KEEP.has(k) && !overlay.has(k)).map(([k]) => k)).toEqual([]);
    });

    it(`${term} ne redéfinit que des clés existantes, sans « flow », aux mêmes paramètres`, () => {
      for (const [k, v] of overlay) {
        expect(base.has(k), k).toBe(true);
        expect(FLOW.test(v), `${k} : ${v}`).toBe(false);
        expect(params(v), k).toEqual(params(base.get(k)!));
      }
    });
  }

  it("t() suit le vocabulaire de l'organisation", () => {
    expect(t("flows.myFlows")).toBe("Mes flows");
    setFlowTerm("procedure");
    expect(t("flows.myFlows")).toBe("Mes procédures");
    expect(t("projects.flowsCount", { count: 3 })).toBe("3 procédure(s)");
    expect(t("common.cancel")).toBe("Annuler");
    setFlowTerm("intervention");
    expect(t("flowDetails.downloadFlow")).toBe("Télécharger l'intervention");
    expect(t("flowTypes.flow_form")).toBe("Intervention formulaire");
    setFlowTerm("inconnu");
    expect(t("flows.myFlows")).toBe("Mes flows");
  });
});
