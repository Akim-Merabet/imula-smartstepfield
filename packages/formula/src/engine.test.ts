import { describe, expect, it } from "vitest";
import {
  coerceValue, evaluate, extractReferences, extractVariables, formatResult, roundResult, splitStrings, toCanonical, toDisplay,
  validate, type FormulaValue, type ResolveRequest,
} from "./engine";

const values: Record<string, FormulaValue | null> = {
  R1Q1O1: 2, R1Q2O1: 3.5, R1Q1O2: 10, R1Q2O2: 20, R2Q1O1: "4,5", R2Q2O1: true, R2Q3O1: "OK", R3Q1O1: null, R1Q3O1: "",
};
const vars: Record<string, FormulaValue> = { projectdesignation: "Lyon", seuil: 7 };
const resolve = (req: ResolveRequest) =>
  req.kind === "ref" ? values[`R${req.r}Q${req.q}O${req.o}`] ?? null : vars[req.name] ?? null;
const ctx = { r: 1, q: 3, o: 1 };

describe("splitStrings", () => {
  it("sépare les littéraux chaîne", () => {
    expect(splitStrings("a == 'x;y' + \"z\"")).toEqual([
      { text: "a == ", quoted: false }, { text: "'x;y'", quoted: true }, { text: " + ", quoted: false }, { text: '"z"', quoted: true },
    ]);
  });
});

describe("toCanonical / toDisplay", () => {
  it("FR : virgule décimale et point-virgule d'arguments", () => {
    expect(toCanonical("min(1,5 ; 2,25)", "fr")).toBe("min(1.5,2.25)");
    expect(toCanonical("1 000,5 * 2", "fr")).toBe("1000.5 * 2");
  });
  it("EN : séparateurs de milliers supprimés", () => {
    expect(toCanonical("max(1,000.5; 2)", "en")).toBe("max(1000.5,2)");
  });
  it("normalise les références en majuscules", () => {
    expect(toCanonical("$$r1q1oj + $$rhqi-1o2", "fr")).toBe("$$R1Q1OJ + $$RHQI-1O2");
    expect(toCanonical("$$PreviousValueQO*2", "en")).toBe("$$previousvalueqo*2");
  });
  it("ne touche pas aux chaînes", () => {
    expect(toCanonical("$$R2Q3O1 == 'a,b;c'", "fr")).toBe("$$R2Q3O1 == 'a,b;c'");
  });
  it("affichage localisé", () => {
    expect(toDisplay("min(1.5,2)", "fr")).toBe("min(1,5 ; 2)");
    expect(toDisplay("min(1.5,2)", "en")).toBe("min(1.5 ; 2)");
    expect(toDisplay(toCanonical("round($$R1Q1O1 * 1,25 ; 2)", "fr"), "fr")).toBe("round($$R1Q1O1 * 1,25 ; 2)");
  });
});

