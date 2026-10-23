"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import { authorizeFlow, revalidateFlow } from "@/features/flows/server-utils";

const planSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(4000).nullable().optional(),
  scale: z.enum(["default", "temporal", "scheduling"]),
});
export type PlanInput = z.infer<typeof planSchema>;

const milestoneSchema = z.object({
  name: z.string().trim().min(1).max(255),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: z.string().trim().max(4000).nullable().optional(),
});
export type MilestoneInput = z.infer<typeof milestoneSchema>;

const revalidate = (projectId: string) => revalidatePath(`/explore/projects/${projectId}/dashboard/flow-management/vue-plan`);

async function planProject(planId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("plans").select("id, project_id").eq("id", planId).maybeSingle();
  return data?.project_id ?? null;
}

export async function createPlan(projectId: string, input: PlanInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("FlowManagementPlan", "add", projectId);
  if ("error" in auth) return fail(auth.error);
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const supabase = await createClient();
  const { data, error } = await supabase.from("plans")
    .insert({ ...parsed.data, project_id: projectId, created_by: auth.session.collaborator.id }).select("id").single();
  if (error || !data) return fail(dbError(error));
  revalidate(projectId);
  return ok({ id: data.id });
}

export async function updatePlan(planId: string, input: PlanInput): Promise<ActionResult> {
  const projectId = await planProject(planId);
  if (!projectId) return fail("not_found");
  const auth = await authorize("FlowManagementPlan", "edit", projectId);
  if ("error" in auth) return fail(auth.error);
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const supabase = await createClient();
  const { error } = await supabase.from("plans").update(parsed.data).eq("id", planId);
  if (error) return fail(dbError(error));
  revalidate(projectId);
  return ok(undefined);
}

