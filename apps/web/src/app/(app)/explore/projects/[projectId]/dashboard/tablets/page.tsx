import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { getProjectContext } from "@/features/projects/project-context";
import { TabletsTable } from "@/features/project-dashboard/components/tablets-table";
import { listProjectTablets } from "@/features/project-dashboard/queries";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.tablets");
  return { title: t("title") };
}

export default async function ProjectTabletsPage({ params }: PageProps<"/explore/projects/[projectId]/dashboard/tablets">) {
  const { projectId } = await params;
  const { project, can } = await getProjectContext(projectId);
  // Tablettes uniquement pour les entités Projet / PGAC (spec 00 §2.3).
  if (project.type !== "project" && project.type !== "pgac") redirect(`/explore/projects/${projectId}/dashboard/flow-management/vue-list`);
  const t = await getTranslations("dashboard");
  const rows = await listProjectTablets(projectId);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: t("crumbs.entities"), href: "/explore/projects" },
          { label: project.designation, href: `/explore/projects/${projectId}/dashboard` },
          { label: t("tablets.title") },
        ]}
        title={t("tablets.title")}
      />
      <TabletsTable projectId={projectId} tablets={rows.map((r) => r.tablet!)}
        permissions={{ add: can("DashboardTablets", "add"), delete: can("DashboardTablets", "delete") }} />
    </>
  );
}
