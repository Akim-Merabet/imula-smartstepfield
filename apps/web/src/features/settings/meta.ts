import type { Enums } from "@/lib/supabase/database.types";

export type FamilyNature = Enums<"label_family_nature">;
export type FamilyKind = Enums<"label_family_kind">;
export type BusinessClass = Enums<"business_class">;
export type LinkType = Enums<"link_type">;
export type CustomFieldType = Enums<"custom_field_type">;

/** Natures de famille (spec 01 §6.6), ordre d'affichage. */
export const FAMILY_NATURES: FamilyNature[] = [
  "project", "flow", "document", "form", "risk", "equipment", "device", "team", "function", "legal",
  "skill", "contract", "technical_object", "activity_domain",
];
/** Natures de catégorie. */
export const CATEGORY_NATURES: FamilyNature[] = ["flow", "document", "list", "hierarchy"];

/** Palette de couleurs proposée (bleu, orange foncé, vert, gris, orange, rose, violet, turquoise). */
export const COLOR_PALETTE = ["#1f5086", "#c2410c", "#008109", "#5e5a5a", "#f59e0b", "#db2777", "#7c3aed", "#0d9488"];
export const DEFAULT_FAMILY_COLOR = "#5e5a5a";

// ===== Statuts personnalisés (§6.7) =====
export const STATUS_NATURES = ["project", "flow", "form", "form_response", "technical_object", "multi_pr"] as const;
export type StatusNature = (typeof STATUS_NATURES)[number];
/** Statuts partagés dans l'organisation (account_id null). */
export const SHARED_STATUS_NATURES: StatusNature[] = ["form", "form_response", "technical_object"];
export const STATUS_CATEGORIES: Enums<"status_category">[] = ["todo", "in_preparation", "in_operation", "in_progress", "done"];

export const statusRules = (nature: StatusNature) => ({
  family: ["flow", "form_response", "form", "technical_object", "project"].includes(nature),
  isDefault: ["flow", "form_response", "form", "technical_object", "project"].includes(nature),
  hideEntity: ["flow", "project"].includes(nature),
  importable: nature === "form",
  downloadable: nature === "form",
  exportable: ["form_response", "flow", "technical_object"].includes(nature),
  category: ["flow", "project"].includes(nature),
});

export function statusLinkTypes(nature: StatusNature): LinkType[] {
  if (nature === "multi_pr") return ["default"];
  if (nature === "technical_object" || nature === "flow") return ["default", "entity_family_parent", "entity_family"];
  return ["default", "entity_parent_family_parent", "entity_parent_family"];
}

/** Nature des familles proposées pour un lien de statut. */
export function statusFamilyNature(nature: StatusNature): FamilyNature {
  if (nature === "technical_object") return "technical_object";
  if (nature === "form" || nature === "form_response") return "form";
  return "project";
}

// ===== Attributs personnalisés (§6.8) =====
export const FIELD_NATURES = ["project", "flow", "phase", "step", "technical_object", "document"] as const;
export type FieldNature = (typeof FIELD_NATURES)[number];
export const FIELD_TYPES: CustomFieldType[] = [
  "text", "textarea", "label", "integer", "double", "boolean", "date", "datetime", "select", "multiselect",
  "file", "image", "metadata", "link",
];
export const PHASE_STEP_TYPES: CustomFieldType[] = ["text", "textarea", "integer", "double", "boolean", "date", "datetime"];

export function fieldTypesFor(nature: FieldNature): CustomFieldType[] {
  return nature === "phase" || nature === "step" ? PHASE_STEP_TYPES : FIELD_TYPES;
}

export const fieldRules = (type: CustomFieldType, nature: FieldNature) => ({
  choices: type === "select" || type === "multiselect",
  defaultValue: ["text", "textarea", "date", "datetime", "link", "boolean", "integer", "double"].includes(type),
  placeholder: ["text", "textarea", "integer", "double", "select", "multiselect", "link"].includes(type),
  required: !["boolean", "metadata", "link", "label"].includes(type),
  readOnly: type !== "label",
  pdfField: ["text", "textarea", "integer", "double", "select", "multiselect", "boolean", "date", "datetime", "image", "metadata"].includes(type)
    && !["technical_object", "phase", "step"].includes(nature),
  variable: ["text", "textarea", "integer", "double", "select", "multiselect", "boolean", "date", "datetime", "link", "image"].includes(type),
  textDisplay: type === "link",
  flowDisplay: nature === "flow" && !["boolean", "image", "file", "label"].includes(type),
});

/** Nature des familles proposées pour un attribut lié à une famille. */
export function fieldFamilyNature(nature: FieldNature): FamilyNature {
  if (nature === "phase" || nature === "step") return "flow";
  return nature;
}

/** Séparateur de saisie des listes de choix (« A__B__C »). */
export const CHOICES_SEPARATOR = "__";

// ===== Références (§6.9) =====
export const REFERENCE_NATURES = ["project", "flow", "document", "form", "technical_object"] as const;
export type ReferenceNature = (typeof REFERENCE_NATURES)[number];
export function referenceFields(nature: ReferenceNature): Enums<"reference_field">[] {
  if (nature === "project") return ["ref_int", "ref_ext"];
  if (nature === "flow" || nature === "form") return ["ref_int"];
  return ["ref_int", "ref_ext", "complement_ref_int", "complement_ref_ext"];
}
export function referenceLinkTypes(nature: ReferenceNature): LinkType[] {
  const base: LinkType[] = ["default", "entity_family_parent", "entity_family"];
  return nature === "flow" || nature === "document" ? [...base, "entity_parent_family_parent", "entity_parent_family"] : base;
}
export function referenceFamilyNature(nature: ReferenceNature, link: LinkType): FamilyNature {
  if (link === "entity_parent_family_parent" || link === "entity_parent_family") return "project";
  return nature;
}
/** Variables de nomenclature ; {counter} est obligatoire. */
export const NOMENCLATURE_VARIABLES = ["{counter}", "{year}", "{month}", "{family}", "{parent_family}"];

// ===== Suivi (wording, §6.13) =====
export const WORDING_STATES = [
  "prel", "bpoAd", "bpoRc", "bpoModification", "vso", "vsoSr", "vao", "bpe", "bpeTemp", "bpeValid",
  "bpa", "bpaAd", "bpaRc", "bpaOk", "bpaKo", "bpaRefused", "bpaModification",
] as const;
export const WORDING_DEFAULTS: Record<(typeof WORDING_STATES)[number], string> = {
  prel: "PREL", bpoAd: "BPO", bpoRc: "BPO RC", bpoModification: "MOD", vso: "VSO", vsoSr: "VSO-SR", vao: "VAO",
  bpe: "BPE", bpeTemp: "BPE TEMP", bpeValid: "BPE *", bpa: "BPA", bpaAd: "BPA AD", bpaRc: "BPA RC", bpaOk: "V",
  bpaKo: "X", bpaRefused: "BPA X", bpaModification: "SI",
};
export const UI_LANGUAGES: Enums<"ui_language">[] = ["fr", "en", "de", "it"];

/** Libellé « court - long » d'une famille. */
export function familyLabel(f: { short_name: string; long_name?: string | null }) {
  return f.long_name ? `${f.short_name} - ${f.long_name}` : f.short_name;
}
