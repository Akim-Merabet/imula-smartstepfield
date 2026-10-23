/**
 * Valeurs de réponse : « renseigné », validation de données, antidatage, colonnes typées,
 * pré-remplissage, redirections (§6.6), contrôles obligatoire / invalide. Logique pure.
 */
import { coerceValue, evaluate, type FormulaValue, type NumberLocale } from "@imula/formula";
import { CAN_MANDATORY, OPT_REDIRECT, PREFILL_TEXT, VALUE_TYPE } from "./meta";
import type {
  ActiveRedirect, CheckQuestionError, CheckResult, FileRef, OptionDef, QuestionType, SignatureValue, ValidationDef,
} from "./types";
import type { RtCell, RtModel, RtQuestion, RtRubric } from "./model";

export type CellValue = { value: unknown; locked: boolean; isValid?: boolean | null };
export type ValuesMap = Record<string, CellValue>;
export type DynamicCtx = Record<string, string | number | null>;

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

/** Règles « renseigné » par nature (spec 03 §4, §3.6). */
export function isFilled(type: QuestionType, value: unknown, cell?: RtCell): boolean {
  if (value === null || value === undefined) return false;
  switch (VALUE_TYPE[type]) {
    case "string": case "text": return typeof value === "string" && value.trim() !== "";
    case "rich_text": return typeof value === "string" && stripHtml(value) !== "";
    case "boolean": return value === true;
    case "string_list": return Array.isArray(value) && value.length > 0;
    case "date": case "datetime": return typeof value === "string" && value !== "";
    case "duration": {
      const d = value as { hours?: number | null; minutes?: number | null };
      return d.hours !== null && d.hours !== undefined && d.minutes !== null && d.minutes !== undefined;
    }
    case "value_and_unit": {
      const v = (value as { value?: unknown }).value;
      return v !== null && v !== undefined && v !== "";
    }
    case "number": {
      const r = (value as { result?: unknown }).result;
      return r !== null && r !== undefined && r !== "";
    }
    case "coordinates": {
      const c = value as { lat?: number | null; lng?: number | null };
      return typeof c.lat === "number" && typeof c.lng === "number";
    }
    case "file_list": return Array.isArray(value) && value.length > 0;
    case "signature": {
      const s = value as SignatureValue;
      if (cell?.slot?.disableSignature) return !!s.userId || (!!s.firstName && !!s.lastName && !!s.function);
      return !!s.signaturePath;
    }
  }
  return false;
}

const toNum = (s: string | undefined) => {
  if (s === undefined || s === null || s === "") return null;
  const n = coerceValue(String(s), "fr");
  return typeof n === "number" ? n : coerceValue(String(s), "en") as number;
};

/** Valeur numérique comparable d'une option (value_unit / formule). */
export function numericOf(type: QuestionType, value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (type === "value_unit") {
    const v = (value as { value?: unknown }).value;
    return typeof v === "number" ? v : null;
  }
  if (type === "formula") {
    const r = (value as { result?: unknown }).result;
    return typeof r === "number" ? r : null;
  }
  return null;
}

/** Granularité jour (date) ou minute (datetime). */
function dateKey(type: QuestionType, v: string): number | null {
  const d = type === "date" ? new Date(`${v.slice(0, 10)}T00:00:00`) : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return type === "date" ? Math.floor(d.getTime() / 86_400_000 + 0.5) * 1 : Math.floor(d.getTime() / 60_000);
}

