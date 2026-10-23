import "server-only";
import { createClient } from "@/lib/supabase/server";

const SUB_FOLDER_SELECT = `
  id, type, designation, business_ref, location_label, description, project_index, is_sub_folder, folder_id, updated_at,
  family:label_families!projects_family_id_fkey(id, short_name, long_name, color),
  status:custom_statuses!projects_custom_status_id_fkey(id, name, color),
  client:clients(id, name),
  members:project_members(role, collaborator:collaborators(id, first_name, last_name)),
  flows(count)
`;

export type SubFolderItem = Awaited<ReturnType<typeof listSubFolders>>[number];

/** Sous-dossiers référentiels d'un dossier (entités Folder avec isSubFolder). */
export async function listSubFolders(folderId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select(SUB_FOLDER_SELECT)
    .eq("folder_id", folderId).eq("is_sub_folder", true).is("deleted_at", null).is("flows.deleted_at", null)
    .order("designation").order("project_index");
  if (error) throw error;
  return (data ?? []).map((p) => ({ ...p, flowCount: (p.flows as unknown as { count: number }[])?.[0]?.count ?? 0 }));
}
