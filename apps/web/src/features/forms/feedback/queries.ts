import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";

export type FeedbackFilters = {
  textSearch?: string;
  flows?: string[];
  forms?: string[];
  sources?: ("webapp" | "mobile" | "project" | "flow")[];
  state?: Enums<"response_state"> | "all";
  statuses?: string[];
  dateField?: "created_at" | "updated_at" | "done_at";
  from?: string;
  to?: string;
  limit?: number;
};

export const FEEDBACK_PAGE_SIZE = 100;

const SELECT = `id, reference, state, context, provenance, form_index_label, created_at, updated_at, done_at, form_id, block_link_id,
  form:forms(id, name, nature), flow:flows(id, name, ref_int), phase:phases(name, position), step:steps(name, position),
  status:custom_statuses(id, name, color, exportable), creator:collaborators!form_responses_created_by_fkey(first_name, last_name)`;

export type FeedbackItem = {
  id: string; reference: string; state: Enums<"response_state">; context: Enums<"response_context">; provenance: Enums<"event_source">;
  form_index_label: string | null; created_at: string; updated_at: string; done_at: string | null; form_id: string; block_link_id: string | null;
  form: { id: string; name: string; nature: string } | null;
  flow: { id: string; name: string; ref_int: string | null } | null;
  phase: { name: string; position: number } | null; step: { name: string; position: number } | null;
  status: { id: string; name: string; color: string; exportable: boolean } | null;
  creator: { first_name: string; last_name: string } | null;
};

/** Remontées terrain : réponses de formulaires de l'entité (spec 03 §8.1). */
export async function listFeedback(projectId: string, f: FeedbackFilters) {
  const supabase = await createClient();
  const limit = f.limit ?? FEEDBACK_PAGE_SIZE;
  let q = supabase.from("form_responses").select(SELECT, { count: "exact" })
    .eq("project_id", projectId).is("deleted_at", null).order("updated_at", { ascending: false });
  if (f.textSearch) q = q.ilike("reference", `%${f.textSearch.replace(/[%,()]/g, " ")}%`);
  if (f.flows?.length) q = q.in("flow_id", f.flows);
  if (f.forms?.length) q = q.in("form_id", f.forms);
  if (f.state && f.state !== "all") q = q.eq("state", f.state);
  if (f.statuses?.length) q = q.in("custom_status_id", f.statuses);
  if (f.sources?.length) {
    const ors: string[] = [];
    if (f.sources.includes("webapp")) ors.push("provenance.eq.webapp");
    if (f.sources.includes("mobile")) ors.push("provenance.eq.mobile");
    if (f.sources.includes("project")) ors.push("context.eq.project");
    if (f.sources.includes("flow")) ors.push("context.eq.flow");
    q = q.or(ors.join(","));
  }
  const field = f.dateField ?? "created_at";
  if (f.from) q = q.gte(field, `${f.from}T00:00:00`);
  if (f.to) q = q.lte(field, `${f.to}T23:59:59.999`);
  const { data, count, error } = await q.range(0, limit - 1);
  if (error) throw error;
  return { items: (data ?? []) as unknown as FeedbackItem[], total: count ?? 0 };
}

export async function getFeedbackFilterOptions(projectId: string) {
  const supabase = await createClient();
  const [flows, forms, statuses] = await Promise.all([
    supabase.from("flows").select("id, name, ref_int").eq("project_id", projectId).is("deleted_at", null).order("name"),
    supabase.from("forms").select("id, name").eq("project_id", projectId).is("deleted_at", null).order("name"),
    supabase.from("custom_statuses").select("id, name, color").eq("nature", "form_response").eq("active", true).order("sort_order"),
  ]);
  return { flows: flows.data ?? [], forms: forms.data ?? [], statuses: statuses.data ?? [] };
}
