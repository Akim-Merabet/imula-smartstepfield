import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";

type Fam = { id: string; short_name: string; long_name: string | null; color: string } | null;

export type MemberRow = {
  collaborator_id: string;
  role: Enums<"team_role">;
  sort_order: number;
  collaborator: {
    id: string; kind: Enums<"collaborator_kind">; first_name: string; last_name: string; trigram: string;
    authority: Enums<"authority"> | null; status: Enums<"collaborator_status">; complement: string | null;
    function: Fam; group: Fam; legal: Fam; contract: Fam;
    company: { id: string; name: string; is_parent_company: boolean } | null;
    account: { id: string; name: string } | null;
  } | null;
  hierarchies: { hierarchy: Fam }[];
};

const FAM = "id, short_name, long_name, color";

/** Membres d'une entité (rôle d'équipe + fiche collaborateur + hiérarchies). */
export async function listMembers(projectId: string): Promise<MemberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_members")
    .select(`collaborator_id, role, sort_order,
      collaborator:collaborators(id, kind, first_name, last_name, trigram, authority, status, complement,
        function:label_families!collaborators_function_id_fkey(${FAM}),
        group:label_families!collaborators_group_id_fkey(${FAM}),
        legal:label_families!collaborators_legal_id_fkey(${FAM}),
        contract:label_families!collaborators_contract_type_id_fkey(${FAM}),
        company:companies(id, name, is_parent_company),
        account:accounts(id, name)),
      hierarchies:project_member_hierarchies(hierarchy:label_families(${FAM}))`)
    .eq("project_id", projectId)
    .order("sort_order").order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as MemberRow[];
}

export type ProjectTabletRow = {
  tablet: {
    id: string; name: string; nature: Enums<"tablet_nature">; status: Enums<"tablet_status">;
    battery_level: number | null; last_latitude: number | null; last_longitude: number | null;
    family: Fam; company: { id: string; name: string } | null;
  } | null;
};

export async function listProjectTablets(projectId: string): Promise<ProjectTabletRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_tablets")
    .select(`tablet:tablets(id, name, nature, status, battery_level, last_latitude, last_longitude,
      family:label_families!tablets_family_id_fkey(${FAM}), company:companies(id, name))`)
    .eq("project_id", projectId).order("created_at");
  if (error) throw error;
  return ((data ?? []) as unknown as ProjectTabletRow[]).filter((r) => r.tablet);
}

/** Indicateurs d'avancement d'une entité (spec 01 §5.10), agrégés côté serveur. */
export async function getProjectMetrics(projectId: string, filters: { families: string[]; categories: string[] }) {
  const supabase = await createClient();
  let flowQuery = supabase.from("flows")
    .select("id, flow_type, family_id, category_id, status:custom_statuses(id, name, color, category, sort_order)")
    .eq("project_id", projectId).is("deleted_at", null);
  if (filters.families.length) flowQuery = flowQuery.in("family_id", filters.families);
  if (filters.categories.length) flowQuery = flowQuery.in("category_id", filters.categories);

  const [{ data: flowsData }, { count: membersCount }, familyOpts, categoryOpts] = await Promise.all([
    flowQuery,
    supabase.from("project_members").select("collaborator_id", { count: "exact", head: true }).eq("project_id", projectId),
    supabase.from("label_families").select(FAM).eq("kind", "family").eq("nature", "flow").eq("relative_nature", "child")
      .is("deleted_at", null).order("priority").order("short_name"),
    supabase.from("label_families").select(FAM).eq("kind", "category").eq("nature", "flow").eq("project_id", projectId)
      .is("deleted_at", null).order("priority").order("short_name"),
  ]);
  type FlowRow = { id: string; flow_type: string; status: { id: string; name: string; color: string; category: Enums<"status_category">; sort_order: number } | null };
  const flows = (flowsData ?? []) as unknown as FlowRow[];
  const ids = flows.map((f) => f.id);

  const [blocksRes, signaturesRes] = ids.length
    ? await Promise.all([
        supabase.from("blocks").select("flow_id, type, state, enabled").in("flow_id", ids),
        supabase.from("signatures").select("flow_id, state, source, contributor_type, disabled").in("flow_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const blocks = (blocksRes.data ?? []) as { flow_id: string; type: Enums<"block_type">; state: Enums<"block_state">; enabled: boolean }[];
  const signatures = ((signaturesRes.data ?? []) as { flow_id: string; state: Enums<"signature_state">; source: Enums<"event_source">; contributor_type: Enums<"contributor_type">; disabled: boolean }[])
    .filter((s) => !s.disabled);

  const byStatus = new Map<string, { id: string; name: string; color: string; count: number; order: number }>();
  const byCategory: Record<string, number> = {};
  const byFlowType: Record<string, number> = {};
  for (const f of flows) {
    const key = f.status?.id ?? "none";
    const cur = byStatus.get(key) ?? { id: key, name: f.status?.name ?? "", color: f.status?.color ?? "#9e9e9e", count: 0, order: f.status?.sort_order ?? 9999 };
    cur.count++;
    byStatus.set(key, cur);
    const cat = f.status?.category ?? "none";
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    byFlowType[f.flow_type] = (byFlowType[f.flow_type] ?? 0) + 1;
  }

  const enabledBlocks = blocks.filter((b) => b.enabled);
  const blockStates: Record<string, number> = {};
  const blockTypes: Record<string, { blocks: number; flows: Set<string> }> = {};
  for (const b of enabledBlocks) {
    blockStates[b.state] = (blockStates[b.state] ?? 0) + 1;
    const cur = blockTypes[b.type] ?? { blocks: 0, flows: new Set<string>() };
    cur.blocks++; cur.flows.add(b.flow_id);
    blockTypes[b.type] = cur;
  }

  const signed = signatures.filter((s) => s.state === "signed");
  return {
    flowsTotal: flows.length,
    flowsByStatus: [...byStatus.values()].sort((a, b) => a.order - b.order),
    flowsByCategory: byCategory,
    flowsByType: byFlowType,
    blocksTotal: enabledBlocks.length,
    blockStates,
    blockTypes: Object.fromEntries(Object.entries(blockTypes).map(([k, v]) => [k, { blocks: v.blocks, flows: v.flows.size }])),
    signatures: {
      total: signatures.length,
      signed: signed.length,
      mobile: signed.filter((s) => s.source === "mobile").length,
      web: signed.filter((s) => s.source !== "mobile").length,
      intern: signed.filter((s) => s.contributor_type === "intern").length,
      extern: signed.filter((s) => s.contributor_type === "extern").length,
      notListed: signed.filter((s) => s.contributor_type === "not_listed_intern").length,
    },
    membersCount: membersCount ?? 0,
    options: { families: familyOpts.data ?? [], categories: categoryOpts.data ?? [] },
  };
}

export type ProjectMetrics = Awaited<ReturnType<typeof getProjectMetrics>>;
