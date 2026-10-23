"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { int, readSheet, yes } from "../shared/excel";
import { checkFile, clean, copyLibraryFile, libraryAuth, readFile, removeLibraryFiles, uploadLibraryFile } from "../shared/server";

const ROUTE = "LibraryRisks";
const PATH = "/explore/library/risks";
const score = z.number().int().min(0).max(999).nullable();

const riskSchema = z.object({
  family_id: z.uuid(),
  account_id: z.uuid(),
  name: z.string().trim().min(1).max(255),
  reference: z.string().max(255).nullable(),
  source: z.string().max(255).nullable(),
  landmark: z.string().max(255).nullable(),
  pictogram: z.number().int().min(1).max(240).nullable(),
  major: z.boolean(),
  frequency: score, occurrence: score, severity: score,
});
export type RiskInput = z.infer<typeof riskSchema>;

export async function saveRisk(id: string | null, input: RiskInput): Promise<ActionResult<{ id: string }>> {
  const auth = await libraryAuth(ROUTE, id ? "edit" : "add");
  if ("error" in auth) return fail(auth.error);
  const parsed = riskSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const v = parsed.data;
  const row = { ...v, reference: clean(v.reference), source: clean(v.source), landmark: clean(v.landmark) };
  const { supabase, session } = auth;
  if (id) {
    const { error } = await supabase.from("library_risks").update(row).eq("id", id);
    if (error) return fail(dbError(error));
    revalidatePath(PATH);
    return ok({ id });
  }
  const { data, error } = await supabase.from("library_risks")
    .insert({ ...row, organization_id: session.organization.id }).select("id").single();
  if (error || !data) return fail(dbError(error));
  revalidatePath(PATH);
  return ok({ id: data.id });
}

export async function setRiskActive(id: string, active: boolean): Promise<ActionResult> {
  const auth = await libraryAuth(ROUTE, "deactivate");
  if ("error" in auth) return fail(auth.error);
  const { error } = await auth.supabase.from("library_risks").update({ active }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}

/** Suppression bloquée si le risque est utilisé dans un bloc ADR ou une liste de risques. */
export async function deleteRisk(id: string): Promise<ActionResult> {
  const auth = await libraryAuth(ROUTE, "delete");
  if ("error" in auth) return fail(auth.error);
  const { supabase } = auth;
  const { data: usage } = await supabase.rpc("library_item_usage", { p_kind: "risk", p_id: id });
  const u = (usage ?? {}) as { blocks?: number; lists?: number };
  if ((u.blocks ?? 0) + (u.lists ?? 0) > 0) return fail("in_use", u);
  const { data: parades } = await supabase.from("library_risk_parades").select("file_path").eq("risk_id", id);
  const { error } = await supabase.from("library_risks").delete().eq("id", id);
  if (error) return fail(dbError(error));
  await removeLibraryFiles(supabase, (parades ?? []).map((p) => p.file_path));
  revalidatePath(PATH);
  return ok(undefined);
}

export async function duplicateRisk(id: string, suffix: string): Promise<ActionResult<{ id: string }>> {
  const auth = await libraryAuth(ROUTE, "duplicate");
  if ("error" in auth) return fail(auth.error);
  const { supabase } = auth;
  const { data: src } = await supabase.from("library_risks").select("*").eq("id", id).maybeSingle();
  if (!src) return fail("not_found");
  const { id: _i, created_at: _c, updated_at: _u, created_by: _cb, updated_by: _ub, deleted_at: _d, ...rest } = src;
  void _i; void _c; void _u; void _cb; void _ub; void _d;
  const { data: copy, error } = await supabase.from("library_risks")
    .insert({ ...rest, name: `${src.name} ${suffix}`.slice(0, 255) }).select("id").single();
  if (error || !copy) return fail(dbError(error));
  const { data: parades } = await supabase.from("library_risk_parades").select("*").eq("risk_id", id).order("position");
  for (const p of parades ?? []) {
    const file_path = await copyLibraryFile(supabase, p.file_path, `risks/${copy.id}/parades`);
    await supabase.from("library_risk_parades").insert({
      risk_id: copy.id, name: p.name, description: p.description, pictogram: p.pictogram, file_path, position: p.position,
    });
  }
  revalidatePath(PATH);
  return ok({ id: copy.id });
}

export async function reorganizeRisks(ids: string[], familyId: string): Promise<ActionResult> {
  const auth = await libraryAuth(ROUTE, "edit");
  if ("error" in auth) return fail(auth.error);
  if (!ids.length || !z.uuid().safeParse(familyId).success) return fail("invalid");
  const { error } = await auth.supabase.from("library_risks").update({ family_id: familyId }).in("id", ids);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}

// ===== Parades génériques =======================================================
const paradeSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().max(5000).nullable(),
  pictogram: z.number().int().min(1).max(240).nullable(),
});

