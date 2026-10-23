"use server";

import { z } from "zod";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateToken, hashToken } from "./crypto";
import { shareSecret } from "./server/access";
import { appBaseUrl, sendShareLinkEmail, shareLink } from "./server/mailer";
import type { FormDefinition } from "@/features/forms/types";

/** Cible d'un partage depuis l'application interne. */
export type ShareTarget =
  | { kind: "form"; formId: string }
  | { kind: "response"; responseId: string }
  | { kind: "document"; documentId: string };

export type ShareStatus = "pending" | "responded" | "blocked" | "expired";

export type ShareRow = {
  id: string;
  email: string;
  name: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  status: ShareStatus;
  language: string;
};

export type ShareTargetInfo = {
  type: ShareTarget["kind"];
  projectId: string;
  name: string;
  reference: string | null;
  canShare: boolean;
  /** Raison bloquant tout nouveau partage (réponse terminée, aucune question partagée, pas de PDF…). */
  blocker: "response_done" | "no_shared_question" | "disabled" | "no_pdf" | null;
};

const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("form"), formId: z.uuid() }),
  z.object({ kind: z.literal("response"), responseId: z.uuid() }),
  z.object({ kind: z.literal("document"), documentId: z.uuid() }),
]);

const ROUTE: Record<ShareTarget["kind"], string> = { form: "DashboardForms", response: "FormResponse", document: "DashboardDocuments" };

type Resolved = {
  info: Omit<ShareTargetInfo, "canShare">;
  organizationId: string;
  formId: string | null;
  responseId: string | null;
  documentId: string | null;
};

function hasSharedQuestion(def: FormDefinition | null): boolean {
  return !!def?.rubrics?.some((r) => r.questions.some((q) => q.shared));
}

/** Résout la cible avec le client de l'utilisateur (RLS : lecture de l'entité requise). */
async function resolveTarget(target: ShareTarget): Promise<Resolved | null> {
  const supabase = await createClient();
  if (target.kind === "form") {
    const { data: form } = await supabase.from("forms").select("id, name, reference, index_label, project_id, organization_id, enabled, location, deleted_at")
      .eq("id", target.formId).maybeSingle();
    if (!form || form.location !== "project" || !form.project_id || form.deleted_at) return null;
    const { count } = await supabase.from("form_questions").select("id", { count: "exact", head: true }).eq("form_id", form.id).eq("shared", true);
    return {
      info: {
        type: "form", projectId: form.project_id, name: form.name, reference: [form.reference, form.index_label].filter(Boolean).join(" ") || null,
        blocker: !form.enabled ? "disabled" : !count ? "no_shared_question" : null,
      },
      organizationId: form.organization_id, formId: form.id, responseId: null, documentId: null,
    };
  }
  if (target.kind === "response") {
    const { data: r } = await supabase.from("form_responses").select("id, reference, state, project_id, organization_id, form_id, form_version_id")
      .eq("id", target.responseId).is("deleted_at", null).maybeSingle();
    if (!r) return null;
    const [{ data: form }, { data: version }] = await Promise.all([
      supabase.from("forms").select("name").eq("id", r.form_id).maybeSingle(),
      supabase.from("form_versions").select("structure").eq("id", r.form_version_id).maybeSingle(),
    ]);
    return {
      info: {
        type: "response", projectId: r.project_id, name: form?.name ?? "", reference: r.reference,
        blocker: r.state === "done" ? "response_done" : !hasSharedQuestion((version?.structure ?? null) as FormDefinition | null) ? "no_shared_question" : null,
      },
      organizationId: r.organization_id, formId: r.form_id, responseId: r.id, documentId: null,
    };
  }
  const { data: doc } = await supabase.from("documents").select("id, name, ref_int, project_id, organization_id, scope, deleted_at")
    .eq("id", target.documentId).maybeSingle();
  if (!doc || doc.scope !== "project" || !doc.project_id || doc.deleted_at) return null;
  const [{ count: pdfs }, { count: files }] = await Promise.all([
    supabase.from("document_versions").select("id", { count: "exact", head: true }).eq("document_id", doc.id).not("pdf_path", "is", null),
    supabase.from("document_files").select("id", { count: "exact", head: true }).eq("document_id", doc.id),
  ]);
  return {
    info: { type: "document", projectId: doc.project_id, name: doc.name, reference: doc.ref_int, blocker: !pdfs && !files ? "no_pdf" : null },
    organizationId: doc.organization_id, formId: null, responseId: null, documentId: doc.id,
  };
}

type ShareDbRow = {
  id: string; email: string; sent_at: string | null; responded_at?: string | null; downloaded_at?: string | null;
  blocked: boolean; expires_at: string; language: string; contributor: unknown;
};
const toRow = (r: ShareDbRow): ShareRow => {
  const c = r.contributor as { firstName?: string; lastName?: string } | null;
  const responded = r.responded_at ?? r.downloaded_at ?? null;
  return {
    id: r.id, email: r.email, name: c?.firstName ? `${c.firstName} ${c.lastName ?? ""}`.trim() : null,
    sentAt: r.sent_at, respondedAt: responded, language: r.language,
    status: r.blocked ? "blocked" : responded ? "responded" : new Date(r.expires_at).getTime() <= Date.now() ? "expired" : "pending",
  };
};

