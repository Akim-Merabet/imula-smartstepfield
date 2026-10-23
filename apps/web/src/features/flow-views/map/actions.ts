"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

const ICONS = ["default", "without_icon", "truck", "snowplow", "warehouse", "archive", "hard_hat", "toolbox", "rocket", "caravan"] as const;
const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const geometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: position }),
  z.object({ type: z.literal("LineString"), coordinates: z.array(position).min(2).max(5000) }),
  z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(position).min(4).max(5000)).length(1) }),
]);

const geoSchema = z.object({
  kind: z.enum(["point", "polygon", "polyline", "circle"]),
  geojson: geometrySchema,
  label: z.string().trim().max(255).nullable().optional(),
  icon: z.enum(ICONS).optional(),
  flow_id: z.string().uuid().nullable().optional(),
  altitude: z.number().finite().nullable().optional(),
  radius_m: z.number().positive().max(1_000_000).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});
export type GeometryInput = z.infer<typeof geoSchema>;

const revalidate = (projectId: string) => revalidatePath(`/explore/projects/${projectId}/dashboard/flow-management/vue-map`);

async function geometryProject(id: string, table: "flow_geometries" | "project_geojson_layers") {
  const supabase = await createClient();
  const { data } = await supabase.from(table).select("project_id").eq("id", id).maybeSingle();
  return data?.project_id ?? null;
}

async function checkFlow(projectId: string, flowId: string | null | undefined) {
  if (!flowId) return true;
  const supabase = await createClient();
  const { count } = await supabase.from("flows").select("id", { count: "exact", head: true }).eq("id", flowId).eq("project_id", projectId);
  return !!count;
}

export async function createGeometry(projectId: string, input: GeometryInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("FlowManagementMap", "add", projectId);
  if ("error" in auth) return fail(auth.error);
  const parsed = geoSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  if (!(await checkFlow(projectId, parsed.data.flow_id))) return fail("invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.from("flow_geometries")
    .insert({ ...parsed.data, geojson: parsed.data.geojson as unknown as Json, project_id: projectId }).select("id").single();
  if (error || !data) return fail(dbError(error));
  revalidate(projectId);
  return ok({ id: data.id });
}

export async function updateGeometry(id: string, input: Partial<GeometryInput>): Promise<ActionResult> {
  const projectId = await geometryProject(id, "flow_geometries");
  if (!projectId) return fail("not_found");
  const auth = await authorize("FlowManagementMap", "edit", projectId);
  if ("error" in auth) return fail(auth.error);
  const parsed = geoSchema.partial().safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  if (!(await checkFlow(projectId, parsed.data.flow_id))) return fail("invalid");
  const supabase = await createClient();
  const { geojson, ...rest } = parsed.data;
  const { error } = await supabase.from("flow_geometries")
    .update({ ...rest, ...(geojson ? { geojson: geojson as unknown as Json } : {}) }).eq("id", id);
  if (error) return fail(dbError(error));
  revalidate(projectId);
  return ok(undefined);
}

export async function deleteGeometry(id: string): Promise<ActionResult> {
  const projectId = await geometryProject(id, "flow_geometries");
  if (!projectId) return fail("not_found");
  const auth = await authorize("FlowManagementMap", "delete", projectId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { error } = await supabase.from("flow_geometries").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidate(projectId);
  return ok(undefined);
}

// ===== Couches GeoJSON =================================================================

const GEOJSON_TYPES = ["FeatureCollection", "Feature", "Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", "GeometryCollection"];
const layerSchema = z.object({
  name: z.string().trim().min(1).max(255),
  file_name: z.string().max(255).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  visible: z.boolean(),
  data: z.record(z.string(), z.unknown()).refine((d) => GEOJSON_TYPES.includes(String(d.type)), "invalid_geojson"),
});

export async function createLayer(projectId: string, input: z.infer<typeof layerSchema>): Promise<ActionResult> {
  const auth = await authorize("FlowManagementMap", "add", projectId);
  if ("error" in auth) return fail(auth.error);
  const parsed = layerSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_geojson");
  if (JSON.stringify(parsed.data.data).length > 5_000_000) return fail("too_large");
  const supabase = await createClient();
  const { error } = await supabase.from("project_geojson_layers")
    .insert({ ...parsed.data, data: parsed.data.data as Json, project_id: projectId, created_by: auth.session.collaborator.id });
  if (error) return fail(dbError(error));
  revalidate(projectId);
  return ok(undefined);
}

export async function updateLayer(id: string, patch: { color?: string; visible?: boolean; locked?: boolean }): Promise<ActionResult> {
  const projectId = await geometryProject(id, "project_geojson_layers");
  if (!projectId) return fail("not_found");
  const auth = await authorize("FlowManagementMap", "edit", projectId);
  if ("error" in auth) return fail(auth.error);
  const parsed = z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), visible: z.boolean().optional(), locked: z.boolean().optional() }).safeParse(patch);
  if (!parsed.success) return fail("invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("project_geojson_layers").update(parsed.data).eq("id", id);
  if (error) return fail(dbError(error));
  revalidate(projectId);
  return ok(undefined);
}

export async function deleteLayer(id: string): Promise<ActionResult> {
  const projectId = await geometryProject(id, "project_geojson_layers");
  if (!projectId) return fail("not_found");
  const auth = await authorize("FlowManagementMap", "delete", projectId);
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: layer } = await supabase.from("project_geojson_layers").select("locked").eq("id", id).maybeSingle();
  if (layer?.locked) return fail("locked");
  const { error } = await supabase.from("project_geojson_layers").delete().eq("id", id);
  if (error) return fail(dbError(error));
  revalidate(projectId);
  return ok(undefined);
}
