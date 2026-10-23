import { redirect } from "next/navigation";

export default async function FlowReferentialRoot({ params }: PageProps<"/explore/projects/[projectId]/dashboard/flow-referential">) {
  const { projectId } = await params;
  redirect(`/explore/projects/${projectId}/dashboard/flow-referential/vue-list`);
}
