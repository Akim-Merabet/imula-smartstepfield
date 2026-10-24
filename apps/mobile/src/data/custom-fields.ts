import { formatDate } from "@/components/kit";

/** Valeur d'attribut personnalisé en texte lisible (texte, nombre, date, booléen, choix). */
export function customFieldText(v: { type: string; value_text: string | null; value_json: string | null }): string | null {
  if (v.value_text) {
    if (v.type === "date") return formatDate(v.value_text);
    if (v.type === "datetime") return formatDate(v.value_text, true);
    return v.value_text;
  }
  if (!v.value_json) return null;
  try {
    const value = JSON.parse(v.value_json);
    if (typeof value === "boolean") return value ? "Oui" : "Non";
    if (Array.isArray(value)) return value.map((x) => (typeof x === "object" ? x?.label ?? x?.name ?? "" : String(x))).join(", ");
    if (value && typeof value === "object") return value.label ?? value.name ?? value.url ?? null;
    return String(value);
  } catch {
    return v.value_json;
  }
}