/** Respect de la validation de données (vide ⇒ valide). */
export function checkValidation(type: QuestionType, value: unknown, v: ValidationDef | undefined): boolean {
  if (!v) return true;
  if (type === "date" || type === "datetime") {
    if (typeof value !== "string" || !value) return true;
    const x = dateKey(type, value);
    const a = v.min ? dateKey(type, v.min) : null;
    const b = v.max ? dateKey(type, v.max) : null;
    if (x === null || a === null) return true;
    switch (v.op) {
      case "eq": return x === a;
      case "neq": return x !== a;
      case "before": return x < a;
      case "after": return x > a;
      case "between_dates": return b === null ? x >= a : x >= Math.min(a, b) && x <= Math.max(a, b);
      case "not_between_dates": return b === null ? x < a : x < Math.min(a, b) || x > Math.max(a, b);
      default: return true;
    }
  }
  if (type === "formula" && value && typeof (value as { result?: unknown }).result === "boolean") return true;
  const x = numericOf(type, value);
  if (x === null) return true;
  const a = toNum(v.min);
  const b = toNum(v.max);
  if (a === null) return true;
  switch (v.op) {
    case "gt": return x > a;
    case "gte": return x >= a;
    case "lt": return x < a;
    case "lte": return x <= a;
    case "eq": return x === a;
    case "neq": return x !== a;
    case "between": return b === null ? x >= a : x >= Math.min(a, b) && x <= Math.max(a, b);
    case "not_between": return b === null ? x < a : x < Math.min(a, b) || x > Math.max(a, b);
    default: return true;
  }
}

/** Antidatage : date antérieure à la création de la réponse (granularité jour / minute). */
export function isBackdated(type: QuestionType, value: unknown, allowBackdating: boolean, responseCreatedAt: string): boolean {
  if (allowBackdating || (type !== "date" && type !== "datetime") || typeof value !== "string" || !value) return false;
  const created = new Date(responseCreatedAt);
  if (type === "date") {
    const pad = (n: number) => String(n).padStart(2, "0");
    const day = `${created.getFullYear()}-${pad(created.getMonth() + 1)}-${pad(created.getDate())}`;
    return value.slice(0, 10) < day;
  }
  const v = new Date(value);
  return !Number.isNaN(v.getTime()) && Math.floor(v.getTime() / 60_000) < Math.floor(created.getTime() / 60_000);
}

/** Colonnes typées de form_response_values. */
export function typedColumns(type: QuestionType, value: unknown) {
  const out: { value_text: string | null; value_number: number | null; value_bool: boolean | null; value_date: string | null; value_ts: string | null } =
    { value_text: null, value_number: null, value_bool: null, value_date: null, value_ts: null };
  if (value === null || value === undefined) return out;
  switch (VALUE_TYPE[type]) {
    case "string": case "text": case "rich_text": out.value_text = String(value); break;
    case "boolean": out.value_bool = value === true; break;
    case "string_list": out.value_text = (value as string[]).join("__"); break;
    case "date": out.value_date = String(value).slice(0, 10); break;
    case "datetime": out.value_ts = String(value); break;
    case "duration": {
      const d = value as { hours?: number; minutes?: number };
      out.value_number = (d.hours ?? 0) * 60 + (d.minutes ?? 0);
      out.value_text = `${String(d.hours ?? 0).padStart(2, "0")}:${String(d.minutes ?? 0).padStart(2, "0")}`;
      break;
    }
    case "value_and_unit": {
      const v = value as { value?: number | null; unit?: string };
      out.value_number = typeof v.value === "number" ? v.value : null;
      out.value_text = v.unit ?? null;
      break;
    }
    case "number": {
      const r = (value as { result?: unknown; unit?: string }).result;
      if (typeof r === "number") out.value_number = r;
      else if (typeof r === "boolean") out.value_bool = r;
      else if (r !== null && r !== undefined) out.value_text = String(r);
      break;
    }
    case "coordinates": {
      const c = value as { lat?: number; lng?: number };
      out.value_text = c.lat !== undefined && c.lng !== undefined ? `${c.lat},${c.lng}` : null;
      break;
    }
    case "file_list": out.value_text = (value as FileRef[]).map((f) => f.name ?? f.fileId).join(", ") || null; break;
    case "signature": {
      const s = value as SignatureValue;
      out.value_text = [s.firstName, s.lastName].filter(Boolean).join(" ") || null;
      out.value_ts = s.signedAt ?? null;
      break;
    }
  }
  return out;
}

