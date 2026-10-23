import { getTranslations } from "next-intl/server";
import { DiagramView } from "@/features/flow-views/diagram/diagram-editor";
import { listDiagrams, listViewFlows } from "@/features/flow-views/queries";
import { FlowViewHeader } from "@/features/flow-views/view-header";
import { getProjectContext } from "@/features/projects/project-context";

export async function generateMetadata() {
  const t = await getTranslations("flows");
  return { title: t("views.diagram") };
}

export default async function FlowViewDiagramPage({ params, searchParams }: PageProps<"/explore/projects/[projectId]/dashboard/flow-management/vue-diagram">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { project, can } = await getProjectContext(projectId);
  const t = await getTranslations("flowViews.diagram");
  const [diagrams, flows] = await Promise.all([listDiagrams(projectId), listViewFlows(projectId)]);
  const diagram = diagrams.find((d) => d.id === sp.diagram) ?? diagrams[0] ?? null;
  return (
    <>
      <FlowViewHeader projectId={projectId} projectName={project.designation} view="diagram" title={t("title")}
        subtitle={t("subtitle", { count: diagrams.length })} />
      <DiagramView
        projectId={projectId}
        diagrams={diagrams}
        diagram={diagram}
        flows={flows}
        permissions={{
          add: can("FlowManagementDiagram", "add"),
          edit: can("FlowManagementDiagram", "edit"),
          delete: can("FlowManagementDiagram", "delete"),
          addFlow: can("FlowManagement", "add"),
        }}
      />
    </>
  );
}
