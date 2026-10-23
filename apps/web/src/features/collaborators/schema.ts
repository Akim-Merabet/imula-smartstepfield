import { z } from "zod";

const optText = (max = 255) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const optId = z.string().optional().nullable().transform((v) => (v ? v : null)).pipe(z.uuid().nullable());
const optDate = z.string().optional().nullable().transform((v) => (v ? v : null))
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());

export const collaboratorSchema = z.object({
  kind: z.enum(["user", "operator"]),
  first_name: z.string().trim().min(1).max(50),
  last_name: z.string().trim().min(1).max(50),
  trigram: z.string().trim().min(3).max(10).transform((v) => v.toUpperCase()),
  email: z.string().trim().max(50).optional().nullable().transform((v) => (v ? v.toLowerCase() : null)),
  sso_identifier: optText(),
  register_number: optText(),
  authority: z.enum(["simple", "normal", "advanced", "admin", "global_admin", "siteflow_admin", "co_contractor_user"]).nullable().optional(),
  additional_rights: z.array(z.enum(["generic_form", "model_form", "manage_diffusion"])).default([]),
  company_id: z.uuid(),
  function_id: z.uuid(),
  group_id: z.uuid(),
  complement: optText(),
  legal_id: optId,
  contract_type_id: optId,
  hierarchy_ids: z.array(z.uuid()).default([]),
}).superRefine((v, ctx) => {
  if (v.kind === "user") {
    if (!v.email || !z.email().safeParse(v.email).success) ctx.addIssue({ code: "custom", path: ["email"], message: "email" });
    if (!v.authority) ctx.addIssue({ code: "custom", path: ["authority"], message: "required" });
  }
});
export type CollaboratorInput = z.input<typeof collaboratorSchema>;

export const skillSchema = z.object({
  skill_id: z.uuid(),
  activity_domain_id: optId,
  started_at: optDate,
  business_updated_at: optDate,
  ended_at: optDate,
  expertise: z.number().int().min(0).max(10).nullable().optional(),
  description: optText(5000),
  comment: optText(5000),
}).superRefine((v, ctx) => {
  if (v.ended_at && v.started_at && v.ended_at < v.started_at) ctx.addIssue({ code: "custom", path: ["ended_at"], message: "endBeforeStart" });
  if (v.ended_at && v.business_updated_at && v.ended_at < v.business_updated_at) ctx.addIssue({ code: "custom", path: ["ended_at"], message: "endBeforeUpdate" });
  if (v.business_updated_at && v.started_at && v.business_updated_at < v.started_at) ctx.addIssue({ code: "custom", path: ["business_updated_at"], message: "updateBeforeStart" });
});
export type SkillInput = z.input<typeof skillSchema>;

export const externalUserSchema = z.object({
  first_name: z.string().trim().min(1).max(50),
  last_name: z.string().trim().min(1).max(50),
  company_name: z.string().trim().min(1).max(255),
  profession: z.string().trim().min(1).max(255),
});
export type ExternalUserInput = z.input<typeof externalUserSchema>;

export const tabletSchema = z.object({
  name: z.string().trim().min(3).max(255),
  nature: z.enum(["internal", "external"]),
  family_id: z.uuid(),
  company_id: z.uuid(),
  status: z.enum(["active", "disabled", "broken", "down", "maintenance"]),
  comment: optText(5000),
  notify_email: z.email(),
});
export type TabletInput = z.input<typeof tabletSchema>;

export const authorizedDeviceSchema = z.object({
  designation: z.string().trim().min(3).max(255),
  device_id: z.string().trim().min(3).max(255),
});
export type AuthorizedDeviceInput = z.input<typeof authorizedDeviceSchema>;
