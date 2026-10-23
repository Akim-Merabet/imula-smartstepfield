import { z } from "zod";
import { BLOCK_TYPES, FLOW_TYPES } from "./meta";

const optText = z.string().trim().max(255).optional().nullable().transform((v) => (v ? v : null));
const optLongText = z.string().trim().max(10000).optional().nullable().transform((v) => (v ? v : null));
const optUuid = z.union([z.uuid(), z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));
const optDate = z.string().optional().nullable().transform((v) => (v ? new Date(v).toISOString() : null));
const customFields = z.record(z.string(), z.union([z.string(), z.array(z.string()), z.null()])).default({});

/** Nom : 3 à 255 caractères, sans espace en début ni en fin (spec 02 §2.3 / §4.3). */
const name = z.string().min(3).max(255).refine((v) => v === v.trim(), { message: "trim" });

const datePair = (a: string, b: string) => (v: Record<string, unknown>) =>
  !v[a] || !v[b] || new Date(v[a] as string) <= new Date(v[b] as string);

export const flowSchema = z.object({
  flow_type: z.enum(FLOW_TYPES as [string, ...string[]]),
  name,
  description: optLongText,
  ref_int: optText,
  ref_ext: optText,
  family_id: optUuid,
  category_id: optUuid,
  custom_status_id: optUuid,
  status_comment: optLongText,
  tag_ids: z.array(z.uuid()).default([]),
  location_activated: z.boolean().default(false),
  location_site: optText,
  location_area: optText,
  location_local: optText,
  elementary_system: optText,
  functional_marker: optText,
  technical_object_label: optText,
  reporter_id: optUuid,
  assignee_ids: z.array(z.uuid()).default([]),
  tablet_1_id: optUuid,
  tablet_2_id: optUuid,
  tablet_3_id: optUuid,
  collaborators: z.array(z.object({ collaborator_id: z.uuid(), hierarchy_ids: z.array(z.uuid()).min(1) })).default([]),
  start_date: optDate,
  finish_date: optDate,
  estimated_start_date: optDate,
  estimated_end_date: optDate,
  achieved_start_date: optDate,
  achieved_end_date: optDate,
  simplified_signature_mode: z.boolean().default(false),
  supervision_intern_1: z.boolean().default(false),
  supervision_intern_2: z.boolean().default(false),
  supervision_intern_3: z.boolean().default(false),
  supervision_extern_1: z.boolean().default(false),
  supervision_extern_2: z.boolean().default(false),
  supervision_extern_3: z.boolean().default(false),
  internal_supervisor_name_1: optText,
  internal_supervisor_name_2: optText,
  internal_supervisor_name_3: optText,
  external_supervisor_name_1: optText,
  external_supervisor_name_2: optText,
  external_supervisor_name_3: optText,
  custom_fields: customFields,
})
  .refine(datePair("start_date", "finish_date"), { path: ["finish_date"], message: "dateOrder" })
  .refine(datePair("estimated_start_date", "estimated_end_date"), { path: ["estimated_end_date"], message: "dateOrder" })
  .refine(datePair("achieved_start_date", "achieved_end_date"), { path: ["achieved_end_date"], message: "dateOrder" });

export type FlowInput = z.input<typeof flowSchema>;

export const phaseSchema = z.object({
  name: z.string().trim().min(1).max(255),
  custom_number: optText,
  exclude_numbering: z.boolean().default(false),
  additional_comment: optText,
  description: optLongText,
  hide_title_pdf: z.boolean().default(false),
  read_only_on_mobile_app: z.boolean().default(false),
  sequence_type: z.enum(["linear", "parallel"]).default("linear"),
  mandatory: z.boolean().default(true),
  custom_fields: customFields,
});
export type PhaseInput = z.input<typeof phaseSchema>;

export const navigationSchema = z.object({
  id: z.uuid().optional(),
  target_phase_id: z.uuid(),
  target_step_id: z.uuid(),
  style: z.enum(["default", "info", "warning", "error", "success"]).default("default"),
  message: optText,
});

export const stepSchema = z.object({
  name,
  custom_number: optText,
  exclude_numbering: z.boolean().default(false),
  additional_comment: optText,
  description: optLongText,
  hide_title_pdf: z.boolean().default(false),
  read_only_on_mobile_app: z.boolean().default(false),
  enabled_blocks: z.array(z.enum(BLOCK_TYPES as [string, ...string[]])).min(1),
  linked_flow_id: optUuid,
  navigations: z.array(navigationSchema).default([]),
  custom_fields: customFields,
});
export type StepInput = z.input<typeof stepSchema>;

export const dsiConfigSchema = z.object({
  signatories_status: z.enum(["enabled", "disabled", "required", "optional"]),
  signatory_disabled_comment: optLongText,
  technical_control: z.boolean(),
  technical_control_step: z.boolean(),
  technical_control_details: optLongText,
  aip: z.boolean(),
  document_required: z.boolean(),
  observation: optLongText,
  document_reference: optText,
  breakpoint_int_1: z.boolean(), breakpoint_int_2: z.boolean(), breakpoint_int_3: z.boolean(),
  convocation_int_1: z.boolean(), convocation_int_2: z.boolean(), convocation_int_3: z.boolean(),
  breakpoint_ext_1: z.boolean(), breakpoint_ext_2: z.boolean(), breakpoint_ext_3: z.boolean(),
  convocation_ext_1: z.boolean(), convocation_ext_2: z.boolean(), convocation_ext_3: z.boolean(),
});
export type DsiConfigInput = z.input<typeof dsiConfigSchema>;

export const signatureSchema = z.object({
  block_id: z.uuid(),
  nature: z.string(),
  mode: z.enum(["person", "proxy", "not_applicable"]),
  contributor_type: z.enum(["intern", "extern", "not_listed_intern"]).default("intern"),
  signatory_id: optUuid,
  first_name: optText,
  last_name: optText,
  email: optText,
  company_name: optText,
  profession: optText,
  signed_at: z.string(),
  comment: optLongText,
  signature_data: z.string().max(400_000).optional().nullable(),
  proxy_principal_name: optText,
  proxy_date: optDate,
});
export type SignatureInput = z.input<typeof signatureSchema>;
