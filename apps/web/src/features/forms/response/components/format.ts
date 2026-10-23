import { formatResult, type NumberLocale } from "@/lib/formula/engine";
import type { FileRef, QuestionType, SignatureValue } from "../../types";

/** Rendu texte d'une valeur (historique, résumés). */
export function formatValue(type: QuestionType, value: unknown, locale: NumberLocale, labels: { true: string; false: string; checked: string }): string {
  if (value === null || value === undefined) return "";
  const num = (n: unknown) => (typeof n === "number" ? (locale === "fr" ? String(n).replace(".", ",") : String(n)) : String(n ?? ""));
  switch (type) {
    case "unique_choice": case "multiple_choices": return value === true ? labels.checked : "";
    case "multiple_choice_list": return (value as string[]).join(" ; ");
    case "date": return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(locale);
    case "datetime": return new Date(String(value)).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
    case "duration": { const d = value as { hours?: number; minutes?: number }; return `${d.hours ?? 0}h${String(d.minutes ?? 0).padStart(2, "0")}`; }
    case "value_unit": { const v = value as { value?: number; unit?: string }; return `${num(v.value)}${v.unit ? ` ${v.unit}` : ""}`; }
    case "formula": {
      const v = value as { result?: number | boolean | string; unit?: string };
      if (v.result === undefined || v.result === null) return "";
      return `${formatResult(v.result, locale, labels)}${v.unit ? ` ${v.unit}` : ""}`;
    }
    case "location": { const c = value as { lat?: number; lng?: number; alt?: number }; return [c.lat, c.lng, c.alt].filter((x) => x !== undefined && x !== null).map(num).join(" ; "); }
    case "photo": case "file": return (value as FileRef[]).map((f) => f.name ?? f.fileId).join(", ");
    case "text_editor": return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    case "collaborator": { const s = value as SignatureValue; return [s.firstName, s.lastName].filter(Boolean).join(" "); }
    default: return String(value);
  }
}
