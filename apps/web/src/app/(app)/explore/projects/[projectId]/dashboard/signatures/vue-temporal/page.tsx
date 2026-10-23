import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/features/flows/components/coming-soon";
import { getProjectContext } from "@/features/projects/project-context";

export async function generateMetadata() {
  const t = await getTranslations("signatures");
  return { title: t("temporal.title") };
}

export default async function SignaturesTemporalPage({ params }: PageProps<"/explore/projects/[projectId]/dashboard/signatures/vue-temporal">) {
  const { projectId } = await params;
  const { project } = await getProjectContext(projectId);
  return <ComingSoon projectId={projectId} projectName={project.designation} view="temporal" section="signatures" />;
}