describe("validate", () => {
  it("formule vide valide", () => {
    expect(validate("", "fr")).toBeNull();
    expect(validate("   ", "en")).toBeNull();
  });
  it("formules valides", () => {
    expect(validate("$$R1Q1OJ+$$R1Q2OJ", "fr")).toBeNull();
    expect(validate("min(2;6) + $$R1Q1O1 * 1,5", "fr")).toBeNull();
    expect(validate("min(2;6) + 1.5", "en")).toBeNull();
    expect(validate("$$R1Q1O1 > 3 ? 'Conforme' : 'Non conforme'", "fr")).toBeNull();
    expect(validate("@@ProjectDesignation == 'Lyon'", "fr")).toBeNull();
    expect(validate("$$previousvalueqo + 1", "fr", { ctx: { r: 1, q: 2, o: 1 } })).toBeNull();
    expect(validate("$R1Q1O1$ * 2", "fr")).toBeNull();
    expect(validate("$$R1Q1O1 >= 2 and $$R1Q2O1 < 5", "fr")).toBeNull();
  });
  it("FR : point interdit", () => {
    expect(validate("1.5 + 2", "fr")).toBe("invalidSyntax");
  });
  it("EN : nombres mal groupés / virgule entourée d'espaces", () => {
    expect(validate("1,00 + 2", "en")).toBe("invalidSyntax");
    expect(validate("min(1 , 2)", "en")).toBe("invalidSyntax");
    expect(validate("1,000 + 2", "en")).toBeNull();
  });
  it("références invalides", () => {
    expect(validate("$$R1Q1 + 2", "fr")).toBe("invalidVariable");
    expect(validate("$$foo * 2", "fr")).toBe("invalidVariable");
    expect(validate("$$R0Q1O1", "fr")).toBe("invalidVariable");
    expect(validate("$$previousvalueqo", "fr", { ctx: { r: 1, q: 1, o: 1 } })).toBe("invalidVariable");
    expect(validate("$$R9Q9O9", "fr", { exists: (p) => p.r === 1 })).toBe("invalidVariable");
    expect(validate("@@Inconnue", "fr", { variables: new Set(["projectdesignation"]) })).toBe("invalidVariable");
  });
  it("syntaxe invalide", () => {
    expect(validate("2 +* 3", "fr")).toBe("invalidSyntax");
    expect(validate("(2 + 3", "fr")).toBe("invalidSyntax");
    expect(validate("foo + 1", "fr")).toBe("invalidSyntax");
  });
  it("sandbox : fonctions et constructions interdites", () => {
    expect(validate("import(1)", "fr")).toBe("invalidSyntax");
    expect(validate("evaluate('1+1')", "fr")).toBe("invalidSyntax");
    expect(validate("createUnit('x')", "fr")).toBe("invalidSyntax");
    expect(validate("f(x) = 1", "fr")).toBe("invalidSyntax");
    expect(validate("x = 1", "fr")).toBe("invalidSyntax");
    expect(validate("[1;2]", "fr")).toBe("invalidSyntax");
    expect(validate("5 cm", "fr")).toBe("invalidSyntax");
    expect(validate("5 to cm", "fr")).toBe("invalidSyntax");
  });
  it("paramètres invalides", () => {
    expect(validate("sqrt(1;2)", "fr")).toBe("invalidParameters");
    expect(validate("min()", "fr")).toBe("invalidParameters");
  });
});

