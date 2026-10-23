"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { readSheet, yes } from "../shared/excel";
import { checkFile, clean, copyLibraryFile, libraryAuth, readFile, removeLibraryFiles, uploadLibraryFile, type Supa } from "../shared/server";

const ROUTE = "LibraryEquipments";
const PATH = "/explore/library/equipments";
const FILES = [
  { key: "photo", column: "photo_path", kind: "image" },
  { key: "reference_document", column: "reference_document_path", kind: "pdf" },
  { key: "certificate", column: "certificate_document_path", kind: "pdf" },
] as const;

const schema = z.object({
  family_id: z.uuid(),
  account_id: z.uuid(),
  name: z.string().trim().min(1).max(255),
  reference: z.string().max(255).nullable(),
  provider: z.string().max(255).nullable(),
  quantity_unit: z.string().max(50).nullable(),
  consumable: z.boolean(),
  subject_to_verification: z.boolean(),
  validity_date: z.iso.date().nullable(),
  verification_body: z.string().max(255).nullable(),
});

const bool = (v: FormDataEntryValue | null) => v === "true";

/** Création / édition ; FormData : champs + fichiers photo / reference_document / certificate (File, "" = retrait). */
export async function saveEquipment(id: string | null, form: FormData): Promise<ActionResult<{ id: string }>> {
  const auth = await libraryAuth(ROUTE, id ? "edit" : "add");
  if ("error" in auth) return fail(auth.error);
  const verify = bool(form.get("subject_to_verification"));
  const parsed = schema.safeParse({
    family_id: form.get("family_id"), account_id: form.get("account_id"), name: form.get("name"),
    reference: clean(form.get("reference")), provider: clean(form.get("provider")), quantity_unit: clean(form.get("quantity_unit"), 50),
    consumable: bool(form.get("consumable")), subject_to_verification: verify,
    validity_date: verify ? clean(form.get("validity_date"), 10) : null, verification_body: verify ? clean(form.get("verification_body")) : null,
  });
  if (!parsed.success) return fail("invalid");
  const files = FILES.map((f) => ({ ...f, value: readFile(form, f.key) }));
  for (const f of files) if (f.value) { const e = checkFile(f.value, f.kind); if (e) return fail(e); }

  const { supabase, session } = auth;
  let current: Partial<Record<(typeof FILES)[number]["column"], string | null>> = {};
  let rowId = id;
  if (id) {
    const { data } = await supabase.from("library_equipments").select("photo_path, reference_document_path, certificate_document_path").eq("id", id).maybeSingle();
    if (!data) return fail("not_found");
    current = data;
    const { error } = await supabase.from("library_equipments").update(parsed.data).eq("id", id);
    if (error) return fail(dbError(error));
  } else {
    const { data, error } = await supabase.from("library_equipments")
      .insert({ ...parsed.data, organization_id: session.organization.id }).select("id").single();
    if (error || !data) return fail(dbError(error));
    rowId = data.id;
  }
  // Fichiers : déposés après l'enregistrement (le chemin porte l'id du moyen, contrôlé par la politique Storage).
  const patch: Partial<Record<(typeof FILES)[number]["column"], string | null>> = {};
  const obsolete: (string | null)[] = [];
  for (const f of files) {
    if (f.value === undefined) continue;
    if (f.value === "") patch[f.column] = null;
    else {
      const path = await uploadLibraryFile(supabase, `equipments/${rowId}`, f.value);
      if (!path) return fail("upload_failed");
      patch[f.column] = path;
    }
    obsolete.push(current[f.column] ?? null);
  }
  if (Object.keys(patch).length) {
    const { error } = await supabase.from("library_equipments").update(patch).eq("id", rowId!);
    if (error) return fail(dbError(error));
    await removeLibraryFiles(supabase, obsolete);
  }
  revalidatePath(PATH);
  return ok({ id: rowId! });
}

