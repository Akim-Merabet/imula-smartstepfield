import { z } from "zod";
import { flowTerms } from "@/i18n/config";

export const optText = z.string().trim().max(255).optional().nullable().transform((v) => (v ? v : null));
export const optLongText = z.string().trim().max(5000).optional().nullable().transform((v) => (v ? v : null));
const reqText = z.string().trim().min(1).max(255);
const optEmail = z.union([z.literal(""), z.email()]).optional().nullable().transform((v) => (v ? v : null));
const optNumber = z.union([z.number(), z.nan(), z.null()]).optional().transform((v) => (typeof v === "number" && !Number.isNaN(v) ? v : null));
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const accountSchema = z.object({
  name: reqText,
  full_name: optText,
  address_line_1: reqText,
  address_line_2: optText,
  postal_code: reqText,
  city: reqText,
  country: optText,
  phone: optText,
  fax: optText,
  contact_email: optEmail,
  website: optText,
});
export type AccountInput = z.input<typeof accountSchema>;

export const generalAccountSchema = z.object({
  pgac_enabled: z.boolean(),
  pgac_subcontractors: z.string().optional().default(""),
  file_module_enabled: z.boolean(),
  freeze_signature_date: z.boolean(),
  local_form_creation: z.boolean(),
  auto_lock_form_responses: z.boolean(),
  hide_multi_pr_titles: z.boolean(),
  default_sequence_type: z.enum(["linear", "parallel"]),
  default_phase_type: z.enum(["linear", "parallel"]),
  doc_language_1: z.enum(["none", "fr", "en", "de", "it"]),
  doc_language_2: z.enum(["none", "fr", "en", "de", "it"]),
  doc_index_format: z.enum(["numeric_zero", "numeric", "alpha", "numeric_all_zero", "numeric_all_zero_start_zero", "numeric_decimal", "numeric_decimal_start_zero"]),
  doc_watermark: optText,
  time_zone: z.string().trim().min(1),
});
export type GeneralAccountInput = z.input<typeof generalAccountSchema>;

export const clientSchema = z.object({
  name: reqText,
  name_2: optText,
  name_3: optText,
  address: reqText,
  address_comp: optText,
  zip_code: reqText,
  city: reqText,
  country: optText,
  observation: optLongText,
  reference: optText,
  cover_page_enabled: z.boolean().default(false),
  page_number_x: optNumber,
  page_number_y: optNumber,
  index_max: optNumber,
});
export type ClientInput = z.input<typeof clientSchema>;

export const companySchema = z.object({
  name: reqText,
  activity_area: optText,
  comment: optLongText,
});
export type CompanyInput = z.input<typeof companySchema>;

export const familySchema = z.object({
  kind: z.enum(["family", "category"]),
  nature: z.enum(["project", "flow", "document", "form", "risk", "equipment", "device", "team", "function", "legal",
    "skill", "contract", "technical_object", "activity_domain", "list", "hierarchy"]),
  relative_nature: z.enum(["parent", "child"]),
  parent_id: z.uuid().nullable().optional(),
  project_id: z.uuid().nullable().optional(),
  short_name: z.string().trim().min(3).max(255),
  long_name: optText,
  code: optText,
  color: hex,
  priority: z.number().int().min(0).max(100000).default(0),
  quality_reference: optText,
  client_supervision: z.boolean().default(false),
  client_supervision_sub_index: z.boolean().default(false),
  wording_configuration_id: z.uuid().nullable().optional(),
}).refine((v) => v.relative_nature === "parent" || !!v.parent_id, { path: ["parent_id"], message: "required" });
export type FamilyInput = z.input<typeof familySchema>;

export const statusSchema = z.object({
  nature: z.enum(["project", "flow", "form", "form_response", "technical_object", "multi_pr"]),
  name: z.string().trim().min(3).max(255),
  description: z.string().trim().max(2000).optional().nullable()
    .transform((v) => (v ? v : null)).refine((v) => !v || v.length >= 3, { message: "min3" }),
  color: hex,
  category: z.enum(["todo", "in_preparation", "in_operation", "in_progress", "done"]),
  link_type: z.enum(["default", "entity_family_parent", "entity_family", "entity_parent_family_parent", "entity_parent_family"]),
  label_family_id: z.uuid().nullable().optional(),
  is_default: z.boolean().default(false),
  downloadable: z.boolean().default(false),
  importable: z.boolean().default(false),
  exportable: z.boolean().default(false),
  hide_entity: z.boolean().default(false),
}).refine((v) => v.link_type === "default" || !!v.label_family_id, { path: ["label_family_id"], message: "required" });
export type StatusInput = z.input<typeof statusSchema>;

