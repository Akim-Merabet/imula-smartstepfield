import { PERMISSIONS } from "./matrix";
import type { Action, Authority, Rule, TeamRole } from "./types";

export type PermissionContext = {
  authority: Authority | null;
  /** Rôle de l'utilisateur dans l'entité courante (si l'écran est dans le contexte d'une entité). */
  projectRole?: TeamRole | null;
};

/**
 * Évalue une règle (spec 01 §3.4) :
 * 1. droit interdit → refus ;
 * 2. en contexte d'entité, si la règle définit des rôles et que l'utilisateur a un rôle → décision sur le rôle ;
 * 3. sinon décision sur les droits (liste vide = tout le monde).
 */
export function evaluateRule(rule: Rule | undefined, ctx: PermissionContext): boolean {
  if (!rule) return false;
  const authority = ctx.authority;
  if (authority && rule.forbidden?.includes(authority)) return false;
  if (rule.roles && ctx.projectRole) return rule.roles.includes(ctx.projectRole);
  if (!rule.rights || rule.rights.length === 0) return true;
  return authority ? rule.rights.includes(authority) : false;
}

export function can(routeId: string, action: Action, ctx: PermissionContext): boolean {
  return evaluateRule(PERMISSIONS[routeId]?.[action], ctx);
}