/** Valeur scalaire d'une cellule pour les formules. */
export function scalarOf(type: QuestionType, value: unknown): FormulaValue | null {
  if (value === null || value === undefined) return null;
  switch (VALUE_TYPE[type]) {
    case "string": case "text": case "date": case "datetime": return String(value);
    case "rich_text": return stripHtml(String(value));
    case "boolean": return value === true;
    case "string_list": return (value as string[]).join(", ");
    case "duration": { const d = value as { hours?: number; minutes?: number }; return (d.hours ?? 0) * 60 + (d.minutes ?? 0); }
    case "value_and_unit": { const v = (value as { value?: unknown }).value; return typeof v === "number" ? v : null; }
    case "number": { const r = (value as { result?: unknown }).result; return r === null || r === undefined ? null : (r as FormulaValue); }
    default: return null;
  }
}

/** Remplace les jetons `@@Nom` d'un texte par les valeurs du contexte (insensible à la casse). */
export function substituteVariables(text: string, ctx: DynamicCtx): string {
  const lower = new Map(Object.entries(ctx).map(([k, v]) => [k.toLowerCase(), v]));
  return text.replace(/@@[a-z][a-z0-9_]*/gi, (m) => {
    const v = lower.get(m.toLowerCase());
    return v === null || v === undefined ? "" : String(v);
  });
}
export function variableValue(name: string, ctx: DynamicCtx) {
  const key = (name.startsWith("@@") ? name : `@@${name}`).toLowerCase();
  for (const [k, v] of Object.entries(ctx)) if (k.toLowerCase() === key) return v;
  return null;
}

/** Valeur initiale d'une option à partir de son pré-remplissage (statique ou variable dynamique). */
export function prefillValue(type: QuestionType, opt: OptionDef | undefined, ctx: DynamicCtx): unknown {
  const p = opt?.prefill;
  if (!p) return null;
  if (p.mode === "dynamic" && p.variable) {
    const v = variableValue(p.variable, ctx);
    if (v === null || v === undefined || v === "") return null;
    switch (type) {
      case "date": return String(v).slice(0, 10);
      case "datetime": return new Date(String(v)).toISOString();
      case "value_unit": { const n = coerceValue(String(v)); return typeof n === "number" ? { value: n, unit: opt?.unit } : null; }
      case "location": {
        const parts = String(v).split(/[;,]/).map((x) => Number(x.trim()));
        return parts.length >= 2 && parts.every((n) => !Number.isNaN(n)) ? { lat: parts[0], lng: parts[1], alt: parts[2] } : null;
      }
      case "photo": return null;
      default: return String(v);
    }
  }
  const raw = p.value;
  if (raw === null || raw === undefined || raw === "") return null;
  if (PREFILL_TEXT.has(type) || type === "text_editor") return substituteVariables(String(raw), ctx);
  if (type === "value_unit") {
    if (typeof raw === "object") return { unit: opt?.unit, ...(raw as object) };
    const n = coerceValue(String(raw));
    return typeof n === "number" ? { value: n, unit: opt?.unit } : null;
  }
  if (type === "multiple_choices" || type === "unique_choice") return raw === true || raw === "true";
  return raw;
}

