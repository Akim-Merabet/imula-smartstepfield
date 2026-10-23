import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { ADVANCED_FIELDS, currentRange, type AdvancedCriterion } from "./advanced-search";
import { FLOWS_PAGE_SIZE, type FlowType } from "./meta";

export type FlowFilters = {
  textSearch?: string;
  types?: FlowType[];
  families?: string[];
  categories?: string[];
  statuses?: string[];
  advanced?: AdvancedCriterion[];
  sortBy?: string;
  direction?: "asc" | "desc";
  limit?: number;
};

const LIST_SELECT = `
  id, flow_type, name, ref_int, ref_ext, description, family_id, category_id, custom_status_id, origin, unlocked,
  location_site, location_area, location_local, elementary_system, functional_marker, technical_object_label,
  start_date, finish_date, estimated_start_date, estimated_end_date, achieved_start_date, achieved_end_date,
  updated_at, content_updated_at,
  internal_supervisor_name_1, internal_supervisor_name_2, internal_supervisor_name_3,
  external_supervisor_name_1, external_supervisor_name_2, external_supervisor_name_3,
  family:label_families!flows_family_id_fkey(id, short_name, long_name, color),
  category:label_families!flows_category_id_fkey(id, short_name, long_name, color),
  status:custom_statuses!flows_custom_status_id_fkey(id, name, color, category),
  reporter:collaborators!flows_reporter_id_fkey(id, first_name, last_name, trigram),
  tablet1:tablets!flows_tablet_1_id_fkey(id, name),
  tablet2:tablets!flows_tablet_2_id_fkey(id, name),
  tablet3:tablets!flows_tablet_3_id_fkey(id, name),
  assignees:flow_assignees(collaborator:collaborators(id, first_name, last_name, trigram)),
  collaborators:flow_collaborators(collaborator:collaborators(id, first_name, last_name, trigram)),
  tags:flow_tags(tag:tags(id, name, color))
`;

const SORTABLE = new Set(["name", "ref_int", "start_date", "finish_date", "estimated_start_date", "estimated_end_date",
  "achieved_start_date", "achieved_end_date", "updated_at"]);

const clean = (v: string) => v.replace(/[%,()*\\]/g, " ").trim();

export type FlowListItem = Awaited<ReturnType<typeof listFlows>>["items"][number];

export async function listFlows(projectId: string, filters: FlowFilters) {
  const supabase = await createClient();
  const limit = filters.limit ?? FLOWS_PAGE_SIZE;
  const sortBy = filters.sortBy && SORTABLE.has(filters.sortBy) ? filters.sortBy : "updated_at";
  let query = supabase.from("flows").select(LIST_SELECT, { count: "exact" })
    .eq("project_id", projectId).is("deleted_at", null)
    .order(sortBy, { ascending: filters.direction === "asc", nullsFirst: false })
    .order("id");

  if (filters.textSearch) {
    const q = clean(filters.textSearch);
    if (q) query = query.or(`name.ilike.%${q}%,ref_int.ilike.%${q}%,description.ilike.%${q}%,location_local.ilike.%${q}%,functional_marker.ilike.%${q}%`);
  }
  if (filters.types?.length) query = query.in("flow_type", filters.types);
  if (filters.families?.length) query = query.in("family_id", filters.families);
  if (filters.categories?.length) query = query.in("category_id", filters.categories);
  if (filters.statuses?.length) query = query.in("custom_status_id", filters.statuses);

  for (const c of filters.advanced ?? []) {
    const { column, kind } = ADVANCED_FIELDS[c.field];
    const values = c.values.map(clean).filter(Boolean);
    switch (c.op) {
      case "contains": query = query.or(values.map((v) => `${column}.ilike.%${v}%`).join(",")); break;
      case "starts_with": query = query.or(values.map((v) => `${column}.ilike.${v}%`).join(",")); break;
      case "equals": query = kind === "text" ? query.or(values.map((v) => `${column}.ilike.${v}`).join(",")) : query.in(column, values); break;
      case "not_equals": query = query.not(column, "in", `(${values.join(",")})`); break;
      case "empty": query = query.is(column, null); break;
      case "not_empty": query = query.not(column, "is", null); break;
      case "gte": query = query.gte(column, values[0]); break;
      case "lte": query = query.lte(column, `${values[0]}T23:59:59`); break;
      case "between":
        if (values[0]) query = query.gte(column, values[0]);
        if (values[1]) query = query.lte(column, `${values[1]}T23:59:59`);
        break;
      case "current_day": case "current_week": case "current_month": {
        const [from, to] = currentRange(c.op);
        query = query.gte(column, from.toISOString()).lt(column, to.toISOString());
        break;
      }
    }
  }

  const { data, count, error } = await query.range(0, limit - 1);
  if (error) throw error;
  const items = data ?? [];
  return { items, total: count ?? items.length, hasMore: (count ?? 0) > items.length };
}

