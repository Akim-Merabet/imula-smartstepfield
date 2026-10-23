"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { createDocument } from "../actions";

const uuidOrNull = z.union([z.uuid(), z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));
const schema = z.object({
  name: z.string().trim().min(3).max(255),
  family_id: z.uuid(),
  ref_int: z.string().trim().max(255).optional().nullable(),
  ref_ext: z.string().trim().max(255).optional().nullable(),
  category_id: uuidOrNull,
  closing_category_id: uuidOrNull,
  include_empty_option: z.boolean().default(false),
});
export type ResponseDocumentInput = z.input<typeof schema>;

/**
 * « Générer un document » depuis une réponse (spec 03 §8.3) : crée le document de formulaire
 * (réponse sélectionnée ; nature « formulaire unique du flow » si la réponse vient d'un flow) et
 * met sa génération en file (cloche). Statut exportable requis.
 */
export async function generateResponseDocument(responseId: string, input: ResponseDocumentInput):
  Promise<ActionResult<{ id: string; versionId: string | null }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const v = parsed.data;
  const supabase = await createClient();
  const { data: response } = await supabase.from("form_responses")
    .select("id, project_id, form_id, flow_id, custom_status_id, status:custom_statuses(exportable)")
    .eq("id", responseId).is("deleted_at", null).maybeSingle();
  if (!response) return fail("not_found");
  const status = response.status as { exportable: boolean } | null;
  if (response.custom_status_id && status && !status.exportable) return fail("status_not_exportable");
  const res = await createDocument("project", response.project_id, {
    source: "form", nature: response.flow_id ? "block_form" : "project_form",
    family_id: v.family_id, name: v.name, ref_int: v.ref_int || null, ref_ext: v.ref_ext || null,
    category_id: v.category_id, closing_category_id: v.closing_category_id,
    linked_form_id: response.form_id, linked_flow_id: response.flow_id, linked_response_id: response.id,
    responses_strategy: "selected", options: { include_empty_option: v.include_empty_option },
    selections: { form_response: [response.id] },
  });
  if (!res.ok) return res.error === "unique_content" ? fail("already_generated") : res;
  return ok(res.data);
}
