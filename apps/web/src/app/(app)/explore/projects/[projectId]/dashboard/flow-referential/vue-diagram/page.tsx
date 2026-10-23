import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { DiagramView } from "@/features/flow-views/diagram/diagram-editor";
import { listViewFlows } from "@/features/flow-views/queries";
import { getProjectContext } from "@/features/projects/project-context";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("referentials");
  return { title: t("diagram.title") };
}

/** « Liste des diagrammes référentiels » : diagrammes repris d'un sous-dossier référentiel préparé (lecture seule). */
export default async function FlowReferentialDiagramPage({ params, searchParams }: PageProps<"/explore/projects/[projectId]/dashboard/flow-referential/vue-diagram">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { project } = await getProjectContext(projectId);
  const t = await getTranslations("referentials");
  const tp = await getTranslations("projects");
  const supabase = await createClient();
  const [{ data }, flows] = await Promise.all([
    supabase.from("diagrams").select("id, name, config, document_id, read_only")
      .eq("project_id", projectId).eq("kind", "referential").order("created_at"),
    listViewFlows(projectId),
  ]);
  const diagrams = data ?? [];
  const diagram = diagrams.find((d) => d.id === sp.diagram) ?? diagrams[0] ?? null;
  return (
    <>
      <PageHeader crumbs={[
        { label: tp("crumb"), href: "/explore/projects" },
        { label: project.designation, href: `/explore/projects/${projectId}/dashboard` },
        { label: t("crumb") },
      ]} title={t("diagram.title")} subtitle={t("diagram.subtitle", { count: diagrams.length })} />
      <DiagramView projectId={projectId} diagrams={diagrams} diagram={diagram} flows={flows}
        permissions={{ add: false, edit: false, delete: false, addFlow: false }} />
    </>
  );
}
