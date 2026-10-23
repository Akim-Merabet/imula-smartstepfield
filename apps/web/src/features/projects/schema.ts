import { z } from "zod";
import { CREATABLE_PROJECT_TYPES } from "./meta";

const optText = z.string().trim().max(255).optional().transform((v) => (v ? v : null));
const optLongText = z.string().trim().max(5000).optional().transform((v) => (v ? v : null));
const exportLanguage = z.enum(["none", "fr", "en", "de", "it"]);

export const projectSchema = z.object({
  type: z.enum(CREATABLE_PROJECT_TYPES as [string, ...string[]]),
  designation: z.string().trim().min(3).max(255),
  client_id: z.uuid(),
  family_id: z.uuid(),
  custom_status_id: z.uuid().nullable().optional(),
  status_comment: optLongText,
  business_ref: optText,
  /** Indice (sous-dossier référentiel). */
  project_index: optText,
  location_label: optText,
  description: optLongText,
  is_contractual: z.boolean().default(false),
  contract_ref: optText,
  internal_command: optText,
  external_command: optText,
  market_number: optText,
  technical_deal: optText,
  keywords: optText,
  business_domain: optText,
  national_program: optText,
  complement_ref_1: optText,
  complement_ref_2: optText,
  export_language_1: exportLanguage.default("none"),
  export_language_2: exportLanguage.default("none"),
  is_intern_supervised: z.boolean().default(false),
  supervision_intern_1: optText,
  supervision_intern_2: optText,
  supervision_intern_3: optText,
  is_supervised: z.boolean().default(false),
  supervision_1: optText,
  supervision_2: optText,
  supervision_3: optText,
  custom_fields: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.null()])).default({}),
}).refine((v) => !v.is_intern_supervised || !!v.supervision_intern_1, { path: ["supervision_intern_1"], message: "required" })
  .refine((v) => !v.is_supervised || !!v.supervision_1, { path: ["supervision_1"], message: "required" });

export type ProjectInput = z.input<typeof projectSchema>;
