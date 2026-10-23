import type { QuestionType } from "../types";

const num = (v: unknown, locale: "fr" | "en") =>
  typeof v === "number" ? (locale === "fr" ? String(v).replace(".", ",") : String(v)) : v === null || v === undefined ? "" : String(v);

/** Valeur canonique (spec 03 §4) → texte d'export (dates locales, « 12,5 mm », listes jointes par « ; »). */
export function formatValue(type: QuestionType, value: unknown, locale: "fr" | "en", labels: { true: string; false: string }): string {
  if (value === null || value === undefined) return "";
  switch (type) {
    case "unique_choice":
    case "multiple_choices":
      return value === true ? labels.true : value === false ? "" : String(value);
    case "multiple_choice_list":
      return Array.isArray(value) ? value.join(" ; ") : String(value);
    case "date": {
      const [y, m, d] = String(value).slice(0, 10).split("-");
      return locale === "fr" ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
    }
    case "datetime": {
      const dt = new Date(String(value));
      return Number.isNaN(dt.getTime()) ? String(value) : dt.toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { dateStyle: "short", timeStyle: "short" });
    }
    case "duration": {
      const v = value as { hours?: number; minutes?: number };
      return `${String(v.hours ?? 0).padStart(2, "0")}:${String(v.minutes ?? 0).padStart(2, "0")}`;
    }
    case "value_unit": {
      const v = value as { value?: number | string | null; unit?: string };
      return [num(v.value, locale), v.unit].filter(Boolean).join(" ");
    }
    case "formula": {
      const v = value as { result?: unknown; unit?: string };
      const r = typeof v.result === "boolean" ? (v.result ? labels.true : labels.false) : num(v.result, locale);
      return [r, v.unit].filter(Boolean).join(" ");
    }
    case "location": {
      const v = value as { lat?: number; lng?: number; alt?: number };
      return [v.lat, v.lng, v.alt].filter((x) => x !== undefined && x !== null).map((x) => num(x, locale)).join(" ; ");
    }
    case "photo":
    case "file":
      return Array.isArray(value) ? value.map((f: { name?: string; fileId?: string }) => f.name ?? f.fileId ?? "").join(" ; ") : "";
    case "collaborator": {
      const v = value as { firstName?: string; lastName?: string; companyName?: string; signedAt?: string };
      const name = [v.firstName, v.lastName].filter(Boolean).join(" ");
      return [name, v.companyName, v.signedAt ? new Date(v.signedAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-US") : ""].filter(Boolean).join(" - ");
    }
    case "text_editor":
      return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    default:
      return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
}
