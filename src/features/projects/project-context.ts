import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import type { Action } from "@/lib/permissions/types";
import { getProject } from "./queries";

/** Entité courante + rôle + helper de permission (mémoïsé par requête). */
export const getProjectContext = cache(async (projectId: string) => {
  const session = await requireSession();
  const result = await getProject(projectId, session.collaborator.id);
  if (!result) notFound();
  const ctx = { authority: session.collaborator.authority, projectRole: result.role };
  return {
    session,
    project: result.project,
    role: result.role,
    can: (routeId: string, action: Action) => can(routeId, action, ctx),
  };
});
