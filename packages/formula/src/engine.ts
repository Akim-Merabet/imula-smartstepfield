/**
 * Moteur de formules des formulaires (spec 03 §5).
 *
 * - Références absolues `$$RxQyOz`, relatives `Rh±n` / `Qi±n` / `Oj±n`, encadrées `$RxQyOz$`,
 *   `$$previousvalueqo` (question précédente, même option) et `$$previousvalueo` (option précédente).
 * - Variables dynamiques `@@Nom`.
 * - Séparateur d'arguments `;` (stocké `,` en forme canonique), décimales selon le format FR (`,`) / EN (`.`).
 * - Évaluation math.js **par scope** (aucune substitution textuelle des valeurs), sandbox : AST filtré
 *   (liste blanche de fonctions, symboles limités au scope), fonctions dangereuses désactivées.
 * - Arrondi anti-flottant `toFixed(9)` sur les résultats non entiers.
 *
 * Partagé client / serveur (aucune dépendance Next).
 */
import { all, create, type MathNode } from "mathjs";

export type NumberLocale = "fr" | "en";
export type FormulaError = "invalidSyntax" | "invalidVariable" | "invalidParameters";
export type EvalError = "missingValue" | "evalError" | "invalidFormula";
export type FormulaValue = number | boolean | string;

/** Position courante (1-based) de l'option qui porte la formule. */
export type FormulaCtx = { r: number; q: number; o: number };
export type RefPosition = { r: number; q: number; o: number };
export type ResolveRequest = ({ kind: "ref" } & RefPosition) | { kind: "variable"; name: string };
export type Resolver = (req: ResolveRequest) => FormulaValue | null | undefined;

// ---------------------------------------------------------------------------------------------
// Instance math.js sandboxée
// ---------------------------------------------------------------------------------------------
const math = create(all, { number: "number" });
const parseExpr = math.parse.bind(math);
const FunctionNodeCtor = math.FunctionNode;
const SymbolNodeCtor = math.SymbolNode;

const BLOCKED = ["import", "createUnit", "evaluate", "parse", "simplify", "derivative", "compile", "chain", "reviver", "resolve",
  "parser", "rationalize", "help", "config"];
math.import(
  Object.fromEntries(BLOCKED.map((name) => [name, () => { throw new Error(`function ${name} is disabled`); }])),
  { override: true },
);

/** Fonctions autorisées (U3) : arithmétique, arrondis, statistiques simples, trigonométrie, logique. */
export const ALLOWED_FUNCTIONS = new Set([
  "abs", "round", "ceil", "floor", "fix", "sqrt", "cbrt", "pow", "exp", "log", "log10", "log2", "min", "max", "sum",
  "mean", "median", "std", "variance", "prod", "mod", "sign", "gcd", "lcm", "sin", "cos", "tan", "asin", "acos", "atan",
  "atan2", "and", "or", "not", "xor", "hypot",
]);
const ALLOWED_CONSTANTS = new Set(["pi", "e", "true", "false"]);
/** Opérateurs autorisés (fn math.js de OperatorNode). `to`/`in` (unités) exclus. */
const ALLOWED_OPERATORS = new Set([
  "add", "subtract", "multiply", "divide", "pow", "mod", "unaryMinus", "unaryPlus", "equal", "unequal", "smaller",
  "smallerEq", "larger", "largerEq", "and", "or", "not", "xor", "dotMultiply", "dotDivide",
]);

class SandboxError extends Error {
  constructor(public code: FormulaError) { super(code); }
}

/** Égalités tolérantes aux chaînes (math.js compare numériquement). */
function looseEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "string" || typeof b === "string") return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  return a === b || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-12);
}
const HELPERS = { __eq: (a: unknown, b: unknown) => looseEqual(a, b), __neq: (a: unknown, b: unknown) => !looseEqual(a, b) };

