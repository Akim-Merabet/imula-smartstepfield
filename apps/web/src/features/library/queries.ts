import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";

type SP = Record<string, string | string[] | undefined>;
export const listParam = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(",") : v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
export const textParam = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export type FamilyRef = { id: string; short_name: string; long_name: string | null; color: string };
export type Author = { first_name: string; last_name: string } | null;
export type LibraryFilters = { textSearch?: string; accounts: string[]; families: string[]; extra: string[] };

export function parseLibraryFilters(sp: SP, extraParam?: string): LibraryFilters {
  return { textSearch: textParam(sp.textSearch), accounts: listParam(sp.account), families: listParam(sp.family), extra: extraParam ? listParam(sp[extraParam]) : [] };
}

const FAMILY = "family:label_families!{fk}(id, short_name, long_name, color)";
const familyLabel = (f: { short_name: string; long_name: string | null }) => (f.long_name ? `${f.short_name} - ${f.long_name}` : f.short_name);
const like = (s: string) => `%${s.replace(/[%_,()]/g, " ")}%`;

/** Options de filtres / modales : familles enfants de la nature + comptes (applicabilité). */
export async function getLibraryOptions(nature: Enums<"label_family_nature">) {
  const supabase = await createClient();
  const [{ data: families }, { data: accounts }] = await Promise.all([
    supabase.from("label_families").select("id, short_name, long_name, color, parent_id")
      .eq("kind", "family").eq("nature", nature).eq("relative_nature", "child").eq("active", true).is("deleted_at", null)
      .is("project_id", null).order("priority").order("short_name"),
    supabase.from("accounts").select("id, name").order("name"),
  ]);
  return {
    families: (families ?? []).map((f) => ({ ...f, label: familyLabel(f) })),
    accounts: accounts ?? [],
  };
}
export type LibraryOptions = Awaited<ReturnType<typeof getLibraryOptions>>;

// ===== Risques ==================================================================
export type RiskRow = {
  id: string; name: string; source: string | null; reference: string | null; landmark: string | null; pictogram: number | null;
  major: boolean; active: boolean; account_id: string; family: FamilyRef | null; parades: { count: number }[];
};

