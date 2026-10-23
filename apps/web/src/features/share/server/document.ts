import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ResolvedShare } from "./access";

export type SharedPdf = { key: string; label: string; index: string | null; date: string | null; path: string; name: string };

/**
 * PDF consultables par le destinataire d'un partage de document : versions diffusées
 * (ou la version partagée), à défaut fichiers du document sans version. Filtré par document + entité.
 */
export async function sharedDocumentPdfs(share: ResolvedShare): Promise<SharedPdf[]> {
  if (share.kind !== "document" || !share.documentId) return [];
  const db = createAdminClient();
  const { data: doc } = await db.from("documents").select("id, name").eq("id", share.documentId)
    .eq("project_id", share.projectId).eq("organization_id", share.organizationId).is("deleted_at", null).maybeSingle();
  if (!doc) return [];
  let q = db.from("document_versions").select("id, index_label, diffusion_date, pdf_path, pdf_name, seq")
    .eq("document_id", doc.id).not("pdf_path", "is", null);
  q = share.versionId ? q.eq("id", share.versionId) : q.not("diffusion_date", "is", null);
  const { data: versions } = await q.order("seq", { ascending: false });
  let list: SharedPdf[] = (versions ?? []).map((v) => ({
    key: v.id, label: v.index_label, index: v.index_label, date: v.diffusion_date, path: v.pdf_path!, name: v.pdf_name ?? `${doc.name}-${v.index_label}.pdf`,
  }));
  if (!list.length && !share.versionId) {
    // Aucune version diffusée : dernier PDF disponible, puis fichiers du document.
    const { data: last } = await db.from("document_versions").select("id, index_label, diffusion_date, pdf_path, pdf_name")
      .eq("document_id", doc.id).not("pdf_path", "is", null).order("seq", { ascending: false }).limit(1);
    list = (last ?? []).map((v) => ({ key: v.id, label: v.index_label, index: v.index_label, date: v.diffusion_date, path: v.pdf_path!, name: v.pdf_name ?? `${doc.name}.pdf` }));
  }
  if (!list.length) {
    const { data: files } = await db.from("document_files").select("id, storage_path, name").eq("document_id", doc.id).is("version_id", null).order("position");
    list = (files ?? []).map((f) => ({ key: f.id, label: f.name, index: null, date: null, path: f.storage_path, name: f.name }));
  }
  return list;
}
