import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { DocumentsFilters } from "@/features/documents/components/documents-filters";
import { DocumentsTable } from "@/features/documents/components/documents-table";
import { parseDocumentFilters } from "@/features/documents/filters";
import { getDocumentFilterOptions, getWordings, listProjectDocuments } from "@/features/documents/queries";
import { getProjectContext } from "@/features/projects/project-context";

export async function generateMetadata() {
  const t = await getTranslations("nav.dashboard");
  return { title: t("documents") };
}

/** Entité › Documents (spec 04 §5.1). Masqué pour les entités Modèle. */
export default async function ProjectDocumentsPage({ params, searchParams }: PageProps<"/explore/projects/[projectId]/dashboard/documents">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { project, can } = await getProjectContext(projectId);
  if (project.type === "template") notFound();
  const t = await getTranslations("documents");
  const tp = await getTranslations("projects");

  const [{ items, total }, options] = await Promise.all([
    listProjectDocuments(projectId, parseDocumentFilters(sp)),
    getDocumentFilterOptions(projectId),
  ]);
  const wordings = await getWordings(items.map((d) => d.family?.wording_configuration_id));

  return (
    <>
      <PageHeader
        crumbs={[{ label: tp("crumb"), href: "/explore/projects" }, { label: project.designation, href: `/explore/projects/${projectId}/dashboard` }, { label: t("crumb") }]}
        title={t("title")} subtitle={t("subtitle", { current: items.length })} />
      <DocumentsFilters mode="project" options={options} />
      <DocumentsTable mode="project" projectId={projectId} items={items} total={total} wordings={wordings} categories={options.categories}
        permissions={{
          add: can("DashboardDocuments", "add"), edit: can("DashboardDocuments", "edit"),
          delete: can("DashboardDocuments", "delete"), import: can("DashboardDocuments", "import"),
        }} />
    </>
  );
}
