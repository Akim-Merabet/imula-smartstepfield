import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";

/** En-tête commun des vues flows (fil d'Ariane Entités > entité > Flows - vue). */
export async function FlowViewHeader({ projectId, projectName, view, title, subtitle, actions }: {
  projectId: string; projectName: string; view: "plan" | "map" | "diagram" | "kanban";
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode;
}) {
  const t = await getTranslations("flows");
  const tp = await getTranslations("projects");
  return (
    <PageHeader
      crumbs={[
        { label: tp("crumb"), href: "/explore/projects" },
        { label: projectName, href: `/explore/projects/${projectId}/dashboard` },
        { label: t("crumbView", { view: t(`views.${view}`) }) },
      ]}
      title={title ?? t(`views.${view}`)}
      subtitle={subtitle}
      actions={actions}
    />
  );
}
