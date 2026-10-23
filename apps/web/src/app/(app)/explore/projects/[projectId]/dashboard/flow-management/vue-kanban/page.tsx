import { getTranslations } from "next-intl/server";
import { KanbanBoard } from "@/features/flow-views/kanban/kanban-board";
import { listViewFlows } from "@/features/flow-views/queries";
import { FlowViewHeader } from "@/features/flow-views/view-header";
import { getFlowOptions } from "@/features/flows/queries";
import { getProjectContext } from "@/features/projects/project-context";

export async function generateMetadata() {
  const t = await getTranslations("flows");
  return { title: t("views.kanban") };
}

export default async function FlowViewKanbanPage({ params }: PageProps<"/explore/projects/[projectId]/dashboard/flow-management/vue-kanban">) {
  const { projectId } = await params;
  const { project, can } = await getProjectContext(projectId);
  const t = await getTranslations("flowViews.kanban");
  const [flows, options] = await Promise.all([listViewFlows(projectId), getFlowOptions(projectId)]);
  return (
    <>
      <FlowViewHeader projectId={projectId} projectName={project.designation} view="kanban" title={t("title")} subtitle={t("subtitle")} />
      <KanbanBoard
        projectId={projectId}
        flows={flows}
        statuses={options.statuses.map((s) => ({ id: s.id, name: s.name, color: s.color, category: s.category }))}
        canEditStatus={can("FlowManagement", "editStatus")}
      />
    </>
  );
}
