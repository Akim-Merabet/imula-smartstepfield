import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { getProjectContext } from "@/features/projects/project-context";
import { SubFoldersTable } from "@/features/projects/components/sub-folders-table";
import { listSubFolders } from "@/features/projects/folder-queries";

export async function generateMetadata({ params }: PageProps<"/explore/folder/[folderId]">) {
  const { folderId } = await params;
  const { project } = await getProjectContext(folderId);
  return { title: project.designation };
}

/** Dossier référentiel : liste de ses sous-dossiers (spec 01 §5.7). */
export default async function FolderPage({ params }: PageProps<"/explore/folder/[folderId]">) {
  const { folderId } = await params;
  const { project, can } = await getProjectContext(folderId);
  if (project.type !== "folder") notFound();
  if (project.is_sub_folder) redirect(`/explore/projects/${folderId}/dashboard`);
  const t = await getTranslations("folders");
  const tp = await getTranslations("projects");
  const items = await listSubFolders(folderId);

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6 shadow-[0_3px_6px_#00000029]">
      <PageHeader
        crumbs={[{ label: tp("crumb"), href: "/explore/projects" }, { label: project.designation }]}
        title={t("title", { name: project.designation })}
        subtitle={t("subtitle", { count: items.length, client: project.client?.name ?? "—" })}
      />
      <SubFoldersTable
        folder={{ id: project.id, designation: project.designation }}
        items={items}
        permissions={{
          add: can("ProjectFolder", "add"),
          edit: can("ProjectFolder", "edit"),
          duplicate: can("ProjectFolder", "duplicate"),
          delete: can("ProjectFolder", "delete"),
          prepare: can("ProjectFolder", "executeFlowRef"),
        }}
      />
    </main>
  );
}