describe("evaluate", () => {
  it("références absolues et relatives", () => {
    expect(evaluate("$$R1Q1O1+$$R1Q2O1", ctx, resolve)).toEqual({ ok: true, value: 5.5 });
    expect(evaluate("$$R1Q1OJ+$$R1Q2OJ", { r: 1, q: 3, o: 2 }, resolve)).toEqual({ ok: true, value: 30 });
    expect(evaluate("$$RHQI-2OJ * 2", { r: 1, q: 3, o: 1 }, resolve)).toEqual({ ok: true, value: 4 });
    expect(evaluate("$$RH+1QI-2OJ", { r: 1, q: 3, o: 1 }, resolve)).toEqual({ ok: true, value: 4.5 });
  });
  it("valeur précédente", () => {
    expect(evaluate("$$previousvalueqo * 10", { r: 1, q: 2, o: 1 }, resolve)).toEqual({ ok: true, value: 20 });
    expect(evaluate("$$previousvalueo + 1", { r: 1, q: 1, o: 2 }, resolve)).toEqual({ ok: true, value: 3 });
  });
  it("valeurs texte numériques converties (format FR)", () => {
    expect(evaluate("$$R2Q1O1 * 2", ctx, resolve, "fr")).toEqual({ ok: true, value: 9 });
  });
  it("valeur manquante", () => {
    expect(evaluate("$$R3Q1O1 + 1", ctx, resolve)).toEqual({ ok: false, error: "missingValue" });
    expect(evaluate("$$R1Q3O1 + 1", ctx, resolve)).toEqual({ ok: false, error: "missingValue" });
    expect(evaluate("$$R8Q8O8 + 1", ctx, resolve)).toEqual({ ok: false, error: "missingValue" });
  });
  it("arrondi anti-flottant", () => {
    expect(evaluate("0.1 + 0.2", ctx, resolve)).toEqual({ ok: true, value: 0.3 });
    expect(roundResult(1 / 3)).toBe(0.333333333);
    expect(roundResult(4)).toBe(4);
  });
  it("booléens et chaînes", () => {
    expect(evaluate("$$R1Q1O1 > 1", ctx, resolve)).toEqual({ ok: true, value: true });
    expect(evaluate("$$R2Q2O1 and $$R1Q1O1 < 1", ctx, resolve)).toEqual({ ok: true, value: false });
    expect(evaluate("$$R2Q3O1 == 'ok'", ctx, resolve)).toEqual({ ok: true, value: true });
    expect(evaluate("$$R2Q3O1 != 'OK'", ctx, resolve)).toEqual({ ok: true, value: false });
    expect(evaluate("$$R1Q1O1 >= 2 ? 'Conforme' : 'Non conforme'", ctx, resolve)).toEqual({ ok: true, value: "Conforme" });
  });
  it("variables dynamiques via scope", () => {
    expect(evaluate("@@Seuil - $$R1Q1O1", ctx, resolve)).toEqual({ ok: true, value: 5 });
    expect(evaluate("@@ProjectDesignation == 'lyon'", ctx, resolve)).toEqual({ ok: true, value: true });
    expect(evaluate("@@Absente + 1", ctx, resolve)).toEqual({ ok: false, error: "missingValue" });
  });
  it("fonctions autorisées", () => {
    expect(evaluate("min(4,2,8) + max(1,3)", ctx, resolve)).toEqual({ ok: true, value: 5 });
    expect(evaluate("round(2.345, 2)", ctx, resolve)).toEqual({ ok: true, value: 2.35 });
    expect(evaluate("sqrt(16) + abs(-1) + mod(7, 3)", ctx, resolve)).toEqual({ ok: true, value: 6 });
  });
  it("pas d'injection par les valeurs (scope, pas de substitution textuelle)", () => {
    const evil = (req: ResolveRequest) => (req.kind === "ref" ? "import('x')" : null);
    expect(evaluate("$$R1Q1O1 == 'a'", ctx, evil)).toEqual({ ok: true, value: false });
  });
  it("erreurs d'évaluation", () => {
    expect(evaluate("1 / 0", ctx, resolve)).toEqual({ ok: false, error: "evalError" });
    expect(evaluate("import(1)", ctx, resolve)).toEqual({ ok: false, error: "evalError" });
    expect(evaluate("", ctx, resolve)).toEqual({ ok: false, error: "invalidFormula" });
  });
});

describe("utilitaires", () => {
  it("extractReferences résout les relatives", () => {
    expect(extractReferences("$$R1Q1OJ + $$RHQ2O1 + $$R1Q1OJ", { r: 2, q: 1, o: 3 })).toEqual([
      { r: 1, q: 1, o: 3 }, { r: 2, q: 2, o: 1 },
    ]);
  });
  it("extractVariables", () => {
    expect(extractVariables("@@FlowName + '@@pasunevar' + @@Seuil")).toEqual(["flowname", "seuil"]);
  });
  it("coerceValue", () => {
    expect(coerceValue("12,5", "fr")).toBe(12.5);
    expect(coerceValue("1,200.5", "en")).toBe(1200.5);
    expect(coerceValue("abc", "fr")).toBe("abc");
  });
  it("formatResult Vrai/Faux et décimales", () => {
    const labels = { true: "Vrai", false: "Faux" };
    expect(formatResult(true, "fr", labels)).toBe("Vrai");
    expect(formatResult(false, "fr", labels)).toBe("Faux");
    expect(formatResult(2.5, "fr", labels)).toBe("2,5");
    expect(formatResult(2.5, "en", labels)).toBe("2.5");
  });
});
