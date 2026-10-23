import "server-only";
import { createClient } from "@/lib/supabase/server";

export const TRASH_NATURES = ["entity", "flow", "category", "form", "form_response"] as const;
export type TrashNature = (typeof TRASH_NATURES)[number];
export type TrashItem = { id: string; nature: TrashNature; name: string; deletedAt: string; deletedBy: string | null; userName: string | null; context: string | null };

export const TRASH_RETENTION_DAYS = 30;

/** Corbeille : éléments supprimés depuis moins de 30 jours (spec 01 §6.15). */
export async function listTrash(): Promise<TrashItem[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - TRASH_RETENTION_DAYS * 86400_000).toISOString();
  const [projects, flows, forms, responses, categories] = await Promise.all([
    supabase.from("projects").select("id, designation, deleted_at, deleted_by").not("deleted_at", "is", null).gte("deleted_at", since),
    supabase.from("flows").select("id, name, deleted_at, deleted_by, project:projects(designation)").not("deleted_at", "is", null).gte("deleted_at", since),
    supabase.from("forms").select("id, name, deleted_at, updated_by, project:projects(designation)").not("deleted_at", "is", null).gte("deleted_at", since),
    supabase.from("form_responses").select("id, reference, deleted_at, deleted_by, project:projects(designation)").not("deleted_at", "is", null).gte("deleted_at", since),
    supabase.from("label_families").select("id, short_name, long_name, deleted_at, deleted_by, project:projects!label_families_project_id_fkey(designation)")
      .eq("kind", "category").not("deleted_at", "is", null).gte("deleted_at", since),
  ]);
  type Ctx = { project?: { designation: string } | null };
  const ctx = (r: Ctx) => r.project?.designation ?? null;
  const items: Omit<TrashItem, "userName">[] = [
    ...(projects.data ?? []).map((r) => ({ id: r.id, nature: "entity" as const, name: r.designation, deletedAt: r.deleted_at!, deletedBy: r.deleted_by, context: null })),
    ...(flows.data ?? []).map((r) => ({ id: r.id, nature: "flow" as const, name: r.name, deletedAt: r.deleted_at!, deletedBy: r.deleted_by, context: ctx(r as Ctx) })),
    ...(forms.data ?? []).map((r) => ({ id: r.id, nature: "form" as const, name: r.name, deletedAt: r.deleted_at!, deletedBy: r.updated_by, context: ctx(r as Ctx) })),
    ...(responses.data ?? []).map((r) => ({ id: r.id, nature: "form_response" as const, name: r.reference, deletedAt: r.deleted_at!, deletedBy: r.deleted_by, context: ctx(r as Ctx) })),
    ...(categories.data ?? []).map((r) => ({
      id: r.id, nature: "category" as const, name: r.long_name ? `${r.short_name} - ${r.long_name}` : r.short_name,
      deletedAt: r.deleted_at!, deletedBy: r.deleted_by, context: ctx(r as Ctx),
    })),
  ];
  const userIds = [...new Set(items.map((i) => i.deletedBy).filter(Boolean) as string[])];
  const { data: users } = userIds.length
    ? await supabase.from("collaborators").select("id, first_name, last_name").in("id", userIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] };
  const names = new Map((users ?? []).map((u) => [u.id, `${u.first_name} ${u.last_name}`]));
  return items
    .map((i) => ({ ...i, userName: i.deletedBy ? names.get(i.deletedBy) ?? null : null }))
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}
