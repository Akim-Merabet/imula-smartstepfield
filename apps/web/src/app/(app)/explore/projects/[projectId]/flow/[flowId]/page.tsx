import { redirect } from "next/navigation";

export default async function FlowRoot({ params }: PageProps<"/explore/projects/[projectId]/flow/[flowId]">) {
  const { projectId, flowId } = await params;
  redirect(`/explore/projects/${projectId}/flow/${flowId}/content-view`);
}
