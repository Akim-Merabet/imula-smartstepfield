import { redirect } from "next/navigation";

export default async function SignaturesRoot({ params }: PageProps<"/explore/projects/[projectId]/dashboard/signatures">) {
  const { projectId } = await params;
  redirect(`/explore/projects/${projectId}/dashboard/signatures/vue-list`);
}
