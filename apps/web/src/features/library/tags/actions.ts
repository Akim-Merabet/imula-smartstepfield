"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { clean, libraryAuth } from "../shared/server";

const ROUTE = "LibraryTags";
const PATH = "/explore/library/tags";

const schema = z.object({
  name: z.string().trim().min(1).max(255),
  parent_id: z.uuid().nullable(),
  account_id: z.uuid().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: z.string().max(5000).nullable(),
});
export type TagInput = z.infer<typeof schema>;

export async function saveTag(id: string | null, input: TagInput): Promise<ActionResult<{ id: string }>> {
  const auth = await libraryAuth(ROUTE, id ? "edit" : "add");
  if ("error" in auth) return fail(auth.error);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { supabase, session } = auth;
  const row = { ...parsed.data, description: clean(parsed.data.description, 5000) };
  const { data: all } = await supabase.from("tags").select("id, parent_id, name");
  const list = all ?? [];
  // Nom unique au même niveau (« Création impossible »).
  if (list.some((t) => t.id !== id && (t.parent_id ?? null) === row.parent_id && t.name.trim().toLowerCase() === row.name.toLowerCase())) return fail("duplicate");
  if (id && row.parent_id) {
    const parentOf = new Map(list.map((t) => [t.id, t.parent_id]));
    for (let cur: string | null | undefined = row.parent_id; cur; cur = parentOf.get(cur)) if (cur === id) return fail("cycle");
  }
  if (id) {
    const { error } = await supabase.from("tags").update(row).eq("id", id);
    if (error) return fail(dbError(error));
    revalidatePath(PATH);
    return ok({ id });
  }
  const position = list.filter((t) => (t.parent_id ?? null) === row.parent_id).length + 1;
  const { data, error } = await supabase.from("tags").insert({ ...row, position, organization_id: session.organization.id }).select("id").single();
  if (error || !data) return fail(dbError(error));
  revalidatePath(PATH);
  return ok({ id: data.id });
}

/** Suppression bloquée si sous-étiquettes ou liens (flows, phases, étapes) ; pas de corbeille. */
export async function deleteTag(id: string): Promise<ActionResult> {
  const auth = await libraryAuth(ROUTE, "delete");
  if ("error" in auth) return fail(auth.error);
  const { supabase } = auth;
  const { data } = await supabase.rpc("library_item_usage", { p_kind: "tag", p_id: id });
  const u = (data ?? {}) as { links?: number; children?: number };
  if ((u.children ?? 0) > 0) return fail("has_children", u);
  if ((u.links ?? 0) > 0) return fail("in_use", u);
  const { error } = await supabase.from("tags").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}
