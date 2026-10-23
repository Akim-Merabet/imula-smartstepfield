import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { getProjectContext } from "@/features/projects/project-context";
import { CategorySyncButton } from "@/features/settings/components/category-sync-button";
import { FamiliesView } from "@/features/settings/components/families-view";
import { CATEGORY_NATURES } from "@/features/settings/meta";
import { listFamilies } from "@/features/settings/queries";

export async function generateMetadata() {
  const t = await getTranslations("settings.categories");
  return { title: t("projectTitle") };
}

/** Entité › Catégories (spec 01 §5.13) : catégories locales + issues des catégories par défaut. */
export default async function ProjectCategoriesPage({ params }: PageProps<"/explore/projects/[projectId]/dashboard/categories">) {
  const { projectId } = await params;
  const { project, can } = await getProjectContext(projectId);
  const t = await getTranslations("settings.categories");
  const tp = await getTranslations("projects");
  const rows = await listFamilies("category", projectId);
  return (
    <>
      <PageHeader
        crumbs={[{ label: tp("crumb"), href: "/explore/projects" }, { label: project.designation, href: `/explore/projects/${projectId}/dashboard` }, { label: t("projectTitle") }]}
        title={t("projectTitle")} subtitle={t("projectSubtitle")} />
      <FamiliesView rows={rows} scope={{ kind: "category", projectId }} natures={CATEGORY_NATURES}
        permissions={{
          add: can("DashboardCategories", "add"), edit: can("DashboardCategories", "edit"),
          delete: can("DashboardCategories", "delete"), archive: can("DashboardCategories", "edit"),
        }}
        toolbar={can("DashboardCategories", "edit") ? <CategorySyncButton projectId={projectId} /> : null} />
    </>
  );
}