export async function listRisks(f: LibraryFilters) {
  const supabase = await createClient();
  let q = supabase.from("library_risks")
    .select(`id, name, source, reference, landmark, pictogram, major, active, account_id, ${FAMILY.replace("{fk}", "library_risks_family_id_fkey")}, parades:library_risk_parades(count)`, { count: "exact" })
    .is("deleted_at", null);
  if (f.textSearch) q = q.or(`name.ilike.${like(f.textSearch)},source.ilike.${like(f.textSearch)},reference.ilike.${like(f.textSearch)}`);
  if (f.accounts.length) q = q.in("account_id", f.accounts);
  if (f.families.length) q = q.in("family_id", f.families);
  const [{ data, count }, { count: total }] = await Promise.all([
    q.order("name"),
    supabase.from("library_risks").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);
  return { items: (data ?? []) as unknown as RiskRow[], current: count ?? 0, total: total ?? 0 };
}

// ===== Moyens ===================================================================
export type EquipmentRow = {
  id: string; name: string; reference: string | null; provider: string | null; quantity_unit: string | null; consumable: boolean;
  subject_to_verification: boolean; validity_date: string | null; active: boolean; account_id: string; family: FamilyRef | null;
};

export async function listEquipments(f: LibraryFilters) {
  const supabase = await createClient();
  let q = supabase.from("library_equipments")
    .select(`id, name, reference, provider, quantity_unit, consumable, subject_to_verification, validity_date, active, account_id, ${FAMILY.replace("{fk}", "library_equipments_family_id_fkey")}`, { count: "exact" })
    .is("deleted_at", null);
  if (f.textSearch) q = q.or(`name.ilike.${like(f.textSearch)},reference.ilike.${like(f.textSearch)},provider.ilike.${like(f.textSearch)}`);
  if (f.accounts.length) q = q.in("account_id", f.accounts);
  if (f.families.length) q = q.in("family_id", f.families);
  const today = new Date().toISOString().slice(0, 10);
  if (f.extra.includes("subjectToVerify")) q = q.eq("subject_to_verification", true);
  if (f.extra.includes("expired")) q = q.lt("validity_date", today);
  const [{ data, count }, { count: total }] = await Promise.all([
    q.order("name"),
    supabase.from("library_equipments").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);
  return { items: (data ?? []) as unknown as EquipmentRow[], current: count ?? 0, total: total ?? 0 };
}

// ===== Objets techniques ========================================================
export type ObjectRow = {
  id: string; parent_id: string | null; name: string; item_code: string | null; external_reference: string | null;
  identification_number: string | null; object_index: string | null; updated_at: string; account_id: string;
  family: FamilyRef | null; status: { id: string; name: string; color: string } | null;
};

export async function listObjects(f: LibraryFilters) {
  const supabase = await createClient();
  const [{ data }, { count: total }] = await Promise.all([
    supabase.from("technical_objects")
      .select(`id, parent_id, name, item_code, external_reference, identification_number, object_index, updated_at, account_id,
        ${FAMILY.replace("{fk}", "technical_objects_family_id_fkey")}, status:custom_statuses(id, name, color)`)
      .is("deleted_at", null).order("name"),
    supabase.from("technical_objects").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);
  const all = (data ?? []) as unknown as ObjectRow[];
  const s = f.textSearch?.toLowerCase();
  const match = (o: ObjectRow) =>
    (!s || [o.name, o.item_code, o.external_reference, o.identification_number].some((v) => v?.toLowerCase().includes(s)))
    && (!f.accounts.length || f.accounts.includes(o.account_id))
    && (!f.families.length || (!!o.family && f.families.includes(o.family.id)))
    && (!f.extra.length || (!!o.status && f.extra.includes(o.status.id)));
  const filtered = !s && !f.accounts.length && !f.families.length && !f.extra.length;
  // Filtre : on garde les éléments correspondants et leurs ancêtres (lecture de l'arborescence).
  const byId = new Map(all.map((o) => [o.id, o]));
  const keep = new Set<string>();
  for (const o of all) {
    if (!filtered && !match(o)) continue;
    let cur: ObjectRow | undefined = o;
    while (cur && !keep.has(cur.id)) { keep.add(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
  }
  const items = all.filter((o) => keep.has(o.id));
  return { items, current: filtered ? all.length : all.filter(match).length, total: total ?? 0 };
}

export async function getObjectStatuses() {
  const supabase = await createClient();
  const { data } = await supabase.from("custom_statuses").select("id, name, color")
    .eq("nature", "technical_object").eq("active", true).order("sort_order").order("name");
  return data ?? [];
}

// ===== Étiquettes ===============================================================
export type TagRow = {
  id: string; parent_id: string | null; name: string; color: string; description: string | null; account_id: string | null;
  position: number; flows: { count: number }[]; phases: { count: number }[]; steps: { count: number }[];
};

export async function listTags(f: LibraryFilters) {
  const supabase = await createClient();
  const { data } = await supabase.from("tags")
    .select("id, parent_id, name, color, description, account_id, position, flows:flow_tags(count), phases:phase_tags(count), steps:step_tags(count)")
    .order("position").order("name");
  const all = (data ?? []) as unknown as TagRow[];
  const s = f.textSearch?.toLowerCase();
  const filtered = !s && !f.accounts.length;
  const match = (t: TagRow) => (!s || t.name.toLowerCase().includes(s))
    && (!f.accounts.length || (t.account_id ? f.accounts.includes(t.account_id) : f.accounts.includes("organization")));
  const byId = new Map(all.map((t) => [t.id, t]));
  const keep = new Set<string>();
  for (const t of all) {
    if (!filtered && !match(t)) continue;
    let cur: TagRow | undefined = t;
    while (cur && !keep.has(cur.id)) { keep.add(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
  }
  return { items: all.filter((t) => keep.has(t.id)), current: filtered ? all.length : all.filter(match).length, total: all.length };
}
