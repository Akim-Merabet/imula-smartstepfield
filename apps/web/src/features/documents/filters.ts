import type { DocumentFilters } from "./queries";

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(",") : v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

/** Paramètres d'URL → filtres de liste (partagé module / bibliothèque). */
export function parseDocumentFilters(sp: Record<string, string | string[] | undefined>): DocumentFilters {
  return {
    textSearch: str(sp.textSearch), families: list(sp.family), categories: list(sp.category), closingCategories: list(sp.closingCategory),
    provenances: list(sp.provenance), states: list(sp.state), flows: list(sp.flow), accounts: list(sp.applicability),
    dateField: sp.dateField === "diffusion" ? "diffusion" : "created", period: str(sp.period), from: str(sp.from), to: str(sp.to),
  };
}
