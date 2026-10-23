import type { Enums } from "@/lib/supabase/database.types";

export type DocumentNature = Enums<"document_nature">;
export type DocumentSource = Enums<"document_source">;
export type DocumentState = Enums<"document_state">;
export type DocumentStep = Enums<"document_step">;
export type DocumentVisa = Enums<"document_visa">;
export type IndexFormat = Enums<"index_format">;
export type ClosingSectionType = Enums<"closing_section_type">;

export const DOCUMENTS_BUCKET = "documents";
/** Limite d'import d'un document externe (spec 04 §5.7). */
export const MAX_EXTERNAL_FILE_SIZE = 2 * 1024 * 1024 * 1024;
/** Seuil « document volumineux ». */
export const LARGE_FILE_THRESHOLD = 20 * 1024 * 1024;
export const LIBRARY_IMPORT_MAX = 10;
export const MAX_OBJECT_ATTRIBUTES = 3;

/** Types proposés par source (§2.1, §2.2) ; list_*_flow s'obtiennent par bascule depuis list_*. */
export const NATURES_BY_SOURCE: Record<Exclude<DocumentSource, "closing_folder">, DocumentNature[]> = {
  flow: ["pr", "emm", "adr", "dsi", "multi_pr", "flow_form", "object"],
  form: ["project_form", "block_form", "multi_flow_form"],
  module: ["lfa", "lda", "list_adr", "list_emm", "lca", "field_feedback", "diagram"],
  extern: ["pdf_versioned", "pdf_unversioned"],
};
export const CREATION_SOURCES = ["flow", "form", "module", "extern"] as const;

export const FLOW_NATURES: DocumentNature[] = NATURES_BY_SOURCE.flow;
export const FORM_NATURES: DocumentNature[] = NATURES_BY_SOURCE.form;
export const EXTERN_NATURES: DocumentNature[] = ["pdf_versioned", "pdf_unversioned"];

export function isExtern(nature: DocumentNature) { return nature === "pdf_versioned" || nature === "pdf_unversioned"; }
export function isVersioned(nature: DocumentNature) { return nature !== "pdf_unversioned"; }

/** Nature affichée dans la liste des types (les variantes « depuis plusieurs flows » sont regroupées). */
export function baseNature(n: DocumentNature): DocumentNature {
  return n === "list_emm_flow" ? "list_emm" : n === "list_adr_flow" ? "list_adr" : n;
}

/** Onglets de la modale selon la nature (§2.6). */
export type DocumentTab = "general-tab" | "attribute-tab" | "content-tab" | "follow-tab" | "options-tab";
export function documentTabs(nature: DocumentNature): DocumentTab[] {
  if (nature === "pdf_versioned") return ["general-tab", "attribute-tab", "follow-tab", "options-tab"];
  if (nature === "pdf_unversioned") return ["general-tab", "attribute-tab", "content-tab"];
  if (nature === "rfi") return ["general-tab", "attribute-tab", "follow-tab", "options-tab"];
  return ["general-tab", "attribute-tab", "content-tab", "follow-tab", "options-tab"];
}

type FlowType = Enums<"flow_type">;
/** Types de flow sélectionnables selon la nature et l'entité (§2.4). */
export function allowedFlowTypes(nature: DocumentNature, referentialEntity: boolean): FlowType[] {
  const n = baseNature(nature) === "list_emm" || baseNature(nature) === "list_adr" ? "list_flow" : nature;
  const project: Record<string, FlowType[]> = {
    pr: ["specific", "group", "generic"], dsi: ["specific", "group", "generic"], adr: ["specific", "generic"], emm: ["specific", "generic"],
    multi_pr: ["specific"], object: ["specific"], block_form: ["specific", "group", "flow_form"], flow_form: ["specific", "flow_form", "group"],
    lfa: ["specific", "group", "generic", "flow_form"], lda: ["specific", "group", "generic", "flow_form"],
    list_flow: ["specific", "generic"], multi_flow_form: ["specific", "group", "flow_form"],
  };
  const referential: Record<string, FlowType[]> = {
    pr: ["referential", "group_referential", "referential_generic"], dsi: ["referential", "group_referential"],
    adr: ["referential", "group_referential"], emm: ["referential", "group_referential"], multi_pr: ["referential"], object: ["referential"],
    block_form: ["referential", "group_referential"], flow_form: ["referential", "group_referential"],
    lfa: ["referential", "group_referential", "referential_generic", "referential_intervention", "local_referential"],
    lda: ["referential", "group_referential", "referential_generic", "referential_intervention", "local_referential"],
    list_flow: ["referential", "referential_generic"], multi_flow_form: ["referential", "group_referential"],
  };
  return (referentialEntity ? referential : project)[n] ?? [];
}

