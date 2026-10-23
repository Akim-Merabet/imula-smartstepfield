import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProjectMenu } from "@/features/projects/components/project-menu";
import { getProjectContext } from "@/features/projects/project-context";
import { AccessHistoryTracker } from "@/features/projects/components/access-history";

export default async function DashboardLayout({ children, params }: LayoutProps<"/explore/projects/[projectId]/dashboard">) {
  const { projectId } = await params;
  const { project, session } = await getProjectContext(projectId);
  // Un dossier référentiel s'ouvre sur la liste de ses sous-dossiers (spec 01 §5.4).
  if (project.type === "folder" && !project.is_sub_folder) redirect(`/explore/folder/${projectId}`);
  const t = await getTranslations("projects");
  return (
    <>
      <ProjectMenu
        project={{
          id: project.id, type: project.type, designation: project.designation,
          typeLabel: project.is_sub_folder ? t("subFolderType") : t(`types.${project.type}`), letter: t(`letters.${project.type}`),
          folderId: project.is_sub_folder ? project.folder_id : null,
        }}
        diagramEnabled={session.organization.diagram_enabled}
      />
      <AccessHistoryTracker projectId={project.id} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6 shadow-[0_3px_6px_#00000029]">{children}</div>
    </>
  );
}