/** Nombre total de flows de l'entité (sous-titre « … / {total} au total »). */
export async function countFlows(projectId: string) {
  const supabase = await createClient();
  const { count } = await supabase.from("flows").select("id", { count: "exact", head: true })
    .eq("project_id", projectId).is("deleted_at", null);
  return count ?? 0;
}

export type FlowOptions = Awaited<ReturnType<typeof getFlowOptions>>;

/** Référentiels utiles aux filtres, à la modale et à la réorganisation. */
export async function getFlowOptions(projectId: string) {
  const supabase = await createClient();
  const [families, categories, statuses, members, tablets] = await Promise.all([
    supabase.from("label_families").select("id, short_name, long_name, color, parent_id")
      .eq("kind", "family").eq("nature", "flow").eq("relative_nature", "child").eq("active", true).is("deleted_at", null)
      .order("priority").order("short_name"),
    supabase.from("label_families").select("id, short_name, long_name, color")
      .eq("kind", "category").eq("nature", "flow").eq("project_id", projectId).eq("active", true).is("deleted_at", null)
      .order("priority").order("short_name"),
    supabase.from("custom_statuses").select("id, name, color, category, is_default, link_type, label_family_id")
      .eq("nature", "flow").eq("active", true).order("sort_order"),
    supabase.from("project_members").select("role, collaborator:collaborators(id, first_name, last_name, trigram, kind)")
      .eq("project_id", projectId).order("sort_order"),
    supabase.from("project_tablets").select("tablet:tablets(id, name)").eq("project_id", projectId),
  ]);
  return {
    families: families.data ?? [],
    categories: categories.data ?? [],
    statuses: statuses.data ?? [],
    members: (members.data ?? []).flatMap((m) => (m.collaborator ? [{ ...m.collaborator, role: m.role }] : [])),
    tablets: (tablets.data ?? []).flatMap((t) => (t.tablet ? [t.tablet] : [])),
  };
}

// ===== Contenu ===================================================================

export type ProgressStatus = "todo" | "opened" | "in_progress" | "done" | "disabled";

export type ContentStep = Pick<Tables<"steps">,
  "id" | "phase_id" | "position" | "custom_number" | "exclude_numbering" | "name" | "disabled" | "disabled_comment"
  | "read_only_on_mobile_app" | "linked_flow_id" | "validated_at" | "first_opened_at"> & {
  blocks: { id: string; type: Tables<"blocks">["type"]; enabled: boolean; state: Tables<"blocks">["state"] }[];
  linked_flow: { id: string; name: string; flow_type: string } | null;
  signatureCount: number;
  progress: ProgressStatus;
};
export type ContentPhase = Pick<Tables<"phases">,
  "id" | "position" | "custom_number" | "exclude_numbering" | "name" | "disabled" | "disabled_comment"
  | "read_only_on_mobile_app" | "sequence_type" | "mandatory"> & { steps: ContentStep[]; progress: ProgressStatus };

export type FlowHeader = Tables<"flows"> & {
  status: { id: string; name: string; color: string } | null;
  family: { id: string; short_name: string; long_name: string | null; color: string } | null;
};

export async function getFlowHeader(flowId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("flows")
    .select(`*, status:custom_statuses!flows_custom_status_id_fkey(id, name, color),
      family:label_families!flows_family_id_fkey(id, short_name, long_name, color)`)
    .eq("id", flowId).is("deleted_at", null).maybeSingle();
  return data as FlowHeader | null;
}

