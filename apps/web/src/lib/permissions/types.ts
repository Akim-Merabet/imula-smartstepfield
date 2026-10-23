import type { Enums } from "@/lib/supabase/database.types";

export type Authority = Enums<"authority">;
export type TeamRole = Enums<"team_role">;

export const ADMIN_AUTHORITIES: Authority[] = ["siteflow_admin", "global_admin", "admin"];
export const ADMIN_OR_ADVANCED: Authority[] = [...ADMIN_AUTHORITIES, "advanced"];
export const CONTRACTORS: Authority[] = ["co_contractor_user", "co_contractor_operator", "co_contractor_device"];

/** Ordre croissant des rôles d'entité (identique à l'enum Postgres). */
export const TEAM_ROLE_ORDER: TeamRole[] = ["readonly", "operator", "writer", "expert", "responsible"];

export function roleAtLeast(role: TeamRole | null | undefined, min: TeamRole): boolean {
  if (!role) return false;
  return TEAM_ROLE_ORDER.indexOf(role) >= TEAM_ROLE_ORDER.indexOf(min);
}

export type Action =
  | "read" | "add" | "edit" | "duplicate" | "delete" | "publish" | "export" | "import" | "upload"
  | "download" | "restore" | "unlock" | "editStatus" | "editRef" | "executeFlowRef" | "unlink" | "link"
  | "controlDiffusion" | "deleteSignature" | "view" | "share" | "archive" | "generateDocument"
  | "editFlowContributors" | "deactivate" | "reset" | "validateStep" | "devalidateStep";

/** Règle d'accès d'une action (spec 01 §3.4). Listes vides ou absentes = tout le monde. */
export type Rule = { rights?: Authority[]; roles?: TeamRole[]; forbidden?: Authority[] };
