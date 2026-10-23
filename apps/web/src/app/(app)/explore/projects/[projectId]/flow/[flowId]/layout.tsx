import { notFound } from "next/navigation";
import { RegisterPageBack } from "@/components/shell/page-actions";
import { FlowBanner } from "@/features/flows/content/flow-banner";
import { getFlowHeader } from "@/features/flows/queries";
import { getProjectContext } from "@/features/projects/project-context";

/** Éditeur de contenu d'un flow (hors tableau de bord) : bandeau + onglets Contenu / Séquencement (spec 02 §4.1). */
export default async function FlowLayout({ children, params }: LayoutProps<"/explore/projects/[projectId]/flow/[flowId]">) {
  const { projectId, flowId } = await params;
  const { project, can } = await getProjectContext(projectId);
  const flow = await getFlowHeader(flowId);
  if (!flow || flow.project_id !== projectId) notFound();
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6">
      <RegisterPageBack href={`/explore/projects/${projectId}/dashboard/flow-management/vue-list`} />
      <FlowBanner
        project={{ id: project.id, designation: project.designation }}
        flow={{ id: flow.id, name: flow.name, ref_int: flow.ref_int, flow_type: flow.flow_type, status: flow.status, family: flow.family, description: flow.description, location_local: flow.location_local, functional_marker: flow.functional_marker }}
        permissions={{
          editFlow: can("FlowManagement", "edit"),
          validation: can("FlowBlockValidation", "edit"),
          reset: can("FlowContent", "reset"),
        }}
      />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </main>
  );
}
