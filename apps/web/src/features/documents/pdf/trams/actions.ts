"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { isEncryptedPdf, loadPdf } from "@/lib/pdf/assemble";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { REQUIRED_DEFAULT_TYPES, TEMPLATE_BUCKET, TEMPLATE_PAGE_TYPES, templateStoragePath } from "../templates";

const MAX_TEMPLATE_SIZE = 20 * 1024 * 1024;
const num = z.coerce.number().min(0).max(2000);
const optNum = z.union([z.literal(""), z.null(), z.undefined(), num]).transform((v) => (v === "" || v === null || v === undefined ? null : v));
const schema = z.object({
  link_type: z.enum(["default", "client", "family"]),
  client_id: z.string().optional().nullable(),
  family_id: z.string().optional().nullable(),
  page_type: z.enum(TEMPLATE_PAGE_TYPES as [string, ...string[]]),
  margin_top: num, margin_bottom: num, margin_left: num, margin_right: num,
  page_number_x: optNum, page_number_y: optNum,
  index_max: z.union([z.literal(""), z.null(), z.undefined(), z.coerce.number().int().min(1).max(50)]).transform((v) => (v === "" || v === null || v === undefined ? null : v)),
});

const revalidate = () => revalidatePath("/explore/settings/trams");

/** Création / édition d'une trame (PDF de fond dans Storage, spec 01 §6.12). Réservé Admin Siteflow. */
export async function saveTram(id: string | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("SettingsTrams", "edit");
  if ("error" in auth) return fail(auth.error);
  const raw = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string"));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const v = parsed.data;
  if (v.link_type === "client" && !v.client_id) return fail("client_required");
  if (v.link_type === "family" && !v.family_id) return fail("family_required");
  const supabase = await createClient();
  const orgId = auth.session.organization.id;

  let current: { link_type: string; page_type: string; pdf_path: string } | null = null;
  if (id) {
    const { data } = await supabase.from("document_templates").select("link_type, page_type, pdf_path").eq("id", id).maybeSingle();
    if (!data) return fail("not_found");
    current = data;
    if (data.link_type === "default" && (data.page_type !== v.page_type || v.link_type !== "default")) return fail("default_type_locked");
  }

  let pdfPath = current?.pdf_path ?? null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_TEMPLATE_SIZE) return fail("too_large");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (await isEncryptedPdf(bytes)) return fail("password_protected");
    if (!(await loadPdf(bytes))) return fail("invalid_pdf");
    pdfPath = templateStoragePath(orgId, file.name || "trame.pdf");
    // Préfixe templates/ hors politiques Storage d'entité : écriture par le client service après contrôle des droits.
    const { error } = await createAdminClient().storage.from(TEMPLATE_BUCKET).upload(pdfPath, bytes, { contentType: "application/pdf", upsert: false });
    if (error) return fail("upload_failed");
  }
  if (!pdfPath) return fail("file_required");

  const row = {
    link_type: v.link_type, client_id: v.link_type === "client" ? v.client_id! : null, family_id: v.link_type === "family" ? v.family_id! : null,
    page_type: v.page_type, pdf_path: pdfPath,
    margin_top: v.margin_top, margin_bottom: v.margin_bottom, margin_left: v.margin_left, margin_right: v.margin_right,
    page_number_x: v.page_number_x, page_number_y: v.page_number_y, index_max: v.index_max,
  };
  const query = id
    ? supabase.from("document_templates").update(row).eq("id", id).select("id").single()
    : supabase.from("document_templates").insert({ ...row, organization_id: orgId }).select("id").single();
  const { data, error } = await query;
  if (error || !data) return fail(error?.code === "23505" ? "already_exists" : dbError(error));
  if (current && current.pdf_path !== pdfPath) await createAdminClient().storage.from(TEMPLATE_BUCKET).remove([current.pdf_path]);
  revalidate();
  return ok({ id: data.id });
}

export async function deleteTram(id: string): Promise<ActionResult> {
  const auth = await authorize("SettingsTrams", "delete");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data } = await supabase.from("document_templates").select("link_type, page_type, pdf_path").eq("id", id).maybeSingle();
  if (!data) return fail("not_found");
  if (data.link_type === "default" && REQUIRED_DEFAULT_TYPES.includes(data.page_type)) return fail("required_default");
  const { error } = await supabase.from("document_templates").delete().eq("id", id);
  if (error) return fail(dbError(error));
  await createAdminClient().storage.from(TEMPLATE_BUCKET).remove([data.pdf_path]);
  revalidate();
  return ok(undefined);
}

/** URL signée (10 min) du PDF d'une trame — aperçu. */
export async function tramPreviewUrl(id: string): Promise<ActionResult<{ url: string }>> {
  const auth = await authorize("SettingsTrams", "read");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data } = await supabase.from("document_templates").select("pdf_path").eq("id", id).maybeSingle();
  if (!data) return fail("not_found");
  const { data: signed } = await createAdminClient().storage.from(TEMPLATE_BUCKET).createSignedUrl(data.pdf_path, 600);
  return signed?.signedUrl ? ok({ url: signed.signedUrl }) : fail("not_found");
}