export async function deletePlan(planId: string): Promise<ActionResult> {
  const projectId = await planProject(planId);
  if (!projectId) return fail("not_found");
  const auth = await authorize("FlowManagementPlan", "delete", projectId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from("plans").delete().eq("id", planId);
  if (error) return fail(dbError(error));
  revalidate(projectId);
  return ok(undefined);
}

/** Déplacer / redimensionner une barre = dates prévues du flow (§3.4). */
export async function updateFlowPlanDates(flowId: string, start: string, end: string): Promise<ActionResult> {
  const auth = await authorizeFlow("FlowManagement", "edit", flowId);
  if ("error" in auth) return fail(auth.error);
  const s = new Date(start), e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return fail("invalid_dates");
  const supabase = await createClient();
  const { error } = await supabase.from("flows")
    .update({ estimated_start_date: s.toISOString(), estimated_end_date: e.toISOString(), updated_by: auth.session.collaborator.id })
    .eq("id", flowId);
  if (error) return fail(dbError(error));
  revalidateFlow(auth.flow.project_id, flowId);
  return ok(undefined);
}

async function ensureElements(planId: string, projectId: string, flowIds: string[]) {
  const supabase = await createClient();
  const { data: existing } = await supabase.from("plan_elements").select("id, flow_id").eq("plan_id", planId).in("flow_id", flowIds);
  const map = new Map((existing ?? []).map((e) => [e.flow_id as string, e.id]));
  const missing = flowIds.filter((id) => !map.has(id));
  if (missing.length) {
    const { data, error } = await supabase.from("plan_elements")
      .insert(missing.map((flow_id) => ({ plan_id: planId, project_id: projectId, flow_id }))).select("id, flow_id");
    if (error) throw error;
    for (const e of data ?? []) map.set(e.flow_id as string, e.id);
  }
  return map;
}

/** Échelle temporelle : ajouter des flows existants au plan. */
export async function addPlanFlows(planId: string, flowIds: string[]): Promise<ActionResult<{ count: number }>> {
  const projectId = await planProject(planId);
  if (!projectId) return fail("not_found");
  const auth = await authorize("FlowManagementPlan", "edit", projectId);
  if ("error" in auth) return fail(auth.error);
  if (!flowIds.length) return fail("no_selection");
  try { await ensureElements(planId, projectId, [...new Set(flowIds)]); } catch (e) { return fail(dbError(e as never)); }
  revalidate(projectId);
  return ok({ count: flowIds.length });
}

export async function removePlanFlow(planId: string, flowId: string): Promise<ActionResult> {
  const projectId = await planProject(planId);
  if (!projectId) return fail("not_found");
  const auth = await authorize("FlowManagementPlan", "edit", projectId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from("plan_elements").delete().eq("plan_id", planId).eq("flow_id", flowId);
  if (error) return fail(dbError(error));
  revalidate(projectId);
  return ok(undefined);
}

/** Dépendance entre deux barres (fin → début ou début → fin). */
export async function createPlanLink(planId: string, fromFlowId: string, toFlowId: string, type: "end_start" | "start_end"): Promise<ActionResult> {
  const projectId = await planProject(planId);
  if (!projectId) return fail("not_found");
  const auth = await authorize("FlowManagementPlan", "edit", projectId);
  if ("error" in auth) return fail(auth.error);
  if (fromFlowId === toFlowId || !["end_start", "start_end"].includes(type)) return fail("invalid");
  const supabase = await createClient();
  let map: Map<string, string>;
  try { map = await ensureElements(planId, projectId, [fromFlowId, toFlowId]); } catch (e) { return fail(dbError(e as never)); }
  const from = map.get(fromFlowId)!, to = map.get(toFlowId)!;
  const { count } = await supabase.from("plan_element_links").select("id", { count: "exact", head: true })
    .or(`and(from_element_id.eq.${from},to_element_id.eq.${to}),and(from_element_id.eq.${to},to_element_id.eq.${from})`);
  if (count) return fail("link_exists");
  const { error } = await supabase.from("plan_element_links")
    .insert({ plan_id: planId, project_id: projectId, from_element_id: from, to_element_id: to, dependency_type: type });
  if (error) return fail(error.code === "23505" ? "link_exists" : dbError(error));
  revalidate(projectId);
  return ok(undefined);
}

export async function deletePlanLink(linkId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: link } = await supabase.from("plan_element_links").select("project_id").eq("id", linkId).maybeSingle();
  if (!link) return fail("not_found");
  const auth = await authorize("FlowManagementPlan", "edit", link.project_id);
  if ("error" in auth) return fail(auth.error);
  const { error } = await supabase.from("plan_element_links").delete().eq("id", linkId);
  if (error) return fail(dbError(error));
  revalidate(link.project_id);
  return ok(undefined);
}

export async function saveMilestone(planId: string, milestoneId: string | null, input: MilestoneInput): Promise<ActionResult> {
  const projectId = await planProject(planId);
  if (!projectId) return fail("not_found");
  const auth = await authorize("FlowManagementPlan", "edit", projectId);
  if ("error" in auth) return fail(auth.error);
  const parsed = milestoneSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const supabase = await createClient();
  const { error } = milestoneId
    ? await supabase.from("plan_milestones").update(parsed.data).eq("id", milestoneId).eq("plan_id", planId)
    : await supabase.from("plan_milestones").insert({ ...parsed.data, plan_id: planId, project_id: projectId });
  if (error) return fail(dbError(error));
  revalidate(projectId);
  return ok(undefined);
}

export async function deleteMilestone(milestoneId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: m } = await supabase.from("plan_milestones").select("project_id").eq("id", milestoneId).maybeSingle();
  if (!m) return fail("not_found");
  const auth = await authorize("FlowManagementPlan", "edit", m.project_id);
  if ("error" in auth) return fail(auth.error);
  const { error } = await supabase.from("plan_milestones").delete().eq("id", milestoneId);
  if (error) return fail(dbError(error));
  revalidate(m.project_id);
  return ok(undefined);
}