/** Informations de la cible + historique « Personnes ayant accès » (partages non révoqués). */
export async function listShares(input: ShareTarget): Promise<ActionResult<{ info: ShareTargetInfo; items: ShareRow[] }>> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const target = parsed.data;
  const resolved = await resolveTarget(target);
  if (!resolved) return fail("not_found");
  const read = await authorize(ROUTE[target.kind], "read", resolved.info.projectId);
  if ("error" in read) return fail(read.error);
  const share = await authorize(ROUTE[target.kind], "share", resolved.info.projectId);
  const supabase = await createClient();
  let items: ShareRow[] = [];
  if (target.kind === "document") {
    const { data } = await supabase.from("document_shares")
      .select("id, email, sent_at, downloaded_at, blocked, expires_at, language, contributor")
      .eq("document_id", target.documentId).is("revoked_at", null).order("created_at", { ascending: false });
    items = (data ?? []).map(toRow);
  } else {
    let q = supabase.from("form_shares").select("id, email, sent_at, responded_at, blocked, expires_at, language, contributor").is("revoked_at", null);
    q = target.kind === "form" ? q.eq("form_id", target.formId).is("response_id", null) : q.eq("response_id", target.responseId);
    const { data } = await q.order("created_at", { ascending: false });
    items = (data ?? []).map(toRow);
  }
  return ok({ info: { ...resolved.info, canShare: !("error" in share) }, items });
}

const createSchema = z.object({
  emails: z.array(z.email().max(320)).min(1).max(20),
  comment: z.string().trim().max(1000).optional().nullable(),
  language: z.enum(["fr", "en"]),
});

export type CreateSharesResult = { sent: string[]; failed: { email: string; error: string }[] };

/** Partager (spec 03 §9.1, spec 04 §5.8) : un lien personnel par e-mail. */
export async function createShares(input: ShareTarget, form: z.input<typeof createSchema>): Promise<ActionResult<CreateSharesResult>> {
  const parsedTarget = targetSchema.safeParse(input);
  const parsed = createSchema.safeParse({ ...form, emails: (form.emails ?? []).map((e) => e.trim().toLowerCase()) });
  if (!parsedTarget.success || !parsed.success) return fail("invalid");
  const target = parsedTarget.data;
  const resolved = await resolveTarget(target);
  if (!resolved) return fail("not_found");
  const auth = await authorize(ROUTE[target.kind], "share", resolved.info.projectId);
  if ("error" in auth) return fail(auth.error);
  if (resolved.info.blocker) return fail(resolved.info.blocker);
  const { collaborator, organization } = auth.session;
  if (resolved.organizationId !== organization.id) return fail("forbidden");

  const supabase = await createClient();
  const admin = createAdminClient();
  const emails = [...new Set(parsed.data.emails)];
  const comment = parsed.data.comment?.trim() || null;
  const days = organization.link_expiration_days ?? 30;
  const base = await appBaseUrl();
  const sender = `${collaborator.first_name} ${collaborator.last_name}`;
  const result: CreateSharesResult = { sent: [], failed: [] };

  // Adresses d'utilisateurs inactifs / bloqués refusées (spec 03 §9.1).
  const [{ data: inactiveCollabs }, { data: inactiveExt }] = await Promise.all([
    admin.from("collaborators").select("email").eq("organization_id", organization.id).neq("status", "active").in("email", emails),
    admin.from("external_users").select("email").eq("organization_id", organization.id).neq("status", "active").in("email", emails),
  ]);
  const inactive = new Set([...(inactiveCollabs ?? []), ...(inactiveExt ?? [])].map((r) => (r.email ?? "").toLowerCase()));

  for (const email of emails) {
    if (inactive.has(email)) { result.failed.push({ email, error: "inactive_email" }); continue; }
    // Un seul partage actif par e-mail et par cible ; un partage expiré est remplacé.
    const like = email.replace(/[\\%_]/g, "\\$&");
    const { data: prev } = target.kind === "document"
      ? await admin.from("document_shares").select("id, expires_at").ilike("email", like).is("revoked_at", null).eq("document_id", resolved.documentId!).maybeSingle()
      : target.kind === "response"
        ? await admin.from("form_shares").select("id, expires_at").ilike("email", like).is("revoked_at", null).eq("response_id", resolved.responseId!).maybeSingle()
        : await admin.from("form_shares").select("id, expires_at").ilike("email", like).is("revoked_at", null).eq("form_id", resolved.formId!).is("response_id", null).maybeSingle();
    if (prev) {
      if (new Date(prev.expires_at).getTime() > Date.now()) { result.failed.push({ email, error: "already_shared" }); continue; }
      const revoked = { revoked_at: new Date().toISOString() };
      if (target.kind === "document") await supabase.from("document_shares").update(revoked).eq("id", prev.id);
      else await supabase.from("form_shares").update(revoked).eq("id", prev.id);
    }
    const token = generateToken();
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    const common = {
      organization_id: organization.id, project_id: resolved.info.projectId, email, language: parsed.data.language, comment,
      token_hash: hashToken(token, shareSecret()), expires_at: expiresAt, sent_at: new Date().toISOString(), sent_by: collaborator.id,
    };
    const { error } = target.kind === "document"
      ? await supabase.from("document_shares").insert({ ...common, document_id: resolved.documentId! })
      : await supabase.from("form_shares").insert({ ...common, form_id: resolved.formId, response_id: resolved.responseId });
    if (error) { result.failed.push({ email, error: dbError(error) === "duplicate" ? "already_shared" : dbError(error) }); continue; }
    const sent = await sendShareLinkEmail({
      organizationId: organization.id, to: email, language: parsed.data.language, type: target.kind, targetName: resolved.info.name,
      reference: resolved.info.reference, sender, comment, link: shareLink(base, token), expiresAt,
    });
    if (!sent.ok) result.failed.push({ email, error: "email_failed" });
    else result.sent.push(email);
  }
  if (target.kind !== "document" && result.sent.length && resolved.responseId) {
    await supabase.from("form_response_events").insert({
      response_id: resolved.responseId, action: "shared", actor_id: collaborator.id, provenance: "webapp", payload: { emails: result.sent },
    });
  }
  return ok(result);
}

