"use server";

import { dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { authorizeBlock, revalidateFlow } from "@/features/flows/server-utils";

export type LinkableForm = {
  id: string; formName: string; blockState: string; linkedObjectId: string | null; linkedObjectName: string | null; responses: number;
};

/** Liens formulaire (FBL) de l'étape dont le formulaire comporte des questions « attribut d'objet » (spec 02 §5.10). */
export async function listLinkableForms(blockId: string): Promise<ActionResult<LinkableForm[]>> {
  const auth = await authorizeBlock(blockId, "FlowContent", "edit");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: links } = await supabase.from("form_block_links")
    .select("id, form_id, technical_object_id, block:blocks(state), form:forms(name), object:technical_objects(name), responses:form_responses(id, deleted_at)")
    .eq("step_id", auth.block.step_id).order("position");
  type L = { id: string; form_id: string; technical_object_id: string | null; block: { state: string } | null; form: { name: string } | null;
    object: { name: string } | null; responses: { id: string; deleted_at: string | null }[] };
  const list = (links ?? []) as unknown as L[];
  if (!list.length) return ok([]);
  const { data: attrQuestions } = await supabase.from("form_questions").select("form_id")
    .in("form_id", [...new Set(list.map((l) => l.form_id))]).not("object_attribute_id", "is", null);
  const withAttributes = new Set((attrQuestions ?? []).map((q) => q.form_id));
  return ok(list.filter((l) => withAttributes.has(l.form_id)).map((l) => ({
    id: l.id, formName: l.form?.name ?? "—", blockState: l.block?.state ?? "", linkedObjectId: l.technical_object_id,
    linkedObjectName: l.object?.name ?? null, responses: l.responses.filter((r) => !r.deleted_at).length,
  })));
}

/** « Lier un formulaire » : associe l'objet aux liens cochés, le retire des autres (bloc Formulaire en rédaction, sans réponse). */
export async function saveObjectFormLinks(blockId: string, objectId: string, linkIds: string[]): Promise<ActionResult> {
  const auth = await authorizeBlock(blockId, "FlowContent", "edit", { editable: true });
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: item } = await supabase.from("block_object_items").select("id").eq("block_id", blockId).eq("technical_object_id", objectId).maybeSingle();
  if (!item) return fail("not_found");
  const res = await listLinkableForms(blockId);
  if (!res.ok) return res;
  const wanted = new Set(linkIds);
  for (const l of res.data) {
    const next = wanted.has(l.id) ? objectId : l.linkedObjectId === objectId ? null : l.linkedObjectId;
    if (next === l.linkedObjectId) continue;
    if (l.blockState !== "redaction") return fail("form_bloc_not_in_redaction");
    if (l.responses > 0) return fail("has_responses");
    const { error } = await supabase.from("form_block_links").update({ technical_object_id: next }).eq("id", l.id);
    if (error) return fail(dbError(error));
  }
  revalidateFlow(auth.flow.project_id, auth.flow.id);
  return ok(undefined);
}
