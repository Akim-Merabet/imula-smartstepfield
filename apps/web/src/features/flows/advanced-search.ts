/** Recherche avancée simplifiée des flows (spec 02 §3.1, spec 00 §5.2) : Champ / Action / Valeur(s). */

export type AdvancedFieldKind = "text" | "list" | "date" | "type";
export type AdvancedOperator =
  | "contains" | "starts_with" | "equals" | "not_equals" | "gte" | "lte" | "between"
  | "empty" | "not_empty" | "current_day" | "current_week" | "current_month";

export const ADVANCED_FIELDS = {
  flow_type: { kind: "type", column: "flow_type" },
  name: { kind: "text", column: "name" },
  ref_int: { kind: "text", column: "ref_int" },
  description: { kind: "text", column: "description" },
  family: { kind: "list", column: "family_id" },
  category: { kind: "list", column: "category_id" },
  status: { kind: "list", column: "custom_status_id" },
  reporter: { kind: "list", column: "reporter_id" },
  tablet1: { kind: "list", column: "tablet_1_id" },
  tablet2: { kind: "list", column: "tablet_2_id" },
  tablet3: { kind: "list", column: "tablet_3_id" },
  start_date: { kind: "date", column: "start_date" },
  finish_date: { kind: "date", column: "finish_date" },
  estimated_start_date: { kind: "date", column: "estimated_start_date" },
  estimated_end_date: { kind: "date", column: "estimated_end_date" },
  achieved_start_date: { kind: "date", column: "achieved_start_date" },
  achieved_end_date: { kind: "date", column: "achieved_end_date" },
  updated_at: { kind: "date", column: "updated_at" },
  location_site: { kind: "text", column: "location_site" },
  location_area: { kind: "text", column: "location_area" },
  location_local: { kind: "text", column: "location_local" },
  elementary_system: { kind: "text", column: "elementary_system" },
  functional_marker: { kind: "text", column: "functional_marker" },
} as const satisfies Record<string, { kind: AdvancedFieldKind; column: string }>;

export type AdvancedField = keyof typeof ADVANCED_FIELDS;

/** RN110 : pas d'Égal / Différent sur Nom, Référence et Description. */
const NO_EQUALS: AdvancedField[] = ["name", "ref_int", "description"];
/** Vide / N'est pas vide sur tablettes, rapporteur et date de modification. */
const NULLABLE_LIST: AdvancedField[] = ["reporter", "tablet1", "tablet2", "tablet3", "family", "category"];

export function operatorsFor(field: AdvancedField): AdvancedOperator[] {
  const { kind } = ADVANCED_FIELDS[field];
  if (kind === "text") {
    return NO_EQUALS.includes(field)
      ? ["contains", "starts_with", "empty", "not_empty"]
      : ["contains", "starts_with", "equals", "not_equals", "empty", "not_empty"];
  }
  if (kind === "type") return ["equals", "not_equals"];
  if (kind === "list") return NULLABLE_LIST.includes(field) ? ["equals", "not_equals", "empty", "not_empty"] : ["equals", "not_equals"];
  return ["gte", "lte", "between", "empty", "not_empty", "current_day", "current_week", "current_month"];
}

export const VALUELESS: AdvancedOperator[] = ["empty", "not_empty", "current_day", "current_week", "current_month"];

export type AdvancedCriterion = { field: AdvancedField; op: AdvancedOperator; values: string[] };

export function parseAdvancedSearch(raw: string | null | undefined): AdvancedCriterion[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.flatMap((c): AdvancedCriterion[] => {
      if (!c || typeof c !== "object") return [];
      const { field, op, values } = c as Record<string, unknown>;
      if (typeof field !== "string" || !(field in ADVANCED_FIELDS)) return [];
      const f = field as AdvancedField;
      if (typeof op !== "string" || !operatorsFor(f).includes(op as AdvancedOperator)) return [];
      const vals = Array.isArray(values) ? values.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
      if (!VALUELESS.includes(op as AdvancedOperator) && vals.length === 0) return [];
      return [{ field: f, op: op as AdvancedOperator, values: vals.slice(0, 20) }];
    });
  } catch {
    return [];
  }
}

export function serializeAdvancedSearch(criteria: AdvancedCriterion[]): string | null {
  const valid = criteria.filter((c) => VALUELESS.includes(c.op) || c.values.some(Boolean));
  return valid.length ? JSON.stringify(valid.map((c) => ({ ...c, values: c.values.filter(Boolean) }))) : null;
}

/** Bornes [début, fin[ des raccourcis de date (jour / semaine / mois en cours). */
export function currentRange(op: "current_day" | "current_week" | "current_month", now = new Date()): [Date, Date] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (op === "current_day") return [start, new Date(start.getTime() + 86_400_000)];
  if (op === "current_week") {
    const day = (start.getDay() + 6) % 7;
    const monday = new Date(start.getTime() - day * 86_400_000);
    return [monday, new Date(monday.getTime() + 7 * 86_400_000)];
  }
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return [first, new Date(now.getFullYear(), now.getMonth() + 1, 1)];
}
