import "server-only";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { stateKey, type DocumentNature, type DocumentState, type DocumentStep, type DocumentVisa, type WordingFields, type WordingKey } from "./meta";

export type DocumentFamily = {
  id: string; short_name: string; long_name: string | null; color: string;
  wording_configuration_id: string | null; client_supervision: boolean; client_supervision_sub_index: boolean;
};
export type LastVersion = {
  id: string; index_label: string; state: DocumentState; step: DocumentStep | null; visa: DocumentVisa | null;
  diffusion_date: string | null; pdf_path: string | null; seq: number;
};
export type DocumentListItem = {
  id: string; name: string; nature: DocumentNature; source: string; origin: string; scope: string;
  ref_int: string | null; ref_ext: string | null; account_id: string; account: { name: string } | null;
  category_id: string | null; closing_category_id: string | null; linked_flow_id: string | null;
  is_large_file: boolean; library_update_available: boolean; content_disabled: boolean; actions_disabled: boolean;
  created_at: string; updated_at: string;
  family: DocumentFamily | null;
  last: LastVersion | null;
  key: WordingKey;
  generating: boolean;
  hasFile: boolean;
};

const LIST_SELECT = `id, name, nature, source, origin, scope, ref_int, ref_ext, account_id, category_id, closing_category_id, linked_flow_id,
  is_large_file, library_update_available, content_disabled, actions_disabled, created_at, updated_at,
  account:accounts(name),
  family:label_families!documents_family_id_fkey(id, short_name, long_name, color, wording_configuration_id, client_supervision, client_supervision_sub_index),
  versions:document_versions(id, index_label, state, step, visa, diffusion_date, pdf_path, seq, is_last),
  files:document_files(id)`;

type Raw = Omit<DocumentListItem, "last" | "key" | "generating" | "hasFile"> & {
  versions: (LastVersion & { is_last: boolean })[]; files: { id: string }[];
};

function shape(rows: Raw[], generating: Set<string>): DocumentListItem[] {
  return rows.map(({ versions, files, ...d }) => {
    const last = versions.find((v) => v.is_last) ?? null;
    return {
      ...d, last, key: last ? stateKey(last) : "other", generating: generating.has(d.id),
      hasFile: files.length > 0 || versions.some((v) => v.pdf_path),
    };
  });
}

/** Documents dont une génération est en cours (ligne verrouillée, état « En attente »). */
async function generatingIds(projectId: string | null) {
  const supabase = await createClient();
  let q = supabase.from("background_tasks").select("metadata").eq("kind", "document_generation").in("status", ["acknowledged", "in_progress", "to_retry"]);
  if (projectId) q = q.eq("project_id", projectId);
  const { data } = await q.limit(500);
  return new Set((data ?? []).map((t) => (t.metadata as { document_id?: string })?.document_id).filter(Boolean) as string[]);
}

export type DocumentFilters = {
  textSearch?: string; families?: string[]; categories?: string[]; closingCategories?: string[]; provenances?: string[];
  states?: string[]; flows?: string[]; accounts?: string[]; dateField?: "created" | "diffusion"; period?: string; from?: string; to?: string;
};

function periodRange(period?: string, from?: string, to?: string): [Date, Date] | null {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (period === "day") return [start, new Date(start.getTime() + 864e5)];
  if (period === "week") { const s = new Date(start); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return [s, new Date(s.getTime() + 7 * 864e5)]; }
  if (period === "month") return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
  if (period === "lastMonth") return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1)];
  if (period === "custom" && (from || to)) return [from ? new Date(from) : new Date(0), to ? new Date(new Date(to).getTime() + 864e5) : new Date(8.64e15)];
  return null;
}