export const customFieldSchema = z.object({
  nature: z.enum(["project", "flow", "phase", "step", "technical_object", "document"]),
  type: z.enum(["text", "textarea", "label", "integer", "double", "boolean", "date", "datetime", "select", "multiselect",
    "file", "image", "metadata", "link"]),
  name: z.string().trim().min(3).max(255),
  link_type: z.enum(["default", "entity_family_parent", "entity_family"]),
  label_family_id: z.uuid().nullable().optional(),
  choices: z.array(z.string().trim().min(1)).default([]),
  default_value: z.string().optional().nullable().transform((v) => (v ? v : null)),
  placeholder: optText,
  tooltip: optText,
  description: optLongText,
  required: z.boolean().default(false),
  read_only: z.boolean().default(false),
  pdf_field_name: optText,
  variable_name: z.string().trim().max(100).optional().nullable().transform((v) => (v ? v : null))
    .refine((v) => !v || /^[A-Za-z_][A-Za-z0-9_]*$/.test(v), { message: "pattern" }),
  text_display: optText,
  display_in_flow_card: z.boolean().default(false),
  display_in_flow_banner: z.boolean().default(false),
  display_on_flow_opening: z.boolean().default(false),
}).refine((v) => v.link_type === "default" || !!v.label_family_id, { path: ["label_family_id"], message: "required" })
  .refine((v) => !(v.type === "select" || v.type === "multiselect") || v.choices.length > 0, { path: ["choices"], message: "required" })
  .refine((v) => new Set(v.choices.map((c) => c.toLowerCase())).size === v.choices.length, { path: ["choices"], message: "duplicate" });
export type CustomFieldInput = z.input<typeof customFieldSchema>;

export const referenceSchema = z.object({
  nature: z.enum(["project", "flow", "document", "form", "technical_object"]),
  field: z.enum(["ref_ext", "ref_int", "complement_ref_int", "complement_ref_ext"]),
  link_type: z.enum(["default", "entity_family_parent", "entity_family", "entity_parent_family_parent", "entity_parent_family"]),
  label_family_id: z.uuid().nullable().optional(),
  nomenclature: z.string().trim().min(1).max(255).refine((v) => v.includes("{counter}"), { message: "pattern" }),
  counter_type: z.enum(["global", "local"]),
  counter_format: z.number().int().min(4).max(8),
  start_value: z.number().int().min(0).default(1),
}).refine((v) => v.link_type === "default" || !!v.label_family_id, { path: ["label_family_id"], message: "required" });
export type ReferenceInput = z.input<typeof referenceSchema>;

export const organizationSchema = z.object({
  allowed_download_response: optNumber,
  block_form_response_edition: z.boolean(),
  diagram_enabled: z.boolean(),
  link_expiration_days: z.number().int().min(1).max(90),
  links_form_attributes_enabled: z.boolean(),
  local_form_allowed: z.boolean(),
  number_format: z.enum(["fr", "en"]),
  flow_term: z.enum(flowTerms),
  rubric_permissions_enabled: z.boolean(),
  support_chat_enabled: z.boolean(),
});
export type OrganizationInput = z.input<typeof organizationSchema>;

export const wordingSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: optLongText,
  hide_bpa: z.boolean(),
  hide_bpe_valid: z.boolean(),
  hide_vso_sr: z.boolean(),
  is_default: z.boolean(),
});
export type WordingInput = z.input<typeof wordingSchema>;

const wordingEntry = z.object({ value: z.string().trim().min(1), tooltip: z.string().trim().min(1), color: hex.optional(), icon: z.string().optional() });
export const wordingLanguageSchema = z.object({
  language: z.enum(["fr", "en", "de", "it"]),
  fields: z.record(z.string(), wordingEntry),
});
export type WordingLanguageInput = z.input<typeof wordingLanguageSchema>;
