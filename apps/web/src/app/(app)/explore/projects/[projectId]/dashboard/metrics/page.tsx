import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { getProjectContext } from "@/features/projects/project-context";
import { familyLabel } from "@/features/project-dashboard/components/family-label";
import { MetricsFilters } from "@/features/project-dashboard/components/metrics-filters";
import { MetricsView } from "@/features/project-dashboard/components/metrics-view";
import { getProjectMetrics } from "@/features/project-dashboard/queries";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.metrics");
  return { title: t("title") };
}

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(",") : v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export default async function ProjectMetricsPage({ params, searchParams }: PageProps<"/explore/projects/[projectId]/dashboard/metrics">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { project } = await getProjectContext(projectId);
  const t = await getTranslations("dashboard");
  const metrics = await getProjectMetrics(projectId, { families: list(sp.family), categories: list(sp.category) });
  const opt = (f: { id: string; short_name: string; long_name: string | null; color: string }) => ({ value: f.id, label: familyLabel(f), color: f.color });

  return (
    <>
      <PageHeader
        crumbs={[
          { label: t("crumbs.entities"), href: "/explore/projects" },
          { label: project.designation, href: `/explore/projects/${projectId}/dashboard` },
          { label: t("metrics.title") },
        ]}
        title={t("metrics.title")}
      />
      <MetricsFilters families={metrics.options.families.map(opt)} categories={metrics.options.categories.map(opt)} />
      <MetricsView m={metrics} />
    </>
  );
}