function applyFilters(items: DocumentListItem[], f: DocumentFilters) {
  const q = f.textSearch?.trim().toLowerCase();
  const range = periodRange(f.period, f.from, f.to);
  return items.filter((d) => {
    if (q && !`${d.name} ${d.ref_int ?? ""} ${d.ref_ext ?? ""}`.toLowerCase().includes(q)) return false;
    if (f.families?.length && !f.families.includes(d.family?.id ?? "")) return false;
    if (f.categories?.length && !f.categories.includes(d.category_id ?? "")) return false;
    if (f.closingCategories?.length && !f.closingCategories.includes(d.closing_category_id ?? "")) return false;
    if (f.provenances?.length && !f.provenances.includes(d.origin)) return false;
    if (f.states?.length && !f.states.includes(d.key)) return false;
    if (f.flows?.length && !f.flows.includes(d.linked_flow_id ?? "")) return false;
    if (f.accounts?.length && !f.accounts.includes(d.account_id)) return false;
    if (range) {
      const raw = f.dateField === "diffusion" ? d.last?.diffusion_date : d.created_at;
      if (!raw) return false;
      const t = new Date(raw).getTime();
      if (t < range[0].getTime() || t >= range[1].getTime()) return false;
    }
    return true;
  });
}

export async function listProjectDocuments(projectId: string, filters: DocumentFilters, opts: { rfi?: boolean } = {}) {
  const supabase = await createClient();
  let query = supabase.from("documents").select(LIST_SELECT).eq("project_id", projectId).is("deleted_at", null)
    .order("position").order("name");
  query = opts.rfi ? query.eq("nature", "rfi") : query.neq("nature", "rfi");
  const [{ data, error }, generating] = await Promise.all([query, generatingIds(projectId)]);
  if (error) throw error;
  const all = shape((data ?? []) as unknown as Raw[], generating);
  return { items: applyFilters(all, filters), total: all.length };
}

export async function listLibraryDocuments(filters: DocumentFilters) {
  const supabase = await createClient();
  const [{ data, error }, generating] = await Promise.all([
    supabase.from("documents").select(LIST_SELECT).eq("scope", "library").is("deleted_at", null).order("name"),
    generatingIds(null),
  ]);
  if (error) throw error;
  const all = shape((data ?? []) as unknown as Raw[], generating);
  return { items: applyFilters(all, filters), total: all.length };
}

/** Libellés de suivi (valeur, tooltip, couleur) par configuration, dans la langue courante (repli FR puis 1re langue). */
export async function getWordings(configIds: (string | null | undefined)[]) {
  const ids = [...new Set(configIds.filter(Boolean) as string[])];
  if (!ids.length) return {} as Record<string, WordingFields>;
  const supabase = await createClient();
  const locale = await getLocale();
  const { data } = await supabase.from("wording_configuration_languages").select("wording_configuration_id, language, fields").in("wording_configuration_id", ids);
  const out: Record<string, WordingFields> = {};
  for (const id of ids) {
    const rows = (data ?? []).filter((r) => r.wording_configuration_id === id);
    const row = rows.find((r) => r.language === locale) ?? rows.find((r) => r.language === "fr") ?? rows[0];
    out[id] = (row?.fields ?? {}) as WordingFields;
  }
  return out;
}

export async function getDocumentFilterOptions(projectId: string | null) {
  const supabase = await createClient();
  const families = supabase.from("label_families").select("id, short_name, long_name, color")
    .eq("kind", "family").eq("nature", "document").eq("relative_nature", "child").is("deleted_at", null).order("priority").order("short_name");
  let categories = supabase.from("label_families").select("id, short_name, long_name, color")
    .eq("kind", "category").eq("nature", "document").is("deleted_at", null).order("priority");
  categories = projectId ? categories.eq("project_id", projectId) : categories.is("project_id", null);
  const flows = projectId
    ? supabase.from("flows").select("id, name").eq("project_id", projectId).is("deleted_at", null).order("name")
    : null;
  const [f, c, fl, accounts] = await Promise.all([families, categories, flows ?? Promise.resolve({ data: [] }),
    supabase.from("accounts").select("id, name").order("name")]);
  const label = (x: { short_name: string; long_name: string | null }) => (x.long_name ? `${x.short_name} - ${x.long_name}` : x.short_name);
  return {
    families: (f.data ?? []).map((x) => ({ value: x.id, label: label(x), color: x.color })),
    categories: (c.data ?? []).map((x) => ({ value: x.id, label: label(x), color: x.color })),
    flows: ((fl.data ?? []) as { id: string; name: string }[]).map((x) => ({ value: x.id, label: x.name })),
    accounts: (accounts.data ?? []).map((x) => ({ value: x.id, label: x.name })),
  };
}