// ===== Suivi : clés de libellé configurables (§4.3.4) ===========================
export const WORDING_KEYS = [
  "prel", "bpoAd", "bpoRc", "bpoModification", "vso", "vsoSr", "vao", "bpe", "bpeTemp", "bpeValid",
  "bpa", "bpaAd", "bpaRc", "bpaOk", "bpaKo", "bpaRefused", "bpaModification", "other",
] as const;
export type WordingKey = (typeof WORDING_KEYS)[number];

/** Clé d'état d'une ligne (pastille « Statut ») à partir de (état, étape). */
export function stateKey(v: { state: DocumentState; step: DocumentStep | null }): WordingKey {
  switch (v.state) {
    case "none": return "other";
    case "prel": return "prel";
    case "temp": return "bpeTemp";
    case "bpo": return v.step === "client_res" ? "bpoRc" : "bpoAd";
    case "bpe": return v.step === "bpe_valid" ? "bpeValid" : "bpe";
    case "bpa":
      return v.step === "client_res_bpa" ? "bpaRc" : v.step === "bpa" ? "bpa" : v.step === "bpa_refused" ? "bpaRefused" : "bpaAd";
  }
}

/** Clé du retour enregistré (colonne « Retour ») ; diffusion = libellé fixe. */
export function visaKey(visa: DocumentVisa | null): WordingKey | null {
  switch (visa) {
    case "modification": return "bpoModification";
    case "modification_bpa": return "bpaModification";
    case "vso": return "vso";
    case "vso_sr": return "vsoSr";
    case "vao": return "vao";
    case "vso_bpa": return "bpaOk";
    case "vao_bpa": return "bpaKo";
    case "bpe_valid": return "bpeValid";
    default: return null;
  }
}

/** États librement choisis en édition de diffusion (U7). */
export const FREE_STATE_KEYS: WordingKey[] = ["prel", "bpoAd", "bpoRc", "bpe", "bpeTemp", "bpeValid", "bpaAd", "bpaRc", "bpa", "bpaRefused"];

export const DEFAULT_WORDING_COLORS: Partial<Record<WordingKey, string>> = {
  prel: "#7a7a7a", bpoAd: "#d76e13", bpoRc: "#1f5086", bpe: "#008109", bpeTemp: "#d76e13", bpeValid: "#008109",
  vso: "#008109", vsoSr: "#d76e13", vao: "#ac0907", bpa: "#008109", bpaAd: "#d76e13", bpaRc: "#1f5086",
  bpaOk: "#008109", bpaKo: "#ac0907", bpaRefused: "#ac0907", other: "#828282",
};

export type WordingEntry = { value: string; tooltip: string; color?: string; icon?: string };
export type WordingFields = Partial<Record<WordingKey, WordingEntry>>;

// ===== Indices (R-IDX-1..5) — miroir des fonctions SQL ==========================
export const INDEX_FORMATS: IndexFormat[] = [
  "numeric_zero", "numeric", "alpha", "numeric_all_zero", "numeric_all_zero_start_zero", "numeric_decimal", "numeric_decimal_start_zero",
];

export function indexFormatOf(index: string): IndexFormat | null {
  if (!index || index.length > 16) return null;
  if (/^[A-Z]+$/.test(index)) return "alpha";
  if (/^0\.[0-9]+$/.test(index)) return "numeric_decimal_start_zero";
  if (/^[1-9][0-9]*\.[0-9]+$/.test(index)) return "numeric_decimal";
  if (/^0+$/.test(index) && index.length >= 2) return "numeric_all_zero_start_zero";
  if (/^0[0-9]+$/.test(index)) return "numeric_all_zero";
  if (index === "0") return "numeric_zero";
  if (/^[1-9][0-9]*$/.test(index)) return "numeric";
  return null;
}

/** Actions de la machine à états exposées par public.document_version_action. */
export type VersionAction =
  | "attach_file" | "diffuse" | "cancel_diffusion" | "client_response" | "to_bpo" | "bpe_valid" | "add_sub_index"
  | "diffuse_bpa" | "client_response_bpa" | "set_contributors" | "particularize" | "without_field_data" | "set_start_index"
  | "new_index_next" | "new_sub_index" | "new_index_same" | "delete_last" | "edit_diffusion" | "edit_response" | "edit_file"
  | "regenerate" | "refresh_config" | "refresh_last_index";

export const CLOSING_SECTION_TYPES: ClosingSectionType[] = [
  "document", "report", "certificate", "reference", "client_response", "document_large_file", "closing_folder",
];
export const SECTION_SORT_MODES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function formatSize(bytes: number | null | undefined) {
  if (!bytes) return "—";
  const units = ["o", "Ko", "Mo", "Go"];
  let v = bytes; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
}

/** Chemin de stockage d'un fichier de document. */
export function storagePath(doc: { id: string; project_id: string | null }, versionId: string | null, fileName: string) {
  const safe = fileName.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-120);
  const stamp = Date.now().toString(36);
  const root = doc.project_id ? `projects/${doc.project_id}/${doc.id}` : `library/${doc.id}`;
  return `${root}/${versionId ?? "files"}/${stamp}-${safe}`;
}
