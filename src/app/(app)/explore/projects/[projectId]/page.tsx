import { redirect } from "next/navigation";

export default async function ProjectRoot({ params }: PageProps<"/explore/projects/[projectId]">) {
  const { projectId } = await params;
  redirect(`/explore/projects/${projectId}/dashboard/flow-management/vue-list`);
}