const idSchema = z.object({ kind: z.enum(["form", "document"]), id: z.uuid() });

async function loadOwnShare(kind: "form" | "document", id: string) {
  const supabase = await createClient();
  const { data } = kind === "form"
    ? await supabase.from("form_shares").select("id, project_id, organization_id, email, language, comment, form_id, response_id, revoked_at, responded_at, expires_at").eq("id", id).maybeSingle()
    : await supabase.from("document_shares").select("id, project_id, organization_id, email, language, comment, document_id, revoked_at, expires_at").eq("id", id).maybeSingle();
  return { supabase, share: data as (typeof data & { form_id?: string | null; response_id?: string | null; document_id?: string; responded_at?: string | null }) | null };
}

/** Renvoyer : nouveau lien (l'ancien n'est plus valable), nouvelle échéance, déblocage. */
export async function resendShare(input: { kind: "form" | "document"; id: string }): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { supabase, share } = await loadOwnShare(parsed.data.kind, parsed.data.id);
  if (!share || share.revoked_at) return fail("not_found");
  const target: ShareTarget = parsed.data.kind === "document" ? { kind: "document", documentId: share.document_id! }
    : share.response_id ? { kind: "response", responseId: share.response_id } : { kind: "form", formId: share.form_id! };
  const resolved = await resolveTarget(target);
  if (!resolved) return fail("not_found");
  const auth = await authorize(ROUTE[target.kind], "share", share.project_id);
  if ("error" in auth) return fail(auth.error);
  if (target.kind === "response" && resolved.info.blocker === "response_done") return fail("response_done");
  const { collaborator, organization } = auth.session;
  const token = generateToken();
  const expiresAt = new Date(Date.now() + (organization.link_expiration_days ?? 30) * 86_400_000).toISOString();
  const patch = {
    token_hash: hashToken(token, shareSecret()), expires_at: expiresAt, sent_at: new Date().toISOString(), sent_by: collaborator.id,
    blocked: false, code_attempts: 0, code_hash: null, code_expires_at: null, code_sent_at: null,
  };
  const { error } = parsed.data.kind === "form"
    ? await supabase.from("form_shares").update(patch).eq("id", share.id)
    : await supabase.from("document_shares").update(patch).eq("id", share.id);
  if (error) return fail(dbError(error));
  const sent = await sendShareLinkEmail({
    organizationId: organization.id, to: share.email, language: share.language === "fr" ? "fr" : "en", type: target.kind,
    targetName: resolved.info.name, reference: resolved.info.reference, sender: `${collaborator.first_name} ${collaborator.last_name}`,
    comment: share.comment, link: shareLink(await appBaseUrl(), token), expiresAt,
  });
  return sent.ok ? ok(undefined) : fail("email_failed");
}

/** Supprimer un partage : le lien n'est plus valable. */
export async function revokeShare(input: { kind: "form" | "document"; id: string }): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { supabase, share } = await loadOwnShare(parsed.data.kind, parsed.data.id);
  if (!share) return fail("not_found");
  const route = parsed.data.kind === "document" ? "DashboardDocuments" : share.response_id ? "FormResponse" : "DashboardForms";
  const auth = await authorize(route, "share", share.project_id);
  if ("error" in auth) return fail(auth.error);
  const now = new Date().toISOString();
  const { error } = parsed.data.kind === "form"
    ? await supabase.from("form_shares").update({ revoked_at: now }).eq("id", share.id)
    : await supabase.from("document_shares").update({ revoked_at: now }).eq("id", share.id);
  if (error) return fail(dbError(error));
  return ok(undefined);
}
