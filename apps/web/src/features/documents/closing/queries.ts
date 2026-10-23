import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ClosingSectionType, DocumentState, DocumentStep } from "../meta";

type V = { id: string; index_label: string; state: DocumentState; step: DocumentStep | null; is_last: boolean; diffusion_date: string | null; pdf_path: string | null; seq: number };
export type ClosingItem = {
  id: string; position: number; version_id: string | null; emm_element_id: string | null;
  document: { id: string; name: string; ref_int: string | null; is_large_file: boolean; closing_category_id: string | null; family: { wording_configuration_id: string | null } | null; versions: V[] } | null;
};
export type ClosingSection = {
  id: string; type: ClosingSectionType; name: string; description: string | null; position: number; last_generated_at: string | null;
  flow: { name: string } | null; items: ClosingItem[];
};
export type ClosingFolder = {
  id: string; name: string; ref_int: string | null; ref_ext: string | null; created_at: string;
  family: { short_name: string; long_name: string | null; color: string; wording_configuration_id: string | null } | null;
  versions: V[]; sections: ClosingSection[];
};

const VERSION = "id, index_label, state, step, is_last, diffusion_date, pdf_path, seq";

/** Arbre dossier → sections → éléments (§5.9.3). */
export async function listClosingFolders(projectId: string): Promise<ClosingFolder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("documents").select(`id, name, ref_int, ref_ext, created_at,
      family:label_families!documents_family_id_fkey(short_name, long_name, color, wording_configuration_id),
      versions:document_versions(${VERSION}),
      sections:closing_sections(id, type, name, description, position, last_generated_at, flow:flows(name),
        items:closing_section_items(id, position, version_id, emm_element_id,
          document:documents(id, name, ref_int, is_large_file, closing_category_id, family:label_families!documents_family_id_fkey(wording_configuration_id), versions:document_versions(${VERSION}))))`)
    .eq("project_id", projectId).eq("nature", "rfi").is("deleted_at", null).order("created_at");
  if (error) throw error;
  return ((data ?? []) as unknown as ClosingFolder[]).map((f) => ({
    ...f,
    sections: [...f.sections].sort((a, b) => a.position - b.position).map((s) => ({ ...s, items: [...s.items].sort((a, b) => a.position - b.position) })),
  }));
}

/** Catégories « dossier de clôture » de l'entité (parents + enfants) pour la vérification. */
export async function getClosingCategories(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("label_families").select("id, short_name, long_name, parent_id, relative_nature")
    .eq("kind", "category").eq("nature", "document").eq("project_id", projectId).is("deleted_at", null).order("priority");
  return data ?? [];
}
