import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { targetResponseId, type ResolvedShare } from "./access";

export type TargetInfo = {
  /** form = formulaire vierge, response = réponse existante, document. */
  type: "form" | "response" | "document";
  name: string;
  reference: string | null;
  sender: { firstName: string; lastName: string } | null;
  projectName: string | null;
  responseState: "in_progress" | "done" | null;
};

/**
 * Libellés de la cible d'un partage. Toutes les lectures sont filtrées par l'organisation
 * et l'entité du partage (aucune donnée hors cible).
 */
export async function describeTarget(share: ResolvedShare): Promise<TargetInfo | null> {
  const db = createAdminClient();
  const [{ data: sender }, { data: project }] = await Promise.all([
    share.sentBy
      ? db.from("collaborators").select("first_name, last_name").eq("id", share.sentBy).eq("organization_id", share.organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("projects").select("designation").eq("id", share.projectId).eq("organization_id", share.organizationId).maybeSingle(),
  ]);
  const base = {
    sender: sender ? { firstName: sender.first_name, lastName: sender.last_name } : null,
    projectName: project?.designation ?? null,
  };
  if (share.kind === "document") {
    const { data: doc } = await db.from("documents").select("name, ref_int").eq("id", share.documentId!)
      .eq("project_id", share.projectId).is("deleted_at", null).maybeSingle();
    if (!doc) return null;
    return { type: "document", name: doc.name, reference: doc.ref_int, responseState: null, ...base };
  }
  const responseId = targetResponseId(share);
  if (share.responseId || responseId) {
    const { data: r } = await db.from("form_responses").select("reference, state, form_id").eq("id", responseId!)
      .eq("project_id", share.projectId).is("deleted_at", null).maybeSingle();
    if (!r) return null;
    const { data: form } = await db.from("forms").select("name").eq("id", r.form_id).eq("project_id", share.projectId).maybeSingle();
    return { type: share.responseId ? "response" : "form", name: form?.name ?? "", reference: r.reference, responseState: r.state, ...base };
  }
  const { data: form } = await db.from("forms").select("name, reference, index_label").eq("id", share.formId!)
    .eq("project_id", share.projectId).is("deleted_at", null).maybeSingle();
  if (!form) return null;
  return {
    type: "form", name: form.name, reference: [form.reference, form.index_label].filter(Boolean).join(" ") || null, responseState: null, ...base,
  };
}
