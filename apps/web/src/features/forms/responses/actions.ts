"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { buildDynamicContext } from "../server/dynamic-context";
import { ensureVersion } from "../server/structure";

const pad = (n: number) => String(n).padStart(2, "0");
function today(locale: string) {
  const d = new Date();
  return locale === "en" ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}` : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
const join = (parts: (string | null | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join(" - ");

export type ReplyContext = {
  projectId: string;
  formId: string;
  blockLinkId?: string | null;
};

/** Référence par défaut d'une nouvelle réponse (spec 03 §6.2) + réponses en cours reprenables. */
export async function getReplyDefaults(input: ReplyContext, locale = "fr"): Promise<ActionResult<{
  reference: string; formName: string; enabled: boolean; uniqueBlocked: boolean;
  inProgress: { id: string; reference: string; created_at: string }[];
}>> {
  const auth = await authorize("FormResponse", "read", input.projectId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: form } = await supabase.from("forms").select("id, name, reference, index_label, enabled, project_id")
    .eq("id", input.formId).maybeSingle();
  if (!form || form.project_id !== input.projectId) return fail("not_found");

  let link: { id: string; enabled: boolean; unique_response: boolean; flow_id: string; step_id: string; technical_object_id: string | null } | null = null;
  if (input.blockLinkId) {
    const { data } = await supabase.from("form_block_links")
      .select("id, enabled, unique_response, flow_id, step_id, technical_object_id").eq("id", input.blockLinkId).maybeSingle();
    link = data;
  }
  let q = supabase.from("form_responses").select("id, reference, state, created_at", { count: "exact" })
    .eq("form_id", form.id).is("deleted_at", null);
  q = link ? q.eq("block_link_id", link.id) : q.eq("context", "project").eq("project_id", input.projectId);
  const { data: responses, count } = await q.order("created_at", { ascending: false });
  const n = (count ?? 0) + 1;

  let reference: string;
  if (link) {
    const [{ data: flow }, { data: step }, { data: obj }] = await Promise.all([
      supabase.from("flows").select("ref_int").eq("id", link.flow_id).maybeSingle(),
      supabase.from("steps").select("position, custom_number, phase:phases(position, custom_number)").eq("id", link.step_id).maybeSingle(),
      link.technical_object_id
        ? supabase.from("technical_objects").select("name").eq("id", link.technical_object_id).maybeSingle()
        : Promise.resolve({ data: null as { name: string } | null }),
    ]);
    const phase = step?.phase as { position: number; custom_number: string | null } | null;
    reference = `${join([form.reference, form.index_label, obj?.name, flow?.ref_int,
      `P${phase?.custom_number ?? phase?.position ?? ""}`, `E${step?.custom_number ?? step?.position ?? ""}`, today(locale)])} R${n}`;
  } else {
    reference = `${join([form.reference, form.index_label, today(locale)])} - R${n}`;
  }
  return ok({
    reference,
    formName: form.name,
    enabled: form.enabled && (link ? link.enabled : true),
    uniqueBlocked: !!link?.unique_response && (count ?? 0) > 0,
    inProgress: (responses ?? []).filter((r) => r.state === "in_progress").map(({ id, reference, created_at }) => ({ id, reference, created_at })),
  });
}

const createSchema = z.object({
  projectId: z.uuid(),
  formId: z.uuid(),
  blockLinkId: z.uuid().nullable().optional(),
  reference: z.string().trim().min(3).max(255),
});

/**
 * Crée une réponse (contexte projet ou flow) : snapshot de version, résolution des variables dynamiques,
 * événement de création. Renvoie l'URL de la page de réponse.
 */
export async function createResponse(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string; url: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const { projectId, formId, blockLinkId, reference } = parsed.data;
  const auth = await authorize("FormResponse", "add", projectId);
  if ("error" in auth) return fail(auth.error);
  const { collaborator } = auth.session;
  const supabase = await createClient();

  const { data: form } = await supabase.from("forms")
    .select("id, project_id, lineage_id, enabled, deleted_at, reference, index_label, additional_comment, organization_id, account_id")
    .eq("id", formId).maybeSingle();
  if (!form || form.project_id !== projectId || form.deleted_at) return fail("not_found");
  if (!form.enabled) return fail("disabled");

  let link: { id: string; enabled: boolean; unique_response: boolean; flow_id: string; step_id: string; pinned_version_id: string | null } | null = null;
  let phaseId: string | null = null;
  if (blockLinkId) {
    const { data } = await supabase.from("form_block_links")
      .select("id, enabled, unique_response, flow_id, step_id, pinned_version_id, form_id").eq("id", blockLinkId).maybeSingle();
    if (!data || data.form_id !== formId) return fail("not_found");
    if (!data.enabled) return fail("disabled");
    if (data.unique_response) {
      const { count } = await supabase.from("form_responses").select("id", { count: "exact", head: true })
        .eq("block_link_id", data.id).is("deleted_at", null);
      if (count) return fail("unique_response");
    }
    link = data;
    const { data: step } = await supabase.from("steps").select("phase_id").eq("id", data.step_id).maybeSingle();
    phaseId = step?.phase_id ?? null;
  }

  const version = link?.pinned_version_id
    ? (await supabase.from("form_versions").select("id, version_no, structure_rev, structure, form_id").eq("id", link.pinned_version_id).maybeSingle()).data
    : await ensureVersion(supabase, formId, collaborator.id);
  if (!version) return fail("version");

  const dynamic_context = await buildDynamicContext(supabase, {
    projectId, flowId: link?.flow_id, phaseId, stepId: link?.step_id, form, reference, collaborator,
  });

  const { data: project } = await supabase.from("projects").select("organization_id, account_id").eq("id", projectId).single();
  const { data, error } = await supabase.from("form_responses").insert({
    organization_id: project?.organization_id ?? collaborator.organization_id,
    account_id: project?.account_id ?? collaborator.account_id,
    project_id: projectId, form_id: formId, form_version_id: version.id, form_lineage_id: form.lineage_id,
    form_index_label: form.index_label, form_reference: form.reference,
    context: link ? "flow" : "project", block_link_id: link?.id ?? null,
    flow_id: link?.flow_id ?? null, phase_id: phaseId, step_id: link?.step_id ?? null,
    reference, provenance: "webapp", dynamic_context: dynamic_context as Json,
    created_by: collaborator.id, updated_by: collaborator.id,
  }).select("id").single();
  if (error || !data) return fail(dbError(error));

  await supabase.from("form_response_events").insert({
    response_id: data.id, action: "created", actor_id: collaborator.id, provenance: "webapp", payload: { reference },
  });
  revalidatePath(`/explore/projects/${projectId}/dashboard/fields-feedback`);
  return ok({ id: data.id, url: `/explore/projects/${projectId}/responses/${data.id}` });
}

async function loadResponse(responseId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("form_responses").select("id, project_id, state, reference, block_link_id, form_id")
    .eq("id", responseId).is("deleted_at", null).maybeSingle();
  return { supabase, response: data };
}

/** « Revenir à l'état En cours » (spec 03 §6.8). */
export async function setResponseInProgress(responseId: string): Promise<ActionResult> {
  const { supabase, response } = await loadResponse(responseId);
  if (!response) return fail("not_found");
  const auth = await authorize("FormResponse", "edit", response.project_id);
  if ("error" in auth) return fail(auth.error);
  if (response.state === "in_progress") return ok(undefined);
  const { error } = await supabase.from("form_responses")
    .update({ state: "in_progress", done_at: null, done_by: null, updated_by: auth.session.collaborator.id }).eq("id", responseId);
  if (error) return fail(dbError(error));
  await supabase.from("form_response_events").insert({
    response_id: responseId, action: "state_changed", actor_id: auth.session.collaborator.id, provenance: "webapp", payload: { state: "in_progress" },
  });
  revalidatePath(`/explore/projects/${response.project_id}`, "layout");
  return ok(undefined);
}

/** Corbeille (soft delete, 30 j). */
export async function deleteResponse(responseId: string): Promise<ActionResult> {
  const { supabase, response } = await loadResponse(responseId);
  if (!response) return fail("not_found");
  const auth = await authorize("FormResponse", "delete", response.project_id);
  if ("error" in auth) return fail(auth.error);
  const { error } = await supabase.from("form_responses")
    .update({ deleted_at: new Date().toISOString(), deleted_by: auth.session.collaborator.id }).eq("id", responseId);
  if (error) return fail(dbError(error));
  await supabase.from("form_response_events").insert({
    response_id: responseId, action: "deleted", actor_id: auth.session.collaborator.id, provenance: "webapp",
  });
  revalidatePath(`/explore/projects/${response.project_id}`, "layout");
  return ok(undefined);
}

export async function updateResponseReference(responseId: string, reference: string): Promise<ActionResult> {
  const ref = reference.trim();
  if (ref.length < 3) return fail("reference_too_short");
  const { supabase, response } = await loadResponse(responseId);
  if (!response) return fail("not_found");
  const auth = await authorize("FormResponse", "editRef", response.project_id);
  if ("error" in auth) return fail(auth.error);
  const { error } = await supabase.from("form_responses").update({ reference: ref, updated_by: auth.session.collaborator.id }).eq("id", responseId);
  if (error) return fail(dbError(error));
  await supabase.from("form_response_events").insert({
    response_id: responseId, action: "updated", actor_id: auth.session.collaborator.id, provenance: "webapp", payload: { reference: ref },
  });
  revalidatePath(`/explore/projects/${response.project_id}`, "layout");
  return ok(undefined);
}

export async function updateResponseStatus(responseId: string, statusId: string, comment?: string): Promise<ActionResult> {
  const { supabase, response } = await loadResponse(responseId);
  if (!response) return fail("not_found");
  const auth = await authorize("FormResponse", "editStatus", response.project_id);
  if ("error" in auth) return fail(auth.error);
  const { error } = await supabase.from("form_responses").update({ custom_status_id: statusId, updated_by: auth.session.collaborator.id }).eq("id", responseId);
  if (error) return fail(dbError(error));
  await supabase.from("form_response_events").insert({
    response_id: responseId, action: "status_changed", actor_id: auth.session.collaborator.id, provenance: "webapp",
    payload: { status_id: statusId, comment: comment ?? null },
  });
  revalidatePath(`/explore/projects/${response.project_id}`, "layout");
  return ok(undefined);
}

/** Dupliquer une réponse (mêmes valeurs, nouvelle référence, état En cours) ; refusé si réponse unique. */
export async function duplicateResponse(responseId: string): Promise<ActionResult<{ id: string }>> {
  const { supabase } = await loadResponse(responseId);
  const { data: src } = await supabase.from("form_responses").select("*").eq("id", responseId).is("deleted_at", null).maybeSingle();
  if (!src) return fail("not_found");
  const auth = await authorize("FormResponse", "add", src.project_id);
  if ("error" in auth) return fail(auth.error);
  if (src.block_link_id) {
    const { data: link } = await supabase.from("form_block_links").select("unique_response").eq("id", src.block_link_id).maybeSingle();
    if (link?.unique_response) return fail("unique_response");
  }
  const me = auth.session.collaborator.id;
  const { id, created_at, updated_at, done_at, done_by, deleted_at, deleted_by, ...rest } = src;
  void id; void created_at; void updated_at; void done_at; void done_by; void deleted_at; void deleted_by;
  const { data: copy, error } = await supabase.from("form_responses").insert({
    ...rest, reference: `${src.reference} (2)`.slice(0, 255), state: "in_progress", created_by: me, updated_by: me,
  }).select("id").single();
  if (error || !copy) return fail(dbError(error));
  const [{ data: values }, { data: items }] = await Promise.all([
    supabase.from("form_response_values").select("*").eq("response_id", responseId),
    supabase.from("form_response_dynamic_items").select("*").eq("response_id", responseId),
  ]);
  if (items?.length) {
    await supabase.from("form_response_dynamic_items").insert(items.map(({ id: _i, response_id: _r, ...it }) => { void _i; void _r; return { ...it, response_id: copy.id }; }));
  }
  if (values?.length) {
    await supabase.from("form_response_values").insert(values.map(({ id: _i, response_id: _r, locked: _l, locked_at: _la, locked_by: _lb, ...v }) => {
      void _i; void _r; void _l; void _la; void _lb;
      return { ...v, response_id: copy.id, updated_by: me, updated_at: new Date().toISOString() };
    }));
  }
  await supabase.from("form_response_events").insert({
    response_id: copy.id, action: "created", actor_id: me, provenance: "webapp", payload: { duplicated_from: responseId },
  });
  revalidatePath(`/explore/projects/${src.project_id}`, "layout");
  return ok({ id: copy.id });
}
