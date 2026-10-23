import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { ClosingFolderView } from "@/features/documents/closing/closing-folder-view";
import { getClosingCategories, listClosingFolders } from "@/features/documents/closing/queries";
import { getWordings } from "@/features/documents/queries";
import { getProjectContext } from "@/features/projects/project-context";

export async function generateMetadata() {
  const t = await getTranslations("nav.dashboard");
  return { title: t("closingFolder") };
}

/** Entité › Dossier de clôture (spec 04 §5.9). Masqué pour les entités Modèle et Référentiel. */
export default async function ClosingFolderPage({ params }: PageProps<"/explore/projects/[projectId]/dashboard/closing-folder">) {
  const { projectId } = await params;
  const { project, can } = await getProjectContext(projectId);
  if (project.type === "template" || project.type === "referential") notFound();
  const t = await getTranslations("closingFolder");
  const tp = await getTranslations("projects");
  const [folders, categories] = await Promise.all([listClosingFolders(projectId), getClosingCategories(projectId)]);
  const wordings = await getWordings([
    ...folders.map((f) => f.family?.wording_configuration_id),
    ...folders.flatMap((f) => f.sections.flatMap((s) => s.items.map((i) => i.document?.family?.wording_configuration_id))),
  ]);
  return (
    <>
      <PageHeader
        crumbs={[{ label: tp("crumb"), href: "/explore/projects" }, { label: project.designation, href: `/explore/projects/${projectId}/dashboard` }, { label: t("crumb") }]}
        title={t("title")} subtitle={t("subtitle", { count: folders.length })} />
      <ClosingFolderView folders={folders} wordings={wordings} categories={categories}
        permissions={{
          add: can("DashboardClosingFolder", "add"), edit: can("DashboardClosingFolder", "edit"),
          delete: can("DashboardClosingFolder", "delete"), generate: can("DashboardClosingFolder", "generateDocument"),
        }} />
    </>
  );
}