// ---------------------------------------------------------------------------------------------
// Redirections (§6.6)
// ---------------------------------------------------------------------------------------------
/** Redirection active d'une rubrique : 1re question (puis 1re option) renseignée portant une redirection. */
export function computeRedirect(rubric: RtRubric, values: ValuesMap): ActiveRedirect | null {
  for (const q of rubric.questions) {
    if (!OPT_REDIRECT.has(q.type)) continue;
    for (const c of q.cells) {
      const r = c.opt?.redirect;
      if (!r) continue;
      if (isFilled(q.type, values[c.lineageId]?.value, c)) {
        return { rubricLineageId: r.rubricLineageId, questionLineageId: r.questionLineageId, fromQuestionPos: q.position, fromOptionPos: c.position };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Formules
// ---------------------------------------------------------------------------------------------
export function evaluateCell(model: RtModel, rubric: RtRubric, question: RtQuestion, cell: RtCell, values: ValuesMap,
  ctx: DynamicCtx, locale: NumberLocale) {
  const canonical = cell.opt?.formula?.canonical;
  if (!canonical) return { ok: false as const, error: "invalidFormula" as const };
  return evaluate(canonical, { r: rubric.position, q: question.position, o: cell.position }, (req) => {
    if (req.kind === "variable") {
      const v = variableValue(req.name, ctx);
      return v === null ? null : v;
    }
    const target = model.cellByCoord.get(`R${req.r}Q${req.q}O${req.o}`);
    if (!target) return null;
    const owner = model.cellByLineage.get(target.lineageId);
    return owner ? scalarOf(owner.question.type, values[target.lineageId]?.value) : null;
  }, locale);
}

// ---------------------------------------------------------------------------------------------
// Contrôles (obligatoire / invalide)
// ---------------------------------------------------------------------------------------------
export function cellError(question: RtQuestion, cell: RtCell, value: unknown, createdAt: string): "invalid" | null {
  if (isBackdated(question.type, value, question.def.allowBackdating, createdAt)) return "invalid";
  const v = cell.opt?.validation;
  if (v?.block && isFilled(question.type, value, cell) && !checkValidation(question.type, value, v)) return "invalid";
  return null;
}

export function checkRubric(rubric: RtRubric, values: ValuesMap, createdAt: string): CheckResult {
  const errors: CheckQuestionError[] = [];
  for (const q of rubric.questions) {
    const invalid = q.cells.some((c) => cellError(q, c, values[c.lineageId]?.value, createdAt));
    let missing = false;
    if (q.def.mandatory && CAN_MANDATORY(q.type)) {
      missing = q.type === "collaborator"
        ? q.cells.some((c) => !isFilled(q.type, values[c.lineageId]?.value, c))
        : !q.cells.some((c) => isFilled(q.type, values[c.lineageId]?.value, c));
    }
    if (missing || invalid) {
      errors.push({
        rubricLineageId: rubric.def.lineageId, questionLineageId: q.lineageId, name: q.name, type: q.type, icon: q.def.icon,
        error: missing ? "mandatory" : "invalid",
      });
    }
  }
  return {
    rubricLineageId: rubric.def.lineageId, name: rubric.def.name, position: rubric.position, type: rubric.def.type,
    valid: errors.length === 0, questions: errors,
  };
}

export function checkResponse(model: RtModel, values: ValuesMap, createdAt: string, skip?: Set<string>): CheckResult[] {
  return model.rubrics.filter((r) => !skip?.has(r.def.lineageId)).map((r) => checkRubric(r, values, createdAt)).filter((r) => !r.valid);
}

/** Bornes min/max imposées à la saisie quand la validation est bloquante (§3.5.3). */
export function inputBounds(type: QuestionType, v: ValidationDef | undefined, createdAt: string, allowBackdating: boolean) {
  let min: string | undefined;
  let max: string | undefined;
  if (type === "date" || type === "datetime") {
    const shift = (s: string, days: number) => {
      const d = new Date(type === "date" ? `${s.slice(0, 10)}T00:00:00` : s);
      d.setDate(d.getDate() + days);
      return toInputDate(type, d);
    };
    if (v?.block && v.min) {
      if (v.op === "after") min = shift(v.min, 1);
      else if (v.op === "before") max = shift(v.min, -1);
      else if (v.op === "eq") { min = shift(v.min, 0); max = min; }
      else if (v.op === "between_dates") { min = shift(v.min, 0); if (v.max) max = shift(v.max, 0); }
    }
    if (!allowBackdating) {
      const c = toInputDate(type, new Date(createdAt));
      if (!min || min < c) min = c;
    }
    return { min, max };
  }
  if (!v?.block || !v.min) return { min, max };
  const a = toNum(v.min);
  const b = toNum(v.max);
  if (a === null) return { min, max };
  switch (v.op) {
    case "gt": min = String(a + 1); break;
    case "gte": min = String(a); break;
    case "lt": max = String(a - 1); break;
    case "lte": max = String(a); break;
    case "eq": min = String(a); max = String(a); break;
    case "between": min = String(Math.min(a, b ?? a)); max = String(Math.max(a, b ?? a)); break;
    default: break;
  }
  return { min, max };
}

const pad2 = (n: number) => String(n).padStart(2, "0");
export function toInputDate(type: QuestionType, d: Date) {
  const day = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return type === "date" ? day : `${day}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
