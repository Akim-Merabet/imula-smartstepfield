import { getTranslations } from "next-intl/server";
import { PlanView } from "@/features/flow-views/plan/plan-view";
import { getPlanDetail, listPlans, listViewFlows } from "@/features/flow-views/queries";
import { FlowViewHeader } from "@/features/flow-views/view-header";
import { getProjectContext } from "@/features/projects/project-context";

export async function generateMetadata() {
  const t = await getTranslations("flows");
  return { title: t("views.plan") };
}

export default async function FlowViewPlanPage({ params, searchParams }: PageProps<"/explore/projects/[projectId]/dashboard/flow-management/vue-plan">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { project, can } = await getProjectContext(projectId);
  const t = await getTranslations("flowViews.plan");
  const [plans, flows] = await Promise.all([listPlans(projectId), listViewFlows(projectId)]);
  const plan = plans.find((p) => p.id === sp.plan) ?? plans[0] ?? null;
  const detail = plan ? await getPlanDetail(plan.id) : { elements: [], links: [], milestones: [] };
  return (
    <>
      <FlowViewHeader projectId={projectId} projectName={project.designation} view="plan"
        title={t("pageTitle")} subtitle={t("subtitle", { count: flows.length })} />
      <PlanView
        projectId={projectId}
        plans={plans}
        plan={plan}
        flows={flows}
        elements={detail.elements}
        links={detail.links}
        milestones={detail.milestones}
        permissions={{
          add: can("FlowManagementPlan", "add"),
          edit: can("FlowManagementPlan", "edit"),
          delete: can("FlowManagementPlan", "delete"),
          editDates: can("FlowManagement", "edit"),
        }}
      />
    </>
  );
}