export async function getFlowContent(flowId: string): Promise<ContentPhase[]> {
  const supabase = await createClient();
  const [phases, steps, signatures, mprSignatures, mprStatuses, responses] = await Promise.all([
    supabase.from("phases").select("id, position, custom_number, exclude_numbering, name, disabled, disabled_comment, read_only_on_mobile_app, sequence_type, mandatory")
      .eq("flow_id", flowId).order("position"),
    supabase.from("steps").select(`id, phase_id, position, custom_number, exclude_numbering, name, disabled, disabled_comment,
      read_only_on_mobile_app, linked_flow_id, validated_at, first_opened_at,
      blocks(id, type, enabled, state), linked_flow:flows!steps_linked_flow_id_fkey(id, name, flow_type)`)
      .eq("flow_id", flowId).order("position"),
    supabase.from("signatures").select("step_id").eq("flow_id", flowId).eq("disabled", false),
    supabase.from("block_multi_pr_signatures").select("item:block_multi_pr_items(block:blocks(step_id))").eq("flow_id", flowId),
    supabase.from("block_multi_pr_items").select("block:blocks(step_id)").eq("flow_id", flowId).not("custom_status_id", "is", null),
    supabase.from("form_responses").select("step_id").eq("flow_id", flowId).is("deleted_at", null),
  ]);

  const sigCount = new Map<string, number>();
  const activity = new Set<string>();
  for (const s of signatures.data ?? []) { sigCount.set(s.step_id, (sigCount.get(s.step_id) ?? 0) + 1); activity.add(s.step_id); }
  for (const s of (mprSignatures.data ?? []) as unknown as { item: { block: { step_id: string } | null } | null }[]) {
    const id = s.item?.block?.step_id;
    if (id) { sigCount.set(id, (sigCount.get(id) ?? 0) + 1); activity.add(id); }
  }
  for (const s of (mprStatuses.data ?? []) as unknown as { block: { step_id: string } | null }[]) if (s.block) activity.add(s.block.step_id);
  for (const r of responses.data ?? []) if (r.step_id) activity.add(r.step_id);

  const byPhase = new Map<string, ContentStep[]>();
  for (const s of (steps.data ?? []) as unknown as Omit<ContentStep, "signatureCount" | "progress">[]) {
    const progress: ProgressStatus = s.disabled ? "disabled" : s.validated_at ? "done"
      : activity.has(s.id) ? "in_progress" : s.first_opened_at ? "opened" : "todo";
    const list = byPhase.get(s.phase_id) ?? [];
    list.push({ ...s, signatureCount: sigCount.get(s.id) ?? 0, progress });
    byPhase.set(s.phase_id, list);
  }
  return (phases.data ?? []).map((p) => {
    const list = byPhase.get(p.id) ?? [];
    const active = list.filter((s) => s.progress !== "disabled");
    const progress: ProgressStatus = p.disabled ? "disabled"
      : active.length > 0 && active.every((s) => s.progress === "done") ? "done"
      : active.some((s) => s.progress === "in_progress" || s.progress === "done") ? "in_progress"
      : active.some((s) => s.progress === "opened") ? "opened" : "todo";
    return { ...p, steps: list, progress };
  });
}

const STEP_BLOCKS_SELECT = `
  *,
  dsi:block_dsi_configs(*),
  signatures(*, signatory:collaborators!signatures_signatory_id_fkey(id, first_name, last_name, trigram)),
  emm:block_emm_items(*, family:label_families(id, short_name, long_name, color),
    equipment:library_equipments(id, reference, provider, subject_to_verification, validity_date, consumable)),
  adr:block_adr_items(*, risk:library_risks(id, name, source, reference, landmark, pictogram, major,
    family:label_families(id, short_name, long_name, color), parades:library_risk_parades(id, name, description, pictogram, file_path, position)),
    parades:block_adr_specific_parades(*)),
  rhp:block_rhp_items(*, fn:label_families!block_rhp_items_function_family_id_fkey(id, short_name, long_name, color),
    skills:block_rhp_item_skills(skill:label_families(id, short_name, long_name))),
  mpr:block_multi_pr_items(*, status:custom_statuses(id, name, color),
    signature:block_multi_pr_signatures(*, signatory:collaborators(id, first_name, last_name, trigram))),
  objects:block_object_items(*, object:technical_objects(id, name, item_code, object_index, updated_at,
    family:label_families(id, short_name, long_name, color)))
`;

type Fam = { id: string; short_name: string; long_name: string | null; color: string } | null;
type Person = { id: string; first_name: string; last_name: string; trigram: string } | null;

export type StepBlock = Tables<"blocks"> & {
  dsi: Tables<"block_dsi_configs"> | null;
  signatures: (Tables<"signatures"> & { signatory: Person })[];
  emm: (Tables<"block_emm_items"> & { family: Fam; equipment: { id: string; reference: string | null; provider: string | null;
    subject_to_verification: boolean; validity_date: string | null; consumable: boolean } | null })[];
  adr: (Tables<"block_adr_items"> & {
    risk: { id: string; name: string; source: string | null; reference: string | null; landmark: string | null;
      pictogram: number | null; major: boolean; family: Fam;
      parades: { id: string; name: string; description: string | null; pictogram: number | null; file_path: string | null; position: number }[] } | null;
    parades: Tables<"block_adr_specific_parades">[];
  })[];
  rhp: (Tables<"block_rhp_items"> & { fn: Fam; skills: { skill: Fam }[] })[];
  mpr: (Tables<"block_multi_pr_items"> & { status: { id: string; name: string; color: string } | null;
    signature: (Tables<"block_multi_pr_signatures"> & { signatory: Person }) | null })[];
  objects: (Tables<"block_object_items"> & { object: { id: string; name: string; item_code: string | null;
    object_index: string | null; updated_at: string; family: Fam } | null })[];
};

