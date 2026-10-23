/**
 * Correspondance attribut d'objet (custom_field, nature technical_object) ↔ question de formulaire (spec 03 §3.7).
 * Module pur (client + serveur). Les types Fichier, Image et Titre ne sont pas proposés.
 */
import type { Enums } from "@/lib/supabase/database.types";

type FieldType = Enums<"custom_field_type">;
type QuestionType = Enums<"question_type">;

export const SUPPORTED_ATTRIBUTE_TYPES: FieldType[] = ["text", "textarea", "integer", "double", "boolean", "date", "datetime", "select", "multiselect", "link", "metadata"];

export function questionTypeFor(type: FieldType): QuestionType | null {
  switch (type) {
    case "text": case "integer": case "double": case "link": case "metadata": return "short_answer";
    case "textarea": return "long_answer";
    case "boolean": case "select": return "single_choice_list";
    case "multiselect": return "multiple_choice_list";
    case "date": return "date";
    case "datetime": return "datetime";
    default: return null;
  }
}

/** Décalage (minutes) d'un fuseau à une date donnée. */
function tzOffset(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(date).reduce<Record<string, string>>((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return (asUtc - date.getTime()) / 60000;
}
/** « YYYY-MM-DDTHH:mm » local au fuseau → ISO UTC. */
function localToIso(local: string, timeZone: string) {
  const naive = new Date(`${local.slice(0, 16)}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;
  return new Date(naive.getTime() - tzOffset(naive, timeZone) * 60000).toISOString();
}
/** ISO → « YYYY-MM-DDTHH:mm » local au fuseau (valeur d'attribut date-heure). */
function isoToLocal(iso: string, timeZone: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + tzOffset(d, timeZone) * 60000).toISOString().slice(0, 16);
}

/** Valeur d'attribut (texte / liste) → valeur de cellule de la question liée. */
export function attributeToQuestionValue(type: FieldType, value: string | string[] | null | undefined, choices: string[], timeZone: string): unknown {
  if (value === null || value === undefined || value === "") return null;
  const str = Array.isArray(value) ? value.join(";") : value;
  switch (type) {
    case "boolean": return str === "true" ? choices[0] ?? null : str === "false" ? choices[1] ?? null : null;
    case "multiselect": return (Array.isArray(value) ? value : str.split(";")).filter((v) => choices.includes(v));
    case "select": return choices.includes(str) ? str : null;
    case "date": return str.slice(0, 10);
    case "datetime": return localToIso(str, timeZone);
    default: return str;
  }
}

/** Valeur de cellule → valeur d'attribut à écrire (value_text, value_json pour les listes multiples). */
export function questionToAttributeValue(type: FieldType, value: unknown, choices: string[], timeZone: string): { value_text: string | null; value_json: string[] | null } {
  const none = { value_text: null, value_json: null };
  if (value === null || value === undefined || value === "") return none;
  switch (type) {
    case "boolean": {
      const i = choices.indexOf(String(value));
      return i === 0 ? { value_text: "true", value_json: null } : i === 1 ? { value_text: "false", value_json: null } : none;
    }
    case "multiselect": {
      const list = Array.isArray(value) ? value.map(String) : [];
      return list.length ? { value_text: list.join(";"), value_json: list } : none;
    }
    case "datetime": return { value_text: isoToLocal(String(value), timeZone), value_json: null };
    case "date": return { value_text: String(value).slice(0, 10), value_json: null };
    case "integer": case "double": {
      const n = Number(String(value).replace(",", "."));
      if (!Number.isFinite(n)) return none;
      return { value_text: String(type === "integer" ? Math.round(n) : n), value_json: null };
    }
    default: return { value_text: String(value), value_json: null };
  }
}
