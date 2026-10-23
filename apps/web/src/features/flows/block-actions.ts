"use server";

import { dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { expectedNatures, MULTI_PR_MAX_ITEMS, type SignatureNature } from "./meta";
import { dsiConfigSchema, signatureSchema, type DsiConfigInput, type SignatureInput } from "./schema";
import { applyTransition, authorizeBlock, revalidateFlow, type BulkBlockAction } from "./server-utils";

const MAX_HTML = 1_000_000;

// ===== En-tête commun : validation interne (R-BL-4/5) ===============================

export async function transitionBlock(blockId: string, action: BulkBlockAction, comment: string | null): Promise<ActionResult> {
  const auth = await authorizeBlock(blockId, "FlowBlockValidation", "edit");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: b } = await supabase.from("blocks").select("id, state, redactor_id, verifier_id, approver_id").eq("id", blockId).single();
  if (!b) return fail("not_found");
  const res = await applyTransition(supabase, auth.flow.id, b, action, auth.session.collaborator.id, comment?.trim() || null);
  if (res === "conflict") return fail("role_conflict", { state: b.state });
  if (res !== "ok") return fail(res === "invalid" ? "invalid_state" : "unknown");
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export async function updateBlockRefs(blockId: string, refs: { ref_int: string | null; ref_ext: string | null }): Promise<ActionResult> {
  const auth = await authorizeBlock(blockId, "FlowContent", "edit");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from("blocks").update({ ref_int: refs.ref_int?.trim() || null, ref_ext: refs.ref_ext?.trim() || null }).eq("id", blockId);
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

// ===== PR / TXT ===================================================================

export async function saveBlockContent(blockId: string, html: string, json: unknown): Promise<ActionResult> {
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  if (html.length > MAX_HTML) return fail("too_large");
  const supabase = await createClient();
  const { error } = await supabase.from("blocks").update({
    content_html: html, content_json: json as never, updated_by: auth.session.collaborator.id,
  }).eq("id", blockId);
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export async function setTxtVisibility(blockId: string, visibility: "mobile_app" | "document"): Promise<ActionResult> {
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from("blocks").update({ txt_visibility: visibility }).eq("id", blockId);
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

// ===== Éléments de liste (EMM / ADR / RHP / OBJECT) ===============================

type ItemTable = "block_emm_items" | "block_adr_items" | "block_rhp_items" | "block_object_items";

async function nextPosition(table: ItemTable | "block_multi_pr_items", blockId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from(table).select("position").eq("block_id", blockId).order("position", { ascending: false }).limit(1).maybeSingle();
  return (data?.position ?? 0) + 1;
}

async function blockOfItem(table: ItemTable | "block_multi_pr_items", itemId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from(table).select("block_id").eq("id", itemId).maybeSingle();
  return data?.block_id ?? null;
}

export async function setItemDisabled(table: Exclude<ItemTable, "block_object_items">, itemId: string, disabled: boolean): Promise<ActionResult> {
  const blockId = await blockOfItem(table, itemId);
  if (!blockId) return fail("not_found");
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ disabled }).eq("id", itemId);
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export async function deleteItem(table: ItemTable, itemId: string): Promise<ActionResult> {
  const blockId = await blockOfItem(table, itemId);
  if (!blockId) return fail("not_found");
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", itemId);
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

// EMM -------------------------------------------------------------------------------

export async function addEmmItems(blockId: string, equipmentIds: string[], opts: { quantity: number | null; unit: string | null; consumable: boolean | null }): Promise<ActionResult> {
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  if (!equipmentIds.length) return fail("no_selection");
  const supabase = await createClient();
  const { data: eqs } = await supabase.from("library_equipments")
    .select("id, name, family_id, reference, provider, quantity_unit, consumable").in("id", equipmentIds);
  let pos = await nextPosition("block_emm_items", blockId);
  const { error } = await supabase.from("block_emm_items").insert((eqs ?? []).map((e) => ({
    block_id: blockId, flow_id: auth.flow.id, library_equipment_id: e.id, name: e.name, family_id: e.family_id,
    reference: e.reference, provider: e.provider, quantity: opts.quantity, unit: opts.unit ?? e.quantity_unit,
    consumable: opts.consumable ?? e.consumable, position: pos++,
  })));
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export async function updateEmmItem(itemId: string, v: { quantity: number | null; unit: string | null; consumable: boolean; comment: string | null; display_comment: boolean }): Promise<ActionResult> {
  const blockId = await blockOfItem("block_emm_items", itemId);
  if (!blockId) return fail("not_found");
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  if (v.quantity !== null && (Number.isNaN(v.quantity) || v.quantity < 0)) return fail("invalid");
  const supabase = await createClient();
  const { data: item } = await supabase.from("block_emm_items").select("disabled").eq("id", itemId).single();
  if (item?.disabled) return fail("item_disabled");
  const { error } = await supabase.from("block_emm_items").update({
    quantity: v.quantity, unit: v.unit?.trim() || null, consumable: v.consumable, comment: v.comment?.trim() || null, display_comment: v.display_comment,
  }).eq("id", itemId);
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

// ADR -------------------------------------------------------------------------------

export async function addAdrItems(blockId: string, riskIds: string[]): Promise<ActionResult> {
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  if (!riskIds.length) return fail("no_selection");
  const supabase = await createClient();
  const { data: risks } = await supabase.from("library_risks").select("id, major").in("id", riskIds);
  let pos = await nextPosition("block_adr_items", blockId);
  const { error } = await supabase.from("block_adr_items").insert((risks ?? []).map((r) => ({
    block_id: blockId, flow_id: auth.flow.id, library_risk_id: r.id, major: r.major, position: pos++,
  })));
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export async function updateAdrItem(itemId: string, major: boolean): Promise<ActionResult> {
  const blockId = await blockOfItem("block_adr_items", itemId);
  if (!blockId) return fail("not_found");
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: item } = await supabase.from("block_adr_items").select("disabled").eq("id", itemId).single();
  if (item?.disabled) return fail("item_disabled");
  const { error } = await supabase.from("block_adr_items").update({ major }).eq("id", itemId);
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export async function saveSpecificParade(itemId: string, parade: { id?: string; name: string; pictogram: number | null }): Promise<ActionResult> {
  const blockId = await blockOfItem("block_adr_items", itemId);
  if (!blockId) return fail("not_found");
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  const name = parade.name.trim();
  if (!name || name.length > 255) return fail("invalid");
  const supabase = await createClient();
  const pictogram = parade.pictogram && parade.pictogram >= 1 && parade.pictogram <= 240 ? parade.pictogram : null;
  const { error } = parade.id
    ? await supabase.from("block_adr_specific_parades").update({ name, pictogram }).eq("id", parade.id).eq("block_adr_item_id", itemId)
    : await supabase.from("block_adr_specific_parades").insert({ block_adr_item_id: itemId, flow_id: auth.flow.id, name, pictogram });
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export async function deleteSpecificParade(paradeId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: p } = await supabase.from("block_adr_specific_parades").select("block_adr_item_id").eq("id", paradeId).maybeSingle();
  if (!p) return fail("not_found");
  const blockId = await blockOfItem("block_adr_items", p.block_adr_item_id);
  if (!blockId) return fail("not_found");
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  const { error } = await supabase.from("block_adr_specific_parades").delete().eq("id", paradeId);
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

// RHP -------------------------------------------------------------------------------

export async function saveRhpItem(blockId: string, item: { id?: string; function_family_id: string; count: number; observation: string | null; skill_ids: string[] }): Promise<ActionResult> {
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  if (!item.function_family_id || !Number.isInteger(item.count) || item.count < 1) return fail("invalid");
  const supabase = await createClient();
  let id = item.id;
  if (id) {
    const { data: cur } = await supabase.from("block_rhp_items").select("disabled").eq("id", id).single();
    if (cur?.disabled) return fail("item_disabled");
    const { error } = await supabase.from("block_rhp_items").update({
      function_family_id: item.function_family_id, count: item.count, observation: item.observation?.trim() || null,
    }).eq("id", id);
    if (error) return fail(dbError(error));
    await supabase.from("block_rhp_item_skills").delete().eq("item_id", id);
  } else {
    const { data, error } = await supabase.from("block_rhp_items").insert({
      block_id: blockId, flow_id: auth.flow.id, function_family_id: item.function_family_id, count: item.count,
      observation: item.observation?.trim() || null, position: await nextPosition("block_rhp_items", blockId),
    }).select("id").single();
    if (error || !data) return fail(dbError(error));
    id = data.id;
  }
  if (item.skill_ids.length) {
    await supabase.from("block_rhp_item_skills").insert([...new Set(item.skill_ids)].map((skill_family_id) => ({ item_id: id!, skill_family_id })));
  }
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

// ===== DSI : configuration (§5.7) ==================================================

export async function updateDsiConfig(blockId: string, input: DsiConfigInput): Promise<ActionResult> {
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  const parsed = dsiConfigSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const v = parsed.data;
  const supabase = await createClient();
  const [{ data: before }, { data: sigs }, { data: flow }] = await Promise.all([
    supabase.from("block_dsi_configs").select("*").eq("block_id", blockId).single(),
    supabase.from("signatures").select("nature").eq("block_id", blockId).eq("disabled", false),
    supabase.from("flows").select("*").eq("id", auth.flow.id).single(),
  ]);
  if (!before || !flow) return fail("not_found");
  const signed = new Set((sigs ?? []).map((s) => s.nature));
  if (v.signatories_status === "disabled" && signed.size) return fail("has_signatures");
  if (v.signatories_status === "disabled" && !v.signatory_disabled_comment) return fail("comment_required");
  // R-DSI-1 : impossible de désactiver un contrôle déjà renseigné.
  const removed = expectedNatures(before, flow).filter((n) => !expectedNatures({ ...before, ...v }, flow).includes(n));
  if (removed.some((n) => signed.has(n))) return fail("control_signed");
  const { error } = await supabase.from("block_dsi_configs").update(v).eq("block_id", blockId);
  if (error) return fail(dbError(error));
  // R-DSI-2 : désactivation d'un type de signature tracée.
  const me = auth.session.collaborator.id;
  if (removed.length) {
    await supabase.from("signature_events").insert(removed.map((nature) => ({
      block_id: blockId, flow_id: auth.flow.id, action: "deactivate_nature", nature, actor_id: me,
    })));
    await supabase.from("flow_events").insert(removed.map((nature) => ({
      flow_id: auth.flow.id, event_type: "deactivate_signature" as const, actor_id: me, step_id: auth.block.step_id, payload: { nature },
    })));
  }
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

// ===== Signatures (§6) ============================================================

export async function createSignature(input: SignatureInput): Promise<ActionResult> {
  const parsed = signatureSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const v = parsed.data;
  const auth = await authorizeBlock(v.block_id, "FlowSignatures", "add");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const me = auth.session.collaborator;
  if (auth.block.type !== "dsi" || !auth.block.enabled) return fail("no_dsi");
  const [{ data: step }, { data: config }, { data: flow }, { data: existing }] = await Promise.all([
    supabase.from("steps").select("id, disabled, phase:phases(disabled)").eq("id", auth.block.step_id).single(),
    supabase.from("block_dsi_configs").select("*").eq("block_id", v.block_id).single(),
    supabase.from("flows").select("*").eq("id", auth.flow.id).single(),
    supabase.from("signatures").select("id, nature, signatory_id").eq("step_id", auth.block.step_id).eq("disabled", false),
  ]);
  // R-SIG-1 : étape active et bloc Contrôle actif.
  if (!step || step.disabled || (step.phase as { disabled: boolean } | null)?.disabled) return fail("step_disabled");
  if (!config || !flow) return fail("not_found");
  if (!expectedNatures(config, flow).includes(v.nature as SignatureNature)) return fail("nature_not_available");
  if ((existing ?? []).some((s) => s.nature === v.nature)) return fail("already_signed");

  const signedAt = new Date(v.signed_at);
  if (Number.isNaN(signedAt.getTime())) return fail("invalid");
  let signatoryId: string | null = null;
  let contributor = v.contributor_type;
  if (v.mode === "proxy") {
    // Procuration : le mandataire est l'utilisateur courant ; la date de procuration précède la signature.
    if (!v.proxy_principal_name || !v.proxy_date) return fail("invalid");
    if (new Date(v.proxy_date) > signedAt) return fail("proxy_date_after");
    signatoryId = me.id; contributor = "intern";
  } else if (v.mode === "person" || v.mode === "not_applicable") {
    if (contributor === "intern") {
      signatoryId = v.signatory_id ?? me.id;
      // R-SIG-3 : collaborateurs restreints (+ responsables) uniquement.
      const [{ data: restricted }, { data: assignees }] = await Promise.all([
        supabase.from("flow_collaborators").select("collaborator_id").eq("flow_id", auth.flow.id),
        supabase.from("flow_assignees").select("collaborator_id").eq("flow_id", auth.flow.id),
      ]);
      if (restricted?.length) {
        const allowed = new Set([...restricted, ...(assignees ?? [])].map((r) => r.collaborator_id));
        if (!allowed.has(signatoryId)) return fail("not_in_restricted_list");
      }
    } else if (!v.first_name || !v.last_name || (contributor === "extern" && !v.email)) {
      return fail("invalid");
    }
  }
  // R-SIG-2 : une signature par collaborateur et par étape.
  if (signatoryId && (existing ?? []).some((s) => s.signatory_id === signatoryId)) return fail("sign_twice");
  if (v.mode !== "not_applicable" && !v.signature_data) return fail("signature_required");
  if (v.mode === "not_applicable" && !v.comment) return fail("comment_required");

  const { data: created, error } = await supabase.from("signatures").insert({
    block_id: v.block_id, step_id: auth.block.step_id, flow_id: auth.flow.id,
    nature: v.nature as SignatureNature,
    state: v.mode === "not_applicable" ? "not_possible" : "signed",
    contributor_type: contributor,
    signatory_id: signatoryId,
    first_name: contributor === "intern" ? null : v.first_name,
    last_name: contributor === "intern" ? null : v.last_name,
    email: contributor === "intern" ? null : v.email,
    company_name: v.company_name, profession: v.profession,
    signature_path: v.mode === "not_applicable" ? null : v.signature_data,
    signed_at: signedAt.toISOString(),
    comment: v.comment,
    proxied: v.mode === "proxy",
    proxy_principal_name: v.mode === "proxy" ? v.proxy_principal_name : null,
    proxy_date: v.mode === "proxy" ? v.proxy_date : null,
    source: "webapp",
    created_by: me.id,
  }).select("id").single();
  if (error || !created) return fail(error?.code === "23505" ? "sign_twice" : dbError(error));
  await supabase.from("signature_events").insert({
    block_id: v.block_id, flow_id: auth.flow.id, signature_id: created.id, action: "create", nature: v.nature as SignatureNature, actor_id: me.id,
  });
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export async function deleteSignature(signatureId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: sig } = await supabase.from("signatures").select("id, block_id, nature").eq("id", signatureId).maybeSingle();
  if (!sig) return fail("not_found");
  const auth = await authorizeBlock(sig.block_id, "FlowSignatures", "deleteSignature");
  if ("error" in auth) return fail(auth.error);
  const { error } = await supabase.from("signatures").delete().eq("id", signatureId);
  if (error) return fail(dbError(error));
  await supabase.from("signature_events").insert({
    block_id: sig.block_id, flow_id: auth.flow.id, signature_id: sig.id, action: "delete", nature: sig.nature, actor_id: auth.session.collaborator.id,
  });
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

// ===== MULTI_PR (§5.9) ============================================================

export async function addMultiPrItem(blockId: string, relativeTo: string | null, where: "above" | "below" | "end"): Promise<ActionResult> {
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: items } = await supabase.from("block_multi_pr_items").select("id, position").eq("block_id", blockId).order("position");
  const list = items ?? [];
  if (list.length >= MULTI_PR_MAX_ITEMS) return fail("max_items");
  const idx = relativeTo ? list.findIndex((i) => i.id === relativeTo) : -1;
  const insertAt = where === "end" || idx < 0 ? list.length : where === "above" ? idx : idx + 1;
  const { data: created, error } = await supabase.from("block_multi_pr_items").insert({
    block_id: blockId, flow_id: auth.flow.id, position: 10_000 + list.length, updated_by: auth.session.collaborator.id,
  }).select("id").single();
  if (error || !created) return fail(dbError(error));
  const ordered = list.map((i) => i.id);
  ordered.splice(insertAt, 0, created.id);
  for (let i = 0; i < ordered.length; i++) await supabase.from("block_multi_pr_items").update({ position: i + 1 }).eq("id", ordered[i]);
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export async function duplicateMultiPrItem(itemId: string): Promise<ActionResult> {
  const blockId = await blockOfItem("block_multi_pr_items", itemId);
  if (!blockId) return fail("not_found");
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: items } = await supabase.from("block_multi_pr_items").select("*").eq("block_id", blockId).order("position");
  const list = items ?? [];
  if (list.length >= MULTI_PR_MAX_ITEMS) return fail("max_items");
  const src = list.find((i) => i.id === itemId)!;
  const { data: created, error } = await supabase.from("block_multi_pr_items").insert({
    block_id: blockId, flow_id: auth.flow.id, position: 10_000 + list.length, title: src.title, title_auto_filled: src.title_auto_filled,
    content_html: src.content_html, content_json: src.content_json, hide_on_export: src.hide_on_export, updated_by: auth.session.collaborator.id,
  }).select("id").single();
  if (error || !created) return fail(dbError(error));
  const ordered = list.map((i) => i.id);
  ordered.splice(ordered.indexOf(itemId) + 1, 0, created.id);
  for (let i = 0; i < ordered.length; i++) await supabase.from("block_multi_pr_items").update({ position: i + 1 }).eq("id", ordered[i]);
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export async function reorderMultiPrItems(blockId: string, orderedIds: string[]): Promise<ActionResult> {
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    await supabase.from("block_multi_pr_items").update({ position: i + 1 }).eq("id", orderedIds[i]).eq("block_id", blockId);
  }
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

/** Contenu d'un sous-bloc (titre, texte riche, désactivation, masquage PDF) : en rédaction uniquement. */
export async function updateMultiPrItem(itemId: string, v: { title?: string | null; content_html?: string; content_json?: unknown; disabled?: boolean; hide_on_export?: boolean }): Promise<ActionResult> {
  const blockId = await blockOfItem("block_multi_pr_items", itemId);
  if (!blockId) return fail("not_found");
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  if ((v.content_html?.length ?? 0) > MAX_HTML) return fail("too_large");
  const supabase = await createClient();
  const patch: Record<string, unknown> & { updated_by: string } = { updated_by: auth.session.collaborator.id, updated_at: new Date().toISOString() };
  if (v.title !== undefined) { patch.title = v.title?.trim() || null; patch.title_auto_filled = !v.title?.trim(); }
  if (v.content_html !== undefined) { patch.content_html = v.content_html; patch.content_json = v.content_json ?? null; }
  if (v.disabled !== undefined) patch.disabled = v.disabled;
  if (v.hide_on_export !== undefined) patch.hide_on_export = v.hide_on_export;
  const { error } = await supabase.from("block_multi_pr_items").update(patch as never).eq("id", itemId);
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export async function deleteMultiPrItem(itemId: string): Promise<ActionResult> {
  const blockId = await blockOfItem("block_multi_pr_items", itemId);
  if (!blockId) return fail("not_found");
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { count } = await supabase.from("block_multi_pr_items").select("id", { count: "exact", head: true }).eq("block_id", blockId);
  if ((count ?? 0) <= 1) return fail("last_item");
  const { error } = await supabase.from("block_multi_pr_items").delete().eq("id", itemId);
  if (error) return fail(error.code === "23503" ? "has_signatures" : dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

/** Options du bloc : titres masqués, statut obligatoire, signature obligatoire (⇒ statut obligatoire). */
export async function updateMultiPrOptions(blockId: string, v: { multi_pr_title_hidden: boolean; multi_pr_requires_status: boolean; multi_pr_requires_signature: boolean }): Promise<ActionResult> {
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  if (v.multi_pr_requires_signature && !v.multi_pr_requires_status) return fail("signature_requires_status");
  const supabase = await createClient();
  const { error } = await supabase.from("blocks").update(v).eq("id", blockId);
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

/** Données terrain d'un sous-bloc : statut et observation (historisés). */
export async function setMultiPrField(itemId: string, v: { custom_status_id?: string | null; observation?: string | null; comment?: string | null }): Promise<ActionResult> {
  const blockId = await blockOfItem("block_multi_pr_items", itemId);
  if (!blockId) return fail("not_found");
  const auth = await authorizeBlock(blockId, "FlowSignatures", "edit");
  if ("error" in auth) return fail(auth.error);
  if ((v.observation?.length ?? 0) > 4000) return fail("too_long");
  const supabase = await createClient();
  const { data: before } = await supabase.from("block_multi_pr_items").select("custom_status_id, disabled").eq("id", itemId).single();
  if (before?.disabled) return fail("item_disabled");
  const me = auth.session.collaborator.id;
  const patch: Record<string, unknown> & { updated_by: string } = { updated_by: me, updated_at: new Date().toISOString() };
  if (v.custom_status_id !== undefined) patch.custom_status_id = v.custom_status_id;
  if (v.observation !== undefined) patch.observation = v.observation?.trim() || null;
  const { error } = await supabase.from("block_multi_pr_items").update(patch as never).eq("id", itemId);
  if (error) return fail(dbError(error));
  if (v.custom_status_id !== undefined && v.custom_status_id !== before?.custom_status_id) {
    await supabase.from("block_multi_pr_events").insert({
      block_id: blockId, flow_id: auth.flow.id, item_id: itemId, action: before?.custom_status_id ? "change_status" : "select_status",
      from_status_id: before?.custom_status_id, to_status_id: v.custom_status_id, comment: v.comment?.trim() || null, actor_id: me,
    });
  }
  if (v.observation !== undefined) {
    await supabase.from("block_multi_pr_events").insert({ block_id: blockId, flow_id: auth.flow.id, item_id: itemId, action: "edit_observation", actor_id: me });
  }
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export async function signMultiPrItem(itemId: string, v: { signature_data: string; signed_at: string }): Promise<ActionResult> {
  const blockId = await blockOfItem("block_multi_pr_items", itemId);
  if (!blockId) return fail("not_found");
  const auth = await authorizeBlock(blockId, "FlowSignatures", "add");
  if ("error" in auth) return fail(auth.error);
  if (!v.signature_data || v.signature_data.length > 400_000) return fail("signature_required");
  const supabase = await createClient();
  const me = auth.session.collaborator.id;
  const { data: item } = await supabase.from("block_multi_pr_items").select("disabled").eq("id", itemId).single();
  if (item?.disabled) return fail("item_disabled");
  const { error } = await supabase.from("block_multi_pr_signatures").insert({
    item_id: itemId, flow_id: auth.flow.id, signatory_id: me, signed_at: new Date(v.signed_at).toISOString(), signature_path: v.signature_data,
  });
  if (error) return fail(error.code === "23505" ? "already_signed" : dbError(error));
  await supabase.from("block_multi_pr_events").insert({ block_id: blockId, flow_id: auth.flow.id, item_id: itemId, action: "sign", actor_id: me });
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export async function deleteMultiPrSignature(itemId: string): Promise<ActionResult> {
  const blockId = await blockOfItem("block_multi_pr_items", itemId);
  if (!blockId) return fail("not_found");
  const auth = await authorizeBlock(blockId, "FlowSignatures", "deleteSignature");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from("block_multi_pr_signatures").delete().eq("item_id", itemId);
  if (error) return fail(dbError(error));
  await supabase.from("block_multi_pr_events").insert({ block_id: blockId, flow_id: auth.flow.id, item_id: itemId, action: "delete_signature", actor_id: auth.session.collaborator.id });
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

// ===== OBJECT (§5.10) =============================================================

export async function linkObjects(blockId: string, objectIds: string[]): Promise<ActionResult> {
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  if (!objectIds.length) return fail("no_selection");
  const supabase = await createClient();
  let pos = await nextPosition("block_object_items", blockId);
  const { error } = await supabase.from("block_object_items").upsert(
    objectIds.map((technical_object_id) => ({ block_id: blockId, flow_id: auth.flow.id, technical_object_id, position: pos++ })),
    { onConflict: "block_id,technical_object_id", ignoreDuplicates: true },
  );
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}

export type UnlinkCheck = { result: "allowed" | "object_bloc_not_in_redaction" | "form_bloc_not_in_redaction" | "linked_forms_have_responses"; forms: { name: string; responses: string[] }[] };

/** Pré-contrôle de dissociation (enum UNLINKING_ALLOWED, …). */
export async function checkUnlinkObject(blockId: string, objectId: string): Promise<ActionResult<UnlinkCheck>> {
  const auth = await authorizeBlock(blockId, "FlowContent", "edit");
  if ("error" in auth) return fail(auth.error);
  if (auth.block.state !== "redaction") return ok({ result: "object_bloc_not_in_redaction", forms: [] });
  const supabase = await createClient();
  const { data: links } = await supabase.from("form_block_links")
    .select("id, block:blocks(state), form:forms(name), responses:form_responses(reference, deleted_at)")
    .eq("step_id", auth.block.step_id).eq("technical_object_id", objectId);
  type L = { id: string; block: { state: string } | null; form: { name: string } | null; responses: { reference: string; deleted_at: string | null }[] };
  const list = (links ?? []) as unknown as L[];
  if (list.some((l) => l.block?.state !== "redaction")) return ok({ result: "form_bloc_not_in_redaction", forms: [] });
  const withResponses = list.map((l) => ({ name: l.form?.name ?? "—", responses: l.responses.filter((r) => !r.deleted_at).map((r) => r.reference) }))
    .filter((f) => f.responses.length);
  if (withResponses.length) return ok({ result: "linked_forms_have_responses", forms: withResponses });
  return ok({ result: "allowed", forms: [] });
}

export async function unlinkObject(blockId: string, objectId: string): Promise<ActionResult> {
  const check = await checkUnlinkObject(blockId, objectId);
  if (!check.ok) return check;
  if (check.data.result !== "allowed") return fail(check.data.result);
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  await supabase.from("form_block_links").update({ technical_object_id: null }).eq("step_id", auth.block.step_id).eq("technical_object_id", objectId);
  const { error } = await supabase.from("block_object_items").delete().eq("block_id", blockId).eq("technical_object_id", objectId);
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}
