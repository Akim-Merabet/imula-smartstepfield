import { redirect } from "next/navigation";

export default async function FlowManagementRoot({ params }: PageProps<"/explore/projects/[projectId]/dashboard/flow-management">) {
  const { projectId } = await params;
  redirect(`/explore/projects/${projectId}/dashboard/flow-management/vue-list`);
}
