import { redirect } from "next/navigation";

export default async function DashboardRoot({ params }: PageProps<"/explore/projects/[projectId]/dashboard">) {
  const { projectId } = await params;
  redirect(`/explore/projects/${projectId}/dashboard/flow-management/vue-list`);
}
