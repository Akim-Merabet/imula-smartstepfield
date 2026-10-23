import type { Enums } from "@/lib/supabase/database.types";

export type Authority = Enums<"authority">;
export type CollaboratorKind = Enums<"collaborator_kind">;
export type CollaboratorStatus = Enums<"collaborator_status">;
export type TabletStatus = Enums<"tablet_status">;
export type TabletNature = Enums<"tablet_nature">;
export type AdditionalRight = Enums<"additional_right">;

/** Couleurs des statuts collaborateur (spec 01 §4.2). */
export const COLLABORATOR_STATUS_COLORS: Record<CollaboratorStatus, string> = {
  active: "#57b09d",
  inactive: "#af1018",
  onboarding: "#ffb141",
  blocked: "#af1018",
  deleted: "#9e9e9e",
};
export const COLLABORATOR_STATUSES: CollaboratorStatus[] = ["active", "inactive", "onboarding", "blocked", "deleted"];
/** Statuts proposés au filtre des opérateurs (pas d'invitation ni de blocage). */
export const OPERATOR_STATUSES: CollaboratorStatus[] = ["active", "inactive", "deleted"];

/** Droits listés du plus élevé au plus bas (filtre « Droit »). */
export const AUTHORITY_ORDER: Authority[] = [
  "siteflow_admin", "global_admin", "admin", "advanced", "normal", "simple", "co_contractor_user",
];
export const ADMIN_AUTHORITIES: Authority[] = ["siteflow_admin", "global_admin", "admin"];
export const CONTRACTOR_AUTHORITIES: Authority[] = ["co_contractor_user", "co_contractor_operator", "co_contractor_device"];
/** Droits pour lesquels l'onglet « Droit complémentaire » est disponible (spec 01 §3.2). */
export const ADDITIONAL_RIGHT_ELIGIBLE: Authority[] = ["admin", "global_admin", "advanced", "co_contractor_user"];
export const ADDITIONAL_RIGHTS: AdditionalRight[] = ["generic_form", "model_form", "manage_diffusion"];

/** Droits qu'un utilisateur peut attribuer dans la modale (spec 01 §3.1). */
export function assignableAuthorities(current: Authority | null): Authority[] {
  const base: Authority[] = ["simple", "normal", "advanced"];
  if (current && ADMIN_AUTHORITIES.includes(current)) base.push("admin");
  if (current === "global_admin" || current === "siteflow_admin") base.push("global_admin");
  return base;
}

/** Admins et co-traitants ne sont pas « réorganisables » en masse (spec 01 §4.4). */
export function isReorganizable(authority: Authority | null) {
  return !authority || (!ADMIN_AUTHORITIES.includes(authority) && !CONTRACTOR_AUTHORITIES.includes(authority));
}

export const TABLET_STATUSES: TabletStatus[] = ["active", "disabled", "broken", "down", "maintenance"];
export const TABLET_STATUS_COLORS: Record<TabletStatus, string> = {
  active: "#57b09d", disabled: "#af1018", broken: "#af1018", down: "#d76e13", maintenance: "#ffb141",
};
export const TABLET_NATURES: TabletNature[] = ["internal", "external"];

export const REORGANIZE_CATEGORIES = ["hierarchy", "function", "group", "legal", "contract", "authority"] as const;
export type ReorganizeCategory = (typeof REORGANIZE_CATEGORIES)[number];

/** Une compétence est expirée quand sa date de fin est dépassée (spec 01 §4.6). */
export function isSkillExpired(endedAt: string | null) {
  if (!endedAt) return false;
  return endedAt < new Date().toISOString().slice(0, 10);
}

export const familyLabel = (f: { short_name: string; long_name: string | null } | null | undefined) =>
  f ? (f.long_name ? `${f.short_name} - ${f.long_name}` : f.short_name) : "";
