"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { can } from "@/lib/permissions/check";
import type { Authority, TeamRole } from "@/lib/permissions/types";

export type DocPermissions = { loaded: boolean; add: boolean; edit: boolean; delete: boolean; import: boolean; unlock: boolean; editRef: boolean };

/**
 * Droits UI du module (matrice + rôle d'entité) côté client, pour les modales-routes.
 * « Déverrouiller le suivi » : action controlDiffusion (admin plateforme) ou droit additionnel manage_diffusion.
 */
export function useDocumentPermissions(routeId: "DashboardDocuments" | "LibraryDocuments" | "DashboardClosingFolder", projectId: string | null) {
  const [perms, setPerms] = useState<DocPermissions>({ loaded: false, add: false, edit: false, delete: false, import: false, unlock: false, editRef: false });
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: me } = await supabase.from("collaborators").select("id, authority, additional_rights").eq("auth_user_id", auth.user.id).maybeSingle();
      if (!me) return;
      let projectRole: TeamRole | null = null;
      if (projectId) {
        const { data } = await supabase.from("project_members").select("role").eq("project_id", projectId).eq("collaborator_id", me.id).maybeSingle();
        projectRole = data?.role ?? null;
      }
      const ctx = { authority: me.authority as Authority | null, projectRole };
      const edit = can(routeId, "edit", ctx);
      if (!active) return;
      setPerms({
        loaded: true, add: can(routeId, "add", ctx), edit, delete: can(routeId, "delete", ctx), import: can(routeId, "import", ctx),
        editRef: can(routeId, "editRef", ctx),
        unlock: edit && (can(routeId, "controlDiffusion", ctx) || (me.additional_rights ?? []).includes("manage_diffusion")),
      });
    })();
    return () => { active = false; };
  }, [routeId, projectId]);
  return perms;
}
