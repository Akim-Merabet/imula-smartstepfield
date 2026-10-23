/**
 * Trames (document_templates, spec 01 §6.12) : types de page, résolution Famille > Client > Défaut,
 * replis vers le type générique, chargement des PDF de fond (bucket documents, cache mémoire).
 */
import type { Tables } from "@/lib/supabase/database.types";
import type { Margins } from "@/lib/pdf/theme";
import type { DB } from "./service-client";

export const TEMPLATE_BUCKET = "documents";
/** Chemin de stockage d'une trame : templates/<organization_id>/<uuid>-<nom>.pdf */
export const templateStoragePath = (orgId: string, fileName: string) =>
  `templates/${orgId}/${crypto.randomUUID()}-${fileName.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80)}`;

/** Types de page groupés comme dans l'écran des trames. */
export const TEMPLATE_GROUPS: { group: string; types: string[] }[] = [
  { group: "document", types: ["COVER_PAGE", "COVER_PAGE_CLIENT", "PAGE_CONTENT_SUIVI", "PAGE_CONTENT_V", "PAGE_CONTENT_H", "PAGE_ANNEXE"] },
  { group: "closing", types: ["COVER_PAGE_RFI", "PAGE_CONTENT_SUIVI_RFI", "PAGE_SOMMAIRE_RFI", "PAGE_SECTION_RFI", "PAGE_CONTENT_RFI"] },
  { group: "form", types: ["FORM_GENERIC", "FORM_GENERIC_H", "FORM_MODEL", "FORM_MODEL_H", "FORM_TEMPLATE", "FORM_CONTENT", "PAGE_SKILLS"] },
  { group: "dsi", types: ["COVER_PAGE_DSI", "PAGE_CONTENT_SUIVI_DSI", "PAGE_EXPLICATION_DSI", "PAGE_H_DSI", "PAGE_V_DSI", "PAGE_SUIVI_SIGNATURE_DSI"] },
  { group: "list", types: ["COVER_PAGE_LDA", "COVER_PAGE_LCA", "PAGE_H_LCA"] },
  { group: "diagram", types: ["COVER_PAGE_DIAGRAM", "PAGE_CONTENT_SUIVI_DIAGRAM", "PAGE_H_DIAGRAM"] },
  { group: "multiPr", types: ["COVER_PAGE_MULTI_PR", "PAGE_CONTENT_SUIVI_MULTI_PR", "PAGE_CONTENT_VERTICAL_MULTI_PR", "PAGE_ANNEX_MULTI_PR"] },
];
export const TEMPLATE_PAGE_TYPES = TEMPLATE_GROUPS.flatMap((g) => g.types);
/** Types obligatoires (trame par défaut non supprimable). */
export const REQUIRED_DEFAULT_TYPES = ["COVER_PAGE", "PAGE_CONTENT_V", "PAGE_CONTENT_H"];

/** Repli d'un type optionnel vers le type générique (« optionnel (sinon …) »). */
const FALLBACK: Record<string, string> = {
  COVER_PAGE_DSI: "COVER_PAGE", COVER_PAGE_LDA: "COVER_PAGE", COVER_PAGE_LCA: "COVER_PAGE", COVER_PAGE_MULTI_PR: "COVER_PAGE",
  COVER_PAGE_RFI: "COVER_PAGE", COVER_PAGE_DIAGRAM: "COVER_PAGE",
  PAGE_CONTENT_SUIVI_DSI: "PAGE_CONTENT_SUIVI", PAGE_CONTENT_SUIVI_MULTI_PR: "PAGE_CONTENT_SUIVI", PAGE_CONTENT_SUIVI_RFI: "PAGE_CONTENT_SUIVI",
  PAGE_CONTENT_SUIVI_DIAGRAM: "PAGE_CONTENT_SUIVI", PAGE_CONTENT_SUIVI: "PAGE_CONTENT_V",
  PAGE_H_DSI: "PAGE_CONTENT_H", PAGE_V_DSI: "PAGE_CONTENT_V", PAGE_EXPLICATION_DSI: "PAGE_CONTENT_V", PAGE_SUIVI_SIGNATURE_DSI: "PAGE_CONTENT_V",
  PAGE_H_LCA: "PAGE_CONTENT_H", PAGE_H_DIAGRAM: "PAGE_CONTENT_H", PAGE_CONTENT_VERTICAL_MULTI_PR: "PAGE_CONTENT_V",
  PAGE_ANNEX_MULTI_PR: "PAGE_ANNEXE", PAGE_ANNEXE: "PAGE_CONTENT_V",
  FORM_GENERIC: "PAGE_CONTENT_V", FORM_MODEL: "FORM_GENERIC", FORM_TEMPLATE: "FORM_GENERIC", FORM_CONTENT: "FORM_GENERIC",
  FORM_GENERIC_H: "PAGE_CONTENT_H", FORM_MODEL_H: "FORM_GENERIC_H",
  PAGE_SOMMAIRE_RFI: "PAGE_CONTENT_RFI", PAGE_SECTION_RFI: "PAGE_CONTENT_RFI", PAGE_CONTENT_RFI: "PAGE_CONTENT_V", PAGE_SKILLS: "PAGE_CONTENT_V",
};

export type ResolvedTemplate = { row: Tables<"document_templates">; bytes: Uint8Array; margins: Margins; pageNumber: { x: number; y: number } | null };
export type TemplateSet = { get: (pageType: string) => ResolvedTemplate | null; any: boolean };

const cache = new Map<string, { at: string; bytes: Uint8Array }>();

async function download(db: DB, path: string, updatedAt: string): Promise<Uint8Array | null> {
  const hit = cache.get(path);
  if (hit && hit.at === updatedAt) return hit.bytes;
  const { data } = await db.storage.from(TEMPLATE_BUCKET).download(path);
  if (!data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  cache.set(path, { at: updatedAt, bytes });
  return bytes;
}

/** Charge les trames applicables (organisation, famille du document, client de l'entité). */
export async function loadTemplates(db: DB, orgId: string, familyId: string | null, clientId: string | null): Promise<TemplateSet> {
  const { data } = await db.from("document_templates").select("*").eq("organization_id", orgId);
  const rows = (data ?? []).filter((r) => r.link_type === "default" || (r.link_type === "family" && r.family_id === familyId)
    || (r.link_type === "client" && r.client_id === clientId));
  if (!rows.length) return { get: () => null, any: false };
  const rank = (r: Tables<"document_templates">) => (r.link_type === "family" ? 0 : r.link_type === "client" ? 1 : 2);
  const resolved = new Map<string, ResolvedTemplate | null>();
  // Préchargement (les trames sont petites, et la résolution doit rester synchrone pendant le rendu).
  const byType = new Map<string, Tables<"document_templates">>();
  for (const r of [...rows].sort((a, b) => rank(a) - rank(b))) if (!byType.has(r.page_type)) byType.set(r.page_type, r);
  for (const [type, row] of byType) {
    const bytes = await download(db, row.pdf_path, row.updated_at);
    resolved.set(type, bytes ? {
      row, bytes,
      margins: { top: Number(row.margin_top), bottom: Number(row.margin_bottom), left: Number(row.margin_left), right: Number(row.margin_right) },
      pageNumber: row.page_number_x !== null && row.page_number_y !== null ? { x: Number(row.page_number_x), y: Number(row.page_number_y) } : null,
    } : null);
  }
  const get = (type: string): ResolvedTemplate | null => {
    let cur: string | undefined = type;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const hit = resolved.get(cur);
      if (hit) return hit;
      cur = FALLBACK[cur];
    }
    return null;
  };
  return { get, any: true };
}