/** Vérifie l'AST (sandbox) et remplace `==`/`!=` par des helpers tolérants aux chaînes. */
function sanitize(node: MathNode, allowedSymbols: Set<string>): MathNode {
  node.traverse((n, _path, parent) => {
    switch (n.type) {
      case "ConstantNode":
      case "ParenthesisNode":
      case "ConditionalNode":
        return;
      case "OperatorNode": {
        const fn = (n as unknown as { fn: string }).fn;
        if (!ALLOWED_OPERATORS.has(fn)) throw new SandboxError("invalidSyntax");
        return;
      }
      case "FunctionNode": {
        const name = (n as unknown as { fn: { name?: string } }).fn?.name;
        if (!name || !ALLOWED_FUNCTIONS.has(name)) throw new SandboxError("invalidSyntax");
        return;
      }
      case "SymbolNode": {
        const name = (n as unknown as { name: string }).name;
        // Nom d'une fonction appelée : déjà contrôlé par le FunctionNode parent.
        if (parent?.type === "FunctionNode" && (parent as unknown as { fn: MathNode }).fn === n) return;
        if (allowedSymbols.has(name) || ALLOWED_CONSTANTS.has(name)) return;
        throw new SandboxError(name.startsWith("ref_") || name.startsWith("var_") ? "invalidVariable" : "invalidSyntax");
      }
      default:
        throw new SandboxError("invalidSyntax");
    }
  });
  return node.transform((n) => {
    if (n.type === "OperatorNode") {
      const op = n as unknown as { fn: string; args: MathNode[] };
      if (op.fn === "equal") return new FunctionNodeCtor(new SymbolNodeCtor("__eq"), op.args);
      if (op.fn === "unequal") return new FunctionNodeCtor(new SymbolNodeCtor("__neq"), op.args);
    }
    return n;
  });
}

// ---------------------------------------------------------------------------------------------
// Découpage chaîne / hors chaîne
// ---------------------------------------------------------------------------------------------
type Segment = { text: string; quoted: boolean };

/** Sépare les littéraux chaîne ('…' ou "…") du reste de la formule. */
export function splitStrings(src: string): Segment[] {
  const out: Segment[] = [];
  let buf = "";
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      buf += c;
      if (c === "\\" && i + 1 < src.length) { buf += src[++i]; continue; }
      if (c === quote) { out.push({ text: buf, quoted: true }); buf = ""; quote = null; }
    } else if (c === "'" || c === '"') {
      if (buf) out.push({ text: buf, quoted: false });
      buf = c;
      quote = c;
    } else buf += c;
  }
  if (buf) out.push({ text: buf, quoted: !!quote });
  return out;
}
const mapOutside = (src: string, fn: (s: string) => string) =>
  splitStrings(src).map((s) => (s.quoted ? s.text : fn(s.text))).join("");
const outside = (src: string) => splitStrings(src).filter((s) => !s.quoted).map((s) => s.text).join(" ");

// ---------------------------------------------------------------------------------------------
// Références
// ---------------------------------------------------------------------------------------------
const POS = "(\\d+|[hij](?:[+-]\\d+)?)";
/** $$RxQyOz, x/y/z = nombre ou h/i/j ± n (insensible à la casse). */
const REF_SRC = `\\$\\$r${POS.replace("[hij]", "h")}q${POS.replace("[hij]", "i")}o${POS.replace("[hij]", "j")}`;
const BOXED_SRC = `\\$r${POS.replace("[hij]", "h")}q${POS.replace("[hij]", "i")}o${POS.replace("[hij]", "j")}\\$`;
const PREV_QO = /\$\$previousvalueqo/gi;
const PREV_O = /\$\$previousvalueo/gi;
const VAR_RE = /@@([a-z][a-z0-9_]*)/gi;

const refRegex = () => new RegExp(`${BOXED_SRC}|${REF_SRC}`, "gi");

function resolvePos(token: string, current: number | undefined, letter: string): number | null {
  const t = token.toLowerCase();
  if (t.startsWith(letter)) {
    if (current === undefined) return null;
    return current + Number(t.slice(1) || 0);
  }
  return Number(t);
}

/** Remplace les références et variables par des symboles de scope. */
function bindReferences(src: string, ctx: Partial<FormulaCtx> | undefined, onRef: (pos: RefPosition | null) => string,
  onVar: (name: string) => string): string {
  return mapOutside(src, (text) => {
    let s = text
      .replace(PREV_QO, () => (ctx?.r && ctx.q && ctx.o && ctx.q > 1 ? `$$r${ctx.r}q${ctx.q - 1}o${ctx.o}` : "$$invalid"))
      .replace(PREV_O, () => (ctx?.r && ctx.q && ctx.o && ctx.o > 1 ? `$$r${ctx.r}q${ctx.q}o${ctx.o - 1}` : "$$invalid"));
    s = s.replace(refRegex(), (_m, br, bq, bo, r, q, o) => {
      const pr = resolvePos(r ?? br, ctx?.r, "h");
      const pq = resolvePos(q ?? bq, ctx?.q, "i");
      const po = resolvePos(o ?? bo, ctx?.o, "j");
      if (pr === null || pq === null || po === null) return onRef(null);
      if (pr < 1 || pq < 1 || po < 1) return onRef(null);
      return ` ${onRef({ r: pr, q: pq, o: po })} `;
    });
    s = s.replace(VAR_RE, (_m, name: string) => ` ${onVar(name.toLowerCase())} `);
    return s;
  });
}