/** Création / édition d'une parade ; FormData : name, description, pictogram, file (PDF, "" = retrait). */
export async function saveParade(riskId: string, paradeId: string | null, form: FormData): Promise<ActionResult<{ id: string }>> {
  const auth = await libraryAuth(ROUTE, "edit");
  if ("error" in auth) return fail(auth.error);
  const pic = Number(form.get("pictogram"));
  const parsed = paradeSchema.safeParse({
    name: form.get("name"), description: clean(form.get("description"), 5000), pictogram: pic >= 1 && pic <= 240 ? pic : null,
  });
  if (!parsed.success) return fail("invalid");
  const { supabase } = auth;
  const file = readFile(form, "file");
  if (file) { const e = checkFile(file, "pdf"); if (e) return fail(e); }

  let current: { file_path: string | null } | null = null;
  if (paradeId) {
    const { data } = await supabase.from("library_risk_parades").select("file_path").eq("id", paradeId).eq("risk_id", riskId).maybeSingle();
    if (!data) return fail("not_found");
    current = data;
  }
  let file_path = current?.file_path ?? null;
  if (file) {
    const path = await uploadLibraryFile(supabase, `risks/${riskId}/parades`, file);
    if (!path) return fail("upload_failed");
    file_path = path;
  } else if (file === "") file_path = null;

  const row = { ...parsed.data, file_path };
  let id = paradeId;
  if (paradeId) {
    const { error } = await supabase.from("library_risk_parades").update(row).eq("id", paradeId);
    if (error) return fail(dbError(error));
  } else {
    const { count } = await supabase.from("library_risk_parades").select("id", { count: "exact", head: true }).eq("risk_id", riskId);
    const { data, error } = await supabase.from("library_risk_parades").insert({ ...row, risk_id: riskId, position: (count ?? 0) + 1 }).select("id").single();
    if (error || !data) return fail(dbError(error));
    id = data.id;
  }
  if (current?.file_path && current.file_path !== file_path) await removeLibraryFiles(supabase, [current.file_path]);
  revalidatePath(PATH);
  return ok({ id: id! });
}

export async function deleteParade(paradeId: string): Promise<ActionResult> {
  const auth = await libraryAuth(ROUTE, "edit");
  if ("error" in auth) return fail(auth.error);
  const { supabase } = auth;
  const { data } = await supabase.from("library_risk_parades").select("file_path").eq("id", paradeId).maybeSingle();
  if (!data) return fail("not_found");
  const { error } = await supabase.from("library_risk_parades").delete().eq("id", paradeId);
  if (error) return fail(dbError(error));
  await removeLibraryFiles(supabase, [data.file_path]);
  revalidatePath(PATH);
  return ok(undefined);
}

export async function duplicateParade(paradeId: string, suffix: string): Promise<ActionResult> {
  const auth = await libraryAuth(ROUTE, "edit");
  if ("error" in auth) return fail(auth.error);
  const { supabase } = auth;
  const { data: p } = await supabase.from("library_risk_parades").select("*").eq("id", paradeId).maybeSingle();
  if (!p) return fail("not_found");
  const { count } = await supabase.from("library_risk_parades").select("id", { count: "exact", head: true }).eq("risk_id", p.risk_id);
  const file_path = await copyLibraryFile(supabase, p.file_path, `risks/${p.risk_id}/parades`);
  const { error } = await supabase.from("library_risk_parades").insert({
    risk_id: p.risk_id, name: `${p.name} ${suffix}`.slice(0, 255), description: p.description, pictogram: p.pictogram, file_path, position: (count ?? 0) + 1,
  });
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok(undefined);
}

// ===== Import Excel ==============================================================
const COLUMNS = 10;

/** Import depuis la trame : Famille (nom court), Nom, Référence, Source, Repère, Pictogramme, Majeur, Fréquence, Occurrence, Gravité. */
export async function importRisks(form: FormData): Promise<ActionResult<{ count: number; skipped: number[] }>> {
  const auth = await libraryAuth(ROUTE, "import");
  if ("error" in auth) return fail(auth.error);
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return fail("invalid_type");
  const sheet = await readSheet(file, COLUMNS);
  if ("error" in sheet) return fail(sheet.error);
  if (!sheet.rows.length) return fail("empty");
  const { supabase, session } = auth;
  const { data: families } = await supabase.from("label_families").select("id, short_name")
    .eq("kind", "family").eq("nature", "risk").eq("relative_nature", "child").is("deleted_at", null).is("project_id", null);
  const byName = new Map((families ?? []).map((f) => [f.short_name.toLowerCase(), f.id]));
  const skipped: number[] = [];
  const rows = [];
  for (const { line, cells } of sheet.rows) {
    const [fam, name, reference, source, landmark, picto, major, frequency, occurrence, severity] = cells;
    const family_id = byName.get(fam.toLowerCase());
    if (!family_id || !name) { skipped.push(line); continue; }
    if (cells.some((c) => c.length > 255)) return fail("too_long");
    const p = int(picto);
    rows.push({
      organization_id: session.organization.id, account_id: session.account.id, family_id, name,
      reference: reference || null, source: source || null, landmark: landmark || null,
      pictogram: p && p >= 1 && p <= 240 ? p : null, major: yes(major),
      frequency: int(frequency), occurrence: int(occurrence), severity: int(severity),
    });
  }
  if (!rows.length) return fail("empty");
  const { error } = await supabase.from("library_risks").insert(rows);
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return ok({ count: rows.length, skipped });
}
