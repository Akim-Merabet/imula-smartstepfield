import { getTranslations } from "next-intl/server";
import { ConstructionIcon } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** État vide « bientôt disponible » des vues non livrées (plan, carte, diagramme, kanban, vue temporelle). */
export async function ComingSoon({ projectId, projectName, view, section = "flows" }: {
  projectId: string; projectName: string; view: string; section?: "flows" | "signatures";
}) {
  const t = await getTranslations("flows");
  const tp = await getTranslations("projects");
  const ts = await getTranslations("signatures");
  const label = section === "flows" ? t(`views.${view}` as never) : ts("temporal.title");
  return (
    <>
      <PageHeader
        crumbs={[
          { label: tp("crumb"), href: "/explore/projects" },
          { label: projectName, href: `/explore/projects/${projectId}/dashboard` },
          { label: section === "flows" ? t("crumbView", { view: label }) : ts("crumbTemporal") },
        ]}
        title={label}
      />
      <Empty className="flex-1 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><ConstructionIcon /></EmptyMedia>
          <EmptyTitle>{t("comingSoon.title")}</EmptyTitle>
          <EmptyDescription>{t("comingSoon.description")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}
