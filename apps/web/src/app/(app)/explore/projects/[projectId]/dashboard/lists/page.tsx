import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ConstructionIcon } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { getProjectContext } from "@/features/projects/project-context";

export async function generateMetadata() {
  const t = await getTranslations("nav.dashboard");
  return { title: t("lists") };
}

/** Entité › Listes (spec 04 §5.10) : module distinct des documents — état vide en attendant sa livraison (tables project_lists prêtes). */
export default async function ListsPage({ params }: PageProps<"/explore/projects/[projectId]/dashboard/lists">) {
  const { projectId } = await params;
  const { project } = await getProjectContext(projectId);
  if (project.type === "template") notFound();
  const t = await getTranslations("documents.lists");
  const tp = await getTranslations("projects");
  return (
    <>
      <PageHeader crumbs={[{ label: tp("crumb"), href: "/explore/projects" }, { label: project.designation, href: `/explore/projects/${projectId}/dashboard` }, { label: t("title") }]}
        title={t("title")} />
      <Empty className="flex-1 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><ConstructionIcon /></EmptyMedia>
          <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}
