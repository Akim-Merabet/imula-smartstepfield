"use server";

/**
 * Actions du parcours externe (sans compte). Chaque action résout le partage par son jeton,
 * vérifie l'état du partage et la session (cookie signé lié au partage), puis agit avec le
 * client service, strictement filtré sur la cible du partage.
 */
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { buildModel } from "@/features/forms/response/engine/model";
import type { ActiveRedirect, CheckResult } from "@/features/forms/types";
import { CODE_RESEND_COOLDOWN_MS, CODE_TTL_MS, MAX_CODE_ATTEMPTS, checkCode, generateCode, hashCode, isTokenFormat } from "./crypto";
import {
  openShareSession, requireShareSession, resolveShareAccess, shareSecret, shareTable, type Contributor, type ResolvedShare,
} from "./server/access";
import { nextStep, shareBase } from "./server/guard";
import { sendShareCodeEmail } from "./server/mailer";
import {
  applyContributorToResponse, createContribution, loadShareResponse, saveSharedRubric, sendSharedResponse, type ShareSaveCell,
} from "./server/response";
import { describeTarget } from "./server/target";

const base = shareBase;

/** « Commencer / Compléter ma réponse » / « Renvoyer le code » : envoi d'un code secret par e-mail. */
export async function requestShareCode(token: string): Promise<ActionResult<{ cooldownMs: number }>> {
  if (!isTokenFormat(token)) return fail("not_found");
  const access = await resolveShareAccess(token);
  if (!access.ok) return fail(access.reason);
  const { share } = access;
  const since = share.codeSentAt ? Date.now() - new Date(share.codeSentAt).getTime() : Infinity;
  if (since < CODE_RESEND_COOLDOWN_MS) return fail("cooldown", { cooldownMs: CODE_RESEND_COOLDOWN_MS - since });
  const target = await describeTarget(share);
  if (!target) return fail("not_found");
  const code = generateCode();
  const db = createAdminClient();
  const patch = {
    code_hash: hashCode(code, share.id, shareSecret()), code_expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    code_sent_at: new Date().toISOString(),
  };
  const { error } = share.kind === "form"
    ? await db.from("form_shares").update(patch).eq("id", share.id).eq("token_hash", share.tokenHash).is("revoked_at", null)
    : await db.from("document_shares").update(patch).eq("id", share.id).eq("token_hash", share.tokenHash).is("revoked_at", null);
  if (error) return fail("unknown");
  const sent = await sendShareCodeEmail({ organizationId: share.organizationId, to: share.email, language: share.language, targetName: target.name, code });
  if (!sent.ok) return fail("email_failed");
  return ok({ cooldownMs: CODE_RESEND_COOLDOWN_MS });
}

/** Saisie du code secret : ouvre la session de partage (cookie httpOnly signé). */
export async function verifyShareCode(token: string, code: string): Promise<ActionResult<{ next: string }>> {
  if (!isTokenFormat(token)) return fail("not_found");
  const access = await resolveShareAccess(token);
  if (!access.ok) return fail(access.reason);
  const { share } = access;
  const db = createAdminClient();
  // Réservation atomique d'un essai (compté avant la comparaison).
  const { data: attempts } = await db.rpc("share_code_attempt", { p_kind: share.kind, p_id: share.id, p_max: MAX_CODE_ATTEMPTS });
  if (attempts === null || attempts === undefined) return fail("blocked");
  const res = checkCode({
    code: String(code ?? "").trim(), shareId: share.id, secret: shareSecret(), codeHash: share.codeHash, codeExpiresAt: share.codeExpiresAt,
    attempts: attempts - 1, blocked: false,
  });
  if (!res.ok) {
    return fail(res.blocked ? "blocked" : res.reason === "expired" ? "code_expired" : res.reason === "no_code" ? "no_code" : "invalid_code",
      { remaining: Math.max(0, MAX_CODE_ATTEMPTS - res.attempts) });
  }
  // Code à usage unique.
  const patch = { code_hash: null, code_expires_at: null, code_attempts: 0, blocked: false, last_access_at: new Date().toISOString() };
  if (share.kind === "form") await db.from("form_shares").update(patch).eq("id", share.id);
  else await db.from("document_shares").update(patch).eq("id", share.id);
  await openShareSession(share);
  return ok({ next: nextStep(token, share) });
}

const contributorSchema = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  company: z.string().trim().min(1).max(255),
  job: z.string().trim().min(1).max(255),
});

/** Informations contributeur → utilisateur externe (spec 01 §4.7) + variables @@externalCollaborator*. */
export async function saveContributor(token: string, input: z.input<typeof contributorSchema>): Promise<ActionResult<{ next: string }>> {
  const auth = await requireShareSession(token);
  if (!auth.ok) return fail(auth.error);
  const { share } = auth;
  const parsed = contributorSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const email = share.email.trim().toLowerCase();
  const contributor: Contributor = { ...parsed.data, email };
  const db = createAdminClient();

  const { data: existing } = await db.from("external_users").select("id, status")
    .eq("organization_id", share.organizationId).ilike("email", email.replace(/[\\%_]/g, "\\$&")).maybeSingle();
  if (existing && existing.status !== "active") return fail("blocked");
  let externalUserId = existing?.id ?? null;
  const fields = { first_name: contributor.firstName, last_name: contributor.lastName, company_name: contributor.company, profession: contributor.job };
  if (existing) {
    await db.from("external_users").update(fields).eq("id", existing.id).eq("organization_id", share.organizationId);
  } else {
    const { data: created, error } = await db.from("external_users")
      .insert({ organization_id: share.organizationId, email, status: "active", ...fields }).select("id").single();
    if (error || !created) return fail("unknown");
    externalUserId = created.id;
  }
  const patch = { contributor: contributor as unknown as Json, external_user_id: externalUserId };
  if (share.kind === "form") await db.from("form_shares").update(patch).eq("id", share.id);
  else await db.from("document_shares").update(patch).eq("id", share.id);

  const updated: ResolvedShare = { ...share, contributor, externalUserId };
  if (share.kind === "form") {
    if (share.responseId) await applyContributorToResponse(updated, contributor);
    else if (!share.contributionResponseId) {
      const id = await createContribution(updated, contributor);
      if (!id) return fail("not_found");
    }
  }
  return ok({ next: nextStep(token, updated) });
}

