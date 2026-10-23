import { z } from "zod";

const optText = (max = 255) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const optRef = z.string().trim().max(255).optional().nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || v.length >= 3, { message: "minLength" });
const uuidOrNull = z.union([z.uuid(), z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));

export const NATURE_VALUES = [
  "pr", "emm", "adr", "dsi", "multi_pr", "flow_form", "object", "project_form", "block_form", "multi_flow_form",
  "lfa", "lda", "list_emm", "list_emm_flow", "list_adr", "list_adr_flow", "lca", "field_feedback", "diagram",
  "pdf_versioned", "pdf_unversioned", "rfi",
] as const;

/** Champs de l'onglet Général (§3.1) + contenu (§3.4) + options (§3.3). */
export const documentSchema = z.object({
  source: z.enum(["flow", "form", "module", "extern", "closing_folder"]),
  nature: z.enum(NATURE_VALUES),
  family_id: z.uuid(),
  account_id: uuidOrNull,
  name: z.string().trim().min(3).max(255),
  ref_int: optRef,
  ref_ext: optRef,
  start_index: z.string().trim().max(16).optional().nullable().transform((v) => (v ? v : null)),
  category_id: uuidOrNull,
  closing_category_id: uuidOrNull,
  folder_template_id: uuidOrNull,
  // Contenu
  linked_flow_id: uuidOrNull,
  linked_form_id: uuidOrNull,
  linked_response_id: uuidOrNull,
  linked_diagram_id: uuidOrNull,
  linked_list_id: uuidOrNull,
  responses_strategy: z.enum(["all", "selected", "none"]).nullable().optional(),
  form_content_location: z.enum(["none", "content", "appendix"]).optional(),
  preamble: optText(5000), subject: optText(5000), glossary: optText(5000),
  options: z.record(z.string(), z.boolean()).optional(),
  selections: z.record(z.string(), z.array(z.uuid())).optional(),
  // Options
  language_1: z.enum(["none", "fr", "en", "de", "it"]).optional(),
  language_2: z.enum(["none", "fr", "en", "de", "it"]).optional(),
  client_cover_page: z.boolean().optional(),
  highlight_changes: z.boolean().optional(),
  custom_fields: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.null()])).optional(),
});
export type DocumentInput = z.input<typeof documentSchema>;

export const sectionSchema = z.object({
  type: z.enum(["document", "report", "certificate", "reference", "client_response", "document_large_file", "closing_folder"]),
  name: z.string().trim().min(1).max(255),
  description: optText(2000),
  observation: optText(2000),
  category_id: uuidOrNull,
  flow_id: uuidOrNull,
  all_emm_elements: z.boolean().default(true),
  include_previous_versions: z.boolean().default(false),
  sort_mode: z.number().int().min(1).max(10).nullable().optional(),
  position: z.number().int().nullable().optional(),
  items: z.array(z.object({ document_id: z.uuid().nullable(), version_id: z.uuid().nullable(), emm_element_id: z.uuid().nullable().optional() })).default([]),
});
export type SectionInput = z.input<typeof sectionSchema>;