/** Références positionnelles d'une formule (après résolution des relatives par ctx). */
export function extractReferences(canonical: string, ctx?: Partial<FormulaCtx>): RefPosition[] {
  const refs: RefPosition[] = [];
  bindReferences(canonical, ctx, (pos) => { if (pos) refs.push(pos); return "x"; }, () => "x");
  const seen = new Set<string>();
  return refs.filter((r) => { const k = `${r.r}.${r.q}.${r.o}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Variables dynamiques utilisées (noms en minuscules, sans `@@`). */
export function extractVariables(src: string): string[] {
  const names = new Set<string>();
  for (const seg of splitStrings(src)) if (!seg.quoted) for (const m of seg.text.matchAll(VAR_RE)) names.add(m[1].toLowerCase());
  return [...names];
}

export const coordOf = (p: RefPosition) => `R${p.r}Q${p.q}O${p.o}`;

// ---------------------------------------------------------------------------------------------
// Normalisation (forme canonique) et affichage
// ---------------------------------------------------------------------------------------------
const EN_GROUPED = /\d{1,3}(?:,\d{3})+(?:\.\d+)?/g;

/** Forme canonique stockée : `,` entre arguments, `.` décimal, références en majuscules, espaces superflus retirés. */
export function toCanonical(src: string, locale: NumberLocale): string {
  if (!src) return "";
  return mapOutside(src, (text) => {
    let s = text;
    if (locale === "fr") {
      s = s.replace(/(\d)\s+(?=\d{3}\b)/g, "$1");      // espaces de milliers
      s = s.replace(/(\d),(\d)/g, "$1.$2");             // virgule décimale
      s = s.replace(/[;,]/g, ",");                      // séparateurs d'arguments
    } else {
      s = s.replace(EN_GROUPED, (m) => m.replace(/,/g, "")); // séparateurs de milliers
      s = s.replace(/;/g, ",");
    }
    s = s.replace(/\$\$r([0-9hij+-]+)q([0-9hij+-]+)o([0-9hij+-]+)/gi,
      (_m, r: string, q: string, o: string) => `$$R${r.toUpperCase()}Q${q.toUpperCase()}O${o.toUpperCase()}`);
    s = s.replace(/\$\$previousvalue(qo|o)/gi, (_m, w: string) => `$$previousvalue${w.toLowerCase()}`);
    s = s.replace(/\s*,\s*/g, ",").replace(/\s+/g, " ");
    return s;
  }).trim();
}

/** Affichage selon le format utilisateur : ` ; ` entre arguments, décimales localisées. */
export function toDisplay(canonical: string, locale: NumberLocale): string {
  if (!canonical) return "";
  return mapOutside(canonical, (text) => {
    let s = text.replace(/,/g, " ; ");
    if (locale === "fr") s = s.replace(/(\d)\.(\d)/g, "$1,$2");
    return s;
  }).replace(/\s{2,}/g, " ").trim();
}

// ---------------------------------------------------------------------------------------------
// Validation (builder) — spec 03 §5.3
// ---------------------------------------------------------------------------------------------
export type ValidateOptions = {
  /** Position de l'option porteuse (pour h/i/j et previousvalue). Absente : les relatives valent 1. */
  ctx?: Partial<FormulaCtx>;
  /** Contrôle d'existence d'une référence (sinon toute position ≥ 1 est acceptée). */
  exists?: (pos: RefPosition) => boolean;
  /** Variables connues (noms en minuscules, sans `@@`). Absent : toute variable est acceptée. */
  variables?: Set<string>;
};

function classifyMathError(err: unknown): FormulaError {
  if (err instanceof SandboxError) return err.code;
  const msg = err instanceof Error ? err.message : String(err);
  if (/Too (few|many) arguments|Unexpected type of argument|Cannot convert|Wrong number of arguments|expected:/i.test(msg)) {
    return "invalidParameters";
  }
  return "invalidSyntax";
}

export function validate(src: string, locale: NumberLocale, opts: ValidateOptions = {}): FormulaError | null {
  if (!src || !src.trim()) return null;
  const out = outside(src);
  // Règle 2 : FR et point hors chaîne.
  if (locale === "fr" && /\./.test(out)) return "invalidSyntax";
  // Règle 4 : EN, nombres mal groupés ou virgule entourée d'espaces.
  if (locale === "en") {
    if (/\s,|,\s/.test(out)) return "invalidSyntax";
    for (const m of out.matchAll(/\d[\d,]*,\d[\d,.]*/g)) {
      if (!/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(m[0])) return "invalidSyntax";
    }
  }
  const canonical = toCanonical(src, locale);
  const ctx: Partial<FormulaCtx> = { r: 1, q: 1, o: 1, ...opts.ctx };
  const scope: Record<string, unknown> = { ...HELPERS };
  let badRef = false;
  const bound = bindReferences(canonical, ctx, (pos) => {
    if (!pos || (opts.exists && !opts.exists(pos))) { badRef = true; return "__badref"; }
    const key = `ref_${pos.r}_${pos.q}_${pos.o}`;
    scope[key] = 1.1;
    return key;
  }, (name) => {
    if (opts.variables && !opts.variables.has(name)) { badRef = true; return "__badref"; }
    const key = `var_${name}`;
    scope[key] = 1.1;
    return key;
  });
  // Règle 3 : il reste un `$$`, un `$…$` ou un `@@` non reconnu.
  if (badRef || /\$|@@/.test(outside(bound))) return "invalidVariable";
  try {
    const node = sanitize(parseExpr(mapOutside(bound, (x) => x.toLowerCase())), new Set(Object.keys(scope)));
    const result = node.compile().evaluate(scope);
    if (typeof result === "number" || typeof result === "boolean" || typeof result === "string") return null;
    return "invalidSyntax";
  } catch (err) {
    return classifyMathError(err);
  }
}

// ---------------------------------------------------------------------------------------------
// Évaluation (réponse) — spec 03 §5.2
// ---------------------------------------------------------------------------------------------
/** Convertit une valeur saisie (chaîne localisée éventuellement) en nombre si possible. */
export function coerceValue(v: FormulaValue, locale: NumberLocale = "fr"): FormulaValue {
  if (typeof v !== "string") return v;
  const t = v.trim();
  const normalized = locale === "fr" ? t.replace(/\s/g, "").replace(",", ".") : t.replace(/,/g, "");
  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(normalized)) return Number(normalized);
  return t;
}

/** Arrondi anti-flottant (spec : toFixed(9) puis parseFloat). */
export function roundResult(v: number): number {
  return Number.isInteger(v) ? v : parseFloat(v.toFixed(9));
}

export type EvalResult = { ok: true; value: FormulaValue } | { ok: false; error: EvalError };

/**
 * Évalue une formule canonique. Les références sont résolues par `resolve` (valeurs de la réponse
 * en cours, toutes rubriques confondues). Valeur absente ⇒ `missingValue`.
 */
export function evaluate(canonical: string, ctx: FormulaCtx, resolve: Resolver, locale: NumberLocale = "fr"): EvalResult {
  if (!canonical?.trim()) return { ok: false, error: "invalidFormula" };
  const scope: Record<string, unknown> = { ...HELPERS };
  let missing = false;
  let invalid = false;
  const bound = bindReferences(canonical, ctx, (pos) => {
    if (!pos) { invalid = true; return "__badref"; }
    const key = `ref_${pos.r}_${pos.q}_${pos.o}`;
    const v = resolve({ kind: "ref", ...pos });
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) missing = true;
    else scope[key] = coerceValue(v, locale);
    return key;
  }, (name) => {
    const key = `var_${name}`;
    const v = resolve({ kind: "variable", name });
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) missing = true;
    else scope[key] = coerceValue(v, locale);
    return key;
  });
  if (invalid || /\$|@@/.test(outside(bound))) return { ok: false, error: "invalidFormula" };
  if (missing) return { ok: false, error: "missingValue" };
  try {
    const lowered = mapOutside(bound, (s) => s.toLowerCase());
    const node = sanitize(parseExpr(lowered), new Set(Object.keys(scope)));
    const out = node.compile().evaluate(scope);
    if (typeof out === "number") {
      if (!Number.isFinite(out)) return { ok: false, error: "evalError" };
      return { ok: true, value: roundResult(out) };
    }
    if (typeof out === "boolean" || typeof out === "string") return { ok: true, value: out };
    return { ok: false, error: "evalError" };
  } catch {
    return { ok: false, error: "evalError" };
  }
}

/** Affichage d'un résultat : nombres localisés, booléens via les libellés fournis (« Vrai » / « Faux »). */
export function formatResult(value: FormulaValue, locale: NumberLocale, labels: { true: string; false: string }): string {
  if (typeof value === "boolean") return value ? labels.true : labels.false;
  if (typeof value === "number") return locale === "fr" ? String(value).replace(".", ",") : String(value);
  return value;
}
