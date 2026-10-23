import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { getProjectContext } from "@/features/projects/project-context";
import { EditProjectButton } from "@/features/project-dashboard/components/edit-project-button";
import { InformationView } from "@/features/project-dashboard/components/information-view";
import { getCustomFieldValues, getCustomFields } from "@/lib/custom-fields/server";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.information");
  return { title: t("title") };
}

export default async function ProjectInformationPage({ params }: PageProps<"/explore/projects/[projectId]/dashboard/information">) {
  const { projectId } = await params;
  const { project, can } = await getProjectContext(projectId);
  const [t, tp, fields, values] = await Promise.all([
    getTranslations("dashboard"), getTranslations("projects"),
    getCustomFields("project", project.family_id), getCustomFieldValues(projectId),
  ]);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: t("crumbs.entities"), href: "/explore/projects" },
          { label: project.designation, href: `/explore/projects/${projectId}/dashboard` },
          { label: t("information.title") },
        ]}
        title={t("information.title")}
        actions={can("DashboardInformation", "edit") ? <EditProjectButton projectId={projectId} label={t("information.edit")} /> : undefined}
      />
      <InformationView project={project} fields={fields} values={values} typeLabel={tp(`types.${project.type}`)} />
    </>
  );
}
