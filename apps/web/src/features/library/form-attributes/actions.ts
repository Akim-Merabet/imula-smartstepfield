"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canEditFormContent } from "@/features/forms/permissions";
import { questionTypeFor } from "./mapping";

export type AttributeOption = { id: string; name: string; type: string; group: string | null; used: boolean };

async function guard(formId: string) {
  const session = await getSession();
  if (!session) return { error: "unauthenticated" } as const;
  const supabase = await createClient();
  const { data: form } = await supabase.from("forms")
    .select("id, location, nature, origin, project_id, deleted_at, object_attributes_link, object_family_id").eq("id", formId).maybeSingle();
  if (!form || form.deleted_at) return { error: "not_found" } as const;
  let role = null;
  if (form.project_id) {
    const { data } = await supabase.from("project_members").select("role")
      .eq("project_id", form.project_id).eq("collaborator_id", session.collaborator.id).maybeSingle();
    role = data?.role ?? null;
  }
  if (!canEditFormContent(form, session.collaborator, role)) return { error: "forbidden" } as const;
  if (form.object_attributes_link === "disabled") return { error: "object_attributes_disabled" } as const;
  return { supabase, form };
}

/** Attributs d'objet proposés (« Liste des attributs ») : famille du formulaire si « autre famille », sinon tous. */
export async function listObjectAttributes(formId: string): Promise<ActionResult<AttributeOption[]>> {
  const g = await guard(formId);
  if ("error" in g) return fail(g.error!);
  const { supabase, form } = g;
  const [{ data: fields }, { data: used }, { data: family }] = await Promise.all([
    supabase.from("custom_fields").select("id, name, type, link_type, label_family_id, family:label_families(short_name, long_name)")
      .eq("nature", "technical_object").eq("active", true).is("deleted_at", null).order("sort_order").order("name"),
    supabase.from("form_questions").select("object_attribute_id").eq("form_id", formId).not("object_attribute_id", "is", null),
    form.object_family_id ? supabase.from("label_families").select("id, parent_id").eq("id", form.object_family_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const usedIds = new Set((used ?? []).map((q) => q.object_attribute_id));
  const allowed = new Set([family?.id, family?.parent_id].filter(Boolean) as string[]);
  type F = { id: string; name: string; type: Parameters<typeof questionTypeFor>[0]; link_type: string; label_family_id: string | null; family: { short_name: string; long_name: string | null } | null };
  const list = ((fields ?? []) as unknown as F[])
    .filter((f) => questionTypeFor(f.type))
    .filter((f) => form.object_attributes_link !== "other_family" || f.link_type === "default" || (!!f.label_family_id && allowed.has(f.label_family_id)))
    .map((f) => ({ id: f.id, name: f.name, type: f.type, group: f.family ? [f.family.short_name, f.family.long_name].filter(Boolean).join(" - ") : null, used: usedIds.has(f.id) }));
  return ok(list);
}

/** « Ajouter un attribut d'objet » : une question liée (object_attribute_id) par attribut, en fin de rubrique. */
export async function addObjectAttributeQuestions(formId: string, rubricId: string, fieldIds: string[]): Promise<ActionResult<{ ids: string[] }>> {
  if (!z.array(z.uuid()).min(1).max(100).safeParse(fieldIds).success) return fail("invalid");
  const g = await guard(formId);
  if ("error" in g) return fail(g.error!);
  const { supabase } = g;
  const [{ data: rubric }, { data: fields }, { data: existing }] = await Promise.all([
    supabase.from("form_rubrics").select("id, type").eq("id", rubricId).eq("form_id", formId).maybeSingle(),
    supabase.from("custom_fields").select("id, name, type, choices, description, placeholder, required").in("id", fieldIds).eq("nature", "technical_object"),
    supabase.from("form_questions").select("id, object_attribute_id").eq("rubric_id", rubricId),
  ]);
  if (!rubric || rubric.type !== "question") return fail("invalid");
  const tg = await getTranslations("global");
  const already = new Set((existing ?? []).map((q) => q.object_attribute_id));
  let position = (existing ?? []).length;
  const ids: string[] = [];
  for (const f of (fields ?? []).filter((x) => !already.has(x.id))) {
    const type = questionTypeFor(f.type);
    if (!type) continue;
    const qid = crypto.randomUUID();
    const { error } = await supabase.from("form_questions").insert({
      id: qid, lineage_id: qid, form_id: formId, rubric_id: rubricId, position: ++position, type, name: f.name.slice(0, 500),
      description: f.description, mandatory: f.required, object_attribute_id: f.id,
    });
    if (error) return fail(dbError(error));
    const oid = crypto.randomUUID();
    const choices = f.type === "boolean" ? [tg("yes"), tg("no")] : f.type === "select" || f.type === "multiselect" ? f.choices : [];
    const { error: oe } = await supabase.from("form_options").insert({
      id: oid, lineage_id: oid, form_id: formId, question_id: qid, position: 1, choices, placeholder: f.placeholder,
    });
    if (oe) return fail(dbError(oe));
    ids.push(qid);
  }
  revalidatePath(`/form/${formId}`);
  return ok({ ids });
}
