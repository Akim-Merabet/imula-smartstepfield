import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { getProjectContext } from "@/features/projects/project-context";
import { listReferentialFlows } from "@/features/referentials/queries";
import { ReferentialList } from "@/features/referentials/referential-list";

export async function generateMetadata() {
  const t = await getTranslations("referentials");
  return { title: t("title") };
}

/** Module Référentiels d'une entité Projet / PGAC (spec 02 §3.6). */
export default async function FlowReferentialListPage({ params }: PageProps<"/explore/projects/[projectId]/dashboard/flow-referential/vue-list">) {
  const { projectId } = await params;
  const { project, can } = await getProjectContext(projectId);
  if (project.type !== "project" && project.type !== "pgac") notFound();
  const t = await getTranslations("referentials");
  const tp = await getTranslations("projects");
  const flows = await listReferentialFlows(projectId);
  return (
    <>
      <PageHeader
        crumbs={[
          { label: tp("crumb"), href: "/explore/projects" },
          { label: project.designation, href: `/explore/projects/${projectId}/dashboard` },
          { label: t("crumb") },
        ]}
        title={t("title")}
        subtitle={t("subtitle", { current: flows.length, total: flows.length })}
      />
      <ReferentialList
        projectId={projectId}
        flows={flows}
        permissions={{
          import: can("FlowReferential", "import"),
          execute: can("FlowReferential", "executeFlowRef"),
          refresh: can("FlowReferential", "edit"),
          unlock: can("FlowReferential", "unlock"),
        }}
      />
    </>
  );
}