export type StepDetail = Tables<"steps"> & { blocks: StepBlock[] };

export async function getStepDetail(stepId: string): Promise<StepDetail | null> {
  const supabase = await createClient();
  const [{ data: step }, { data: blocks }] = await Promise.all([
    supabase.from("steps").select("*").eq("id", stepId).maybeSingle(),
    supabase.from("blocks").select(STEP_BLOCKS_SELECT).eq("step_id", stepId),
  ]);
  if (!step) return null;
  const list = ((blocks ?? []) as unknown as StepBlock[]).map((b) => ({
    ...b,
    adr: [...b.adr].sort((a, c) => a.position - c.position),
    emm: [...b.emm].sort((a, c) => a.position - c.position),
    rhp: [...b.rhp].sort((a, c) => a.position - c.position),
    mpr: [...b.mpr].sort((a, c) => a.position - c.position),
    objects: [...b.objects].sort((a, c) => a.position - c.position),
  }));
  return { ...step, blocks: list };
}

/** Candidats à la signature : collaborateurs restreints (+ responsables, R2.1) ou membres de l'entité. */
export async function getSignatoryCandidates(flowId: string, projectId: string) {
  const supabase = await createClient();
  const [{ data: restricted }, { data: assignees }, { data: members }] = await Promise.all([
    supabase.from("flow_collaborators").select("collaborator:collaborators(id, first_name, last_name, trigram, profession)").eq("flow_id", flowId),
    supabase.from("flow_assignees").select("collaborator:collaborators(id, first_name, last_name, trigram, profession)").eq("flow_id", flowId),
    supabase.from("project_members").select("collaborator:collaborators(id, first_name, last_name, trigram, profession)").eq("project_id", projectId),
  ]);
  type C = { id: string; first_name: string; last_name: string; trigram: string; profession: string | null };
  const pick = (rows: { collaborator: C | null }[] | null) => (rows ?? []).flatMap((r) => (r.collaborator ? [r.collaborator] : []));
  const restrictedList = pick(restricted as never);
  const base = restrictedList.length ? [...restrictedList, ...pick(assignees as never)] : pick(members as never);
  const seen = new Set<string>();
  return { restricted: restrictedList.length > 0, candidates: base.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true))) };
}

// ===== Tableau récapitulatif des signatures (§6.4) ===============================

export async function getSignatureSummary(flowId: string) {
  const supabase = await createClient();
  const [flow, phases, steps, blocks, signatures] = await Promise.all([
    supabase.from("flows").select(`id, name, ref_int, project_id, simplified_signature_mode,
      supervision_intern_1, supervision_intern_2, supervision_intern_3, supervision_extern_1, supervision_extern_2, supervision_extern_3,
      internal_supervisor_name_1, internal_supervisor_name_2, internal_supervisor_name_3,
      external_supervisor_name_1, external_supervisor_name_2, external_supervisor_name_3`).eq("id", flowId).maybeSingle(),
    supabase.from("phases").select("id, position, custom_number, exclude_numbering, name, disabled").eq("flow_id", flowId).order("position"),
    supabase.from("steps").select("id, phase_id, position, custom_number, exclude_numbering, name, disabled").eq("flow_id", flowId).order("position"),
    supabase.from("blocks").select("id, step_id, enabled, dsi:block_dsi_configs(*)").eq("flow_id", flowId).eq("type", "dsi"),
    supabase.from("signatures").select("*, signatory:collaborators!signatures_signatory_id_fkey(id, first_name, last_name, trigram)")
      .eq("flow_id", flowId).eq("disabled", false).order("signed_at"),
  ]);
  return {
    flow: flow.data,
    phases: phases.data ?? [],
    steps: steps.data ?? [],
    blocks: (blocks.data ?? []) as unknown as { id: string; step_id: string; enabled: boolean; dsi: Tables<"block_dsi_configs"> | null }[],
    signatures: (signatures.data ?? []) as unknown as (Tables<"signatures"> & { signatory: Person })[],
  };
}

export async function listProjectFlowsLite(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("flows").select("id, name, ref_int, flow_type, family_id, category_id, custom_status_id")
    .eq("project_id", projectId).is("deleted_at", null).order("name");
  return data ?? [];
}