// ---------------------------------------------------------------------------------------------
// Moteur de réponse en mode partagé
// ---------------------------------------------------------------------------------------------

async function shareResponse(token: string) {
  const auth = await requireShareSession(token, { kind: "form", contributor: true });
  if (!auth.ok) return { error: auth.error } as const;
  if (auth.share.respondedAt) return { error: "already_sent" } as const;
  const data = await loadShareResponse(auth.share);
  if (!data) return { error: "not_found" } as const;
  return { share: auth.share, data } as const;
}

export async function shareSaveRubric(token: string, input: {
  rubricLineageId: string; cells: ShareSaveCell[]; observations: Record<string, string | null>;
  activeRedirect: ActiveRedirect | null; lastRubricLineageId?: string | null;
}): Promise<ActionResult<{ changed: number; values: Record<string, unknown> }>> {
  const ctx = await shareResponse(token);
  if ("error" in ctx) return fail(ctx.error!);
  const res = await saveSharedRubric(ctx.data, input);
  if (!res.ok) return fail(res.error, res.details);
  await createAdminClient().from(shareTable("form")).update({ last_access_at: new Date().toISOString() }).eq("id", ctx.share.id);
  return ok({ changed: res.changed, values: res.values });
}

export async function shareSetLastRubric(token: string, rubricLineageId: string): Promise<ActionResult> {
  const ctx = await shareResponse(token);
  if ("error" in ctx) return fail(ctx.error!);
  const model = buildModel(ctx.data.definition, ctx.data.items);
  if (!model.rubrics.some((r) => r.def.lineageId === rubricLineageId) || ctx.data.response.state === "done") return ok(undefined);
  await ctx.data.db.from("form_responses").update({ last_rubric_lineage_id: rubricLineageId }).eq("id", ctx.data.response.id);
  return ok(undefined);
}

/** « Envoyer la réponse ». */
export async function shareSendResponse(token: string): Promise<ActionResult<{ failed: CheckResult[]; next: string }>> {
  const ctx = await shareResponse(token);
  if ("error" in ctx) return fail(ctx.error!);
  const { failed } = await sendSharedResponse(ctx.data, ctx.share);
  return ok({ failed, next: `${base(token)}/finish` });
}

/** Ajout de ligne / colonne (tableaux autorisés, rubrique comportant une question partagée). */
export async function shareAddTableItem(token: string, rubricLineageId: string, axis: "row" | "column"): Promise<ActionResult> {
  const ctx = await shareResponse(token);
  if ("error" in ctx) return fail(ctx.error!);
  const { db, response, definition, items } = ctx.data;
  if (response.state === "done") return fail("response_done");
  const model = buildModel(definition, items);
  const rubric = model.rubrics.find((r) => r.def.lineageId === rubricLineageId);
  if (!rubric || rubric.def.type === "question" || !rubric.questions.some((q) => q.def.shared)) return fail("forbidden");
  if ((axis === "row" && !rubric.def.allowAddRow) || (axis === "column" && !rubric.def.allowAddColumn)) return fail("forbidden");
  const addQuestion = (rubric.def.type === "table_column") === (axis === "column");
  let pos = items.filter((i) => i.rubricLineageId === rubricLineageId).reduce((m, i) => Math.max(m, i.position), 0);
  const rows: { response_id: string; rubric_lineage_id: string; kind: string; parent_lineage_id: string | null; template_lineage_id: string; lineage_id: string; position: number; name: string | null }[] = [];
  if (addQuestion) {
    const tpl = rubric.questions[rubric.questions.length - 1];
    if (!tpl) return fail("invalid");
    const qLineage = crypto.randomUUID();
    rows.push({ response_id: response.id, rubric_lineage_id: rubricLineageId, kind: "question", parent_lineage_id: null,
      template_lineage_id: tpl.lineageId, lineage_id: qLineage, position: ++pos, name: `${tpl.def.name} ${rubric.questions.length + 1}` });
    for (const c of tpl.cells) {
      rows.push({ response_id: response.id, rubric_lineage_id: rubricLineageId, kind: "option", parent_lineage_id: qLineage,
        template_lineage_id: c.lineageId, lineage_id: crypto.randomUUID(), position: ++pos, name: null });
    }
  } else {
    for (const q of rubric.questions) {
      const last = q.cells[q.cells.length - 1];
      if (!last) continue;
      rows.push({ response_id: response.id, rubric_lineage_id: rubricLineageId, kind: "option", parent_lineage_id: q.lineageId,
        template_lineage_id: last.lineageId, lineage_id: crypto.randomUUID(), position: ++pos, name: null });
    }
  }
  const { error } = await db.from("form_response_dynamic_items").insert(rows);
  return error ? fail("unknown") : ok(undefined);
}