export async function setEquipmentActive(id: string, active: boolean): Promise<ActionResult> {
  const auth = await libraryAuth(ROUTE, "deactivate");
  if ("error" in auth) return fail(auth.error);
  const { error } = await auth.supabase.from("library_equipments").update({ active }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}

async function usage(supabase: Supa, id: string) {
  const { data } = await supabase.rpc("library_item_usage", { p_kind: "equipment", p_id: id });
  return (data ?? {}) as { blocks?: number; lists?: number };
}

/** Suppression bloquée si le moyen est utilisé (bloc EMM ou liste de moyens). */
export async function deleteEquipment(id: string): Promise<ActionResult> {
  const auth = await libraryAuth(ROUTE, "delete");
  if ("error" in auth) return fail(auth.error);
  const { supabase } = auth;
  const u = await usage(supabase, id);
  if ((u.blocks ?? 0) + (u.lists ?? 0) > 0) return fail("in_use", u);
  const { data } = await supabase.from("library_equipments").select("photo_path, reference_document_path, certificate_document_path").eq("id", id).maybeSingle();
  if (!data) return fail("not_found");
  const { error } = await supabase.from("library_equipments").delete().eq("id", id);
  if (error) return fail(dbError(error));
  await removeLibraryFiles(supabase, [data.photo_path, data.reference_document_path, data.certificate_document_path]);
  revalidatePath(PATH);
  return ok(undefined);
}

export async function duplicateEquipment(id: string, suffix: string): Promise<ActionResult<{ id: string }>> {
  const auth = await libraryAuth(ROUTE, "duplicate");
  if ("error" in auth) return fail(auth.error);
  const { supabase } = auth;
  const { data: src } = await supabase.from("library_equipments").select("*").eq("id", id).maybeSingle();
  if (!src) return fail("not_found");
  const { id: _i, created_at: _c, updated_at: _u, created_by: _cb, updated_by: _ub, deleted_at: _d,
    photo_path, reference_document_path, certificate_document_path, ...rest } = src;
  void _i; void _c; void _u; void _cb; void _ub; void _d;
  const { data: copy, error } = await supabase.from("library_equipments")
    .insert({ ...rest, name: `${src.name} ${suffix}`.slice(0, 255) }).select("id").single();
  if (error || !copy) return fail(dbError(error));
  const prefix = `equipments/${copy.id}`;
  await supabase.from("library_equipments").update({
    photo_path: await copyLibraryFile(supabase, photo_path, prefix),
    reference_document_path: await copyLibraryFile(supabase, reference_document_path, prefix),
    certificate_document_path: await copyLibraryFile(supabase, certificate_document_path, prefix),
  }).eq("id", copy.id);
  revalidatePath(PATH);
  return ok({ id: copy.id });
}

export async function reorganizeEquipments(ids: string[], familyId: string): Promise<ActionResult> {
  const auth = await libraryAuth(ROUTE, "edit");
  if ("error" in auth) return fail(auth.error);
  if (!ids.length || !z.uuid().safeParse(familyId).success) return fail("invalid");
  const { error } = await auth.supabase.from("library_equipments").update({ family_id: familyId }).in("id", ids);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}

const COLUMNS = 9;

/** Import : Famille (nom court), Nom, Référence, Fournisseur, Unité, Consommable, Soumis à vérification, Date de validité, Organisme. */
export async function importEquipments(form: FormData): Promise<ActionResult<{ count: number; skipped: number[] }>> {
  const auth = await libraryAuth(ROUTE, "import");
  if ("error" in auth) return fail(auth.error);
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return fail("invalid_type");
  const sheet = await readSheet(file, COLUMNS);
  if ("error" in sheet) return fail(sheet.error);
  if (!sheet.rows.length) return fail("empty");
  const { supabase, session } = auth;
  const { data: families } = await supabase.from("label_families").select("id, short_name")
    .eq("kind", "family").eq("nature", "equipment").eq("relative_nature", "child").is("deleted_at", null).is("project_id", null);
  const byName = new Map((families ?? []).map((f) => [f.short_name.toLowerCase(), f.id]));
  const skipped: number[] = [];
  const rows = [];
  for (const { line, cells } of sheet.rows) {
    const [fam, name, reference, provider, unit, consumable, verification, validity, body] = cells;
    const family_id = byName.get(fam.toLowerCase());
    if (!family_id || !name) { skipped.push(line); continue; }
    if (cells.some((c) => c.length > 255)) return fail("too_long");
    const verify = yes(verification);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(validity) ? validity : null;
    rows.push({
      organization_id: session.organization.id, account_id: session.account.id, family_id, name,
      reference: reference || null, provider: provider || null, quantity_unit: unit ? unit.slice(0, 50) : null,
      consumable: yes(consumable), subject_to_verification: verify, validity_date: verify ? date : null, verification_body: verify ? body || null : null,
    });
  }
  if (!rows.length) return fail("empty");
  const { error } = await supabase.from("library_equipments").insert(rows);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok({ count: rows.length, skipped });
}
