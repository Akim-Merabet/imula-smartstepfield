import { getTranslations } from "next-intl/server";
import { ProjectMenu } from "@/features/projects/components/project-menu";
import { getProjectContext } from "@/features/projects/project-context";

export default async function DashboardLayout({ children, params }: LayoutProps<"/explore/projects/[projectId]/dashboard">) {
  const { projectId } = await params;
  const { project, session } = await getProjectContext(projectId);
  const t = await getTranslations("projects");
  return (
    <>
      <ProjectMenu
        project={{ id: project.id, type: project.type, designation: project.designation, typeLabel: t(`types.${project.type}`), letter: t(`letters.${project.type}`) }}
        diagramEnabled={session.organization.diagram_enabled}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6 shadow-[0_3px_6px_#00000029]">{children}</div>
    </>
  );
}
