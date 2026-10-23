import { z } from "zod";

const optText = z.string().trim().max(255).optional().nullable().transform((v) => (v ? v : null));
const optLong = z.string().trim().max(5000).optional().nullable().transform((v) => (v ? v : null));

/** Dialogue Créer / Éditer un formulaire (onglets Général / Options, spec 03 §2.1). */
export const formInfoSchema = z.object({
  nature: z.enum(["model", "generic", "other", "local", "archived"]),
  name: z.string().trim().min(1).max(255),
  description: optLong,
  reference: optText,
  index_label: optText,
  family_id: z.uuid(),
  account_id: z.uuid().nullable().optional(),
  company_ids: z.array(z.uuid()).default([]),
  custom_status_id: z.uuid().nullable().optional(),
  status_change_comment: optLong,
  additional_comment: optLong,
  additional_observation: optLong,
  lock_responses: z.boolean().default(false),
  object_attributes_link: z.enum(["disabled", "default_family", "other_family"]).default("disabled"),
  object_family_id: z.uuid().nullable().optional(),
  pdf_template: z.object({
    enabled: z.boolean(),
    file_id: z.string().nullable().optional(),
    file_name: z.string().nullable().optional(),
    page_number_x: z.number().int().min(0).max(2000).nullable().optional(),
    page_number_y: z.number().int().min(0).max(2000).nullable().optional(),
  }).default({ enabled: false }),
  hide_in_exports: z.object({
    control_doc: z.boolean().default(false),
    forms_doc: z.boolean().default(false),
    multi_instr_doc: z.boolean().default(false),
    instr_doc: z.boolean().default(false),
  }).default({ control_doc: false, forms_doc: false, multi_instr_doc: false, instr_doc: false }),
}).refine((v) => v.object_attributes_link !== "other_family" || !!v.object_family_id, { path: ["object_family_id"], message: "required" })
  .refine((v) => !v.pdf_template.enabled || !!v.pdf_template.file_id, { path: ["pdf_template"], message: "required" });

export type FormInfoInput = z.input<typeof formInfoSchema>;

export const duplicateSchema = z.object({
  nature: z.enum(["model", "generic"]),
  name: z.string().trim().min(1).max(255),
});
