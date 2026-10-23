import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { parseAdvancedSearch } from "@/features/flows/advanced-search";
import { FlowsFilters } from "@/features/flows/components/flows-filters";
import { FlowsTable } from "@/features/flows/components/flows-table";
import { FLOW_TYPES, FLOWS_PAGE_SIZE, creatableFlowTypes, type FlowType } from "@/features/flows/meta";
import { countFlows, getFlowOptions, listFlows } from "@/features/flows/queries";
import { getProjectContext } from "@/features/projects/project-context";

export async function generateMetadata() {
  const t = await getTranslations("flows");
  return { title: t("list.title") };
}

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(",") : v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function FlowListPage({ params, searchParams }: PageProps<"/explore/projects/[projectId]/dashboard/flow-management/vue-list">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { project, can } = await getProjectContext(projectId);
  const t = await getTranslations("flows");
  const tp = await getTranslations("projects");

  const limit = Math.min(Number(sp.limit ?? FLOWS_PAGE_SIZE) || FLOWS_PAGE_SIZE, 2000);
  const [{ items, total }, options, totalAll] = await Promise.all([
    listFlows(projectId, {
      textSearch: str(sp.textSearch),
      types: list(sp.type).filter((x): x is FlowType => (FLOW_TYPES as string[]).includes(x)),
      families: list(sp.family),
      categories: list(sp.category),
      statuses: list(sp.status),
      advanced: parseAdvancedSearch(str(sp.advancedSearch)),
      sortBy: str(sp.sortBy),
      direction: sp.direction === "asc" ? "asc" : "desc",
      limit,
    }),
    getFlowOptions(projectId),
    countFlows(projectId),
  ]);

  const types = creatableFlowTypes(project.type);
  const famLabel = (f: { short_name: string; long_name: string | null }) => (f.long_name ? `${f.short_name} - ${f.long_name}` : f.short_name);
  const memberOpts = options.members.map((m) => ({ value: m.id, label: `${m.first_name} ${m.last_name}` }));
  const tabletOpts = options.tablets.map((tb) => ({ value: tb.id, label: tb.name }));

  return (
    <>
      <PageHeader
        crumbs={[
          { label: tp("crumb"), href: "/explore/projects" },
          { label: project.designation, href: `/explore/projects/${projectId}/dashboard` },
          { label: t("crumbView", { view: t("views.list") }) },
        ]}
        title={t("list.title")}
        subtitle={t("list.subtitle", { current: items.length, total: totalAll })}
      />
      <FlowsFilters
        types={types}
        families={options.families}
        categories={options.categories}
        statuses={options.statuses}
        advanced={{
          flow_type: types.map((v) => ({ value: v, label: t(`types.${v}`) })),
          family: options.families.map((f) => ({ value: f.id, label: famLabel(f) })),
          category: options.categories.map((f) => ({ value: f.id, label: famLabel(f) })),
          status: options.statuses.map((s) => ({ value: s.id, label: s.name })),
          reporter: memberOpts,
          tablet1: tabletOpts, tablet2: tabletOpts, tablet3: tabletOpts,
        }}
      />
      <FlowsTable
        projectId={projectId}
        items={items}
        total={total}
        hasMore={items.length < total}
        limit={limit}
        statuses={options.statuses}
        reorganizeOptions={{
          categories: options.categories.map((c) => ({ value: c.id, label: famLabel(c) })),
          members: memberOpts,
          tablets: tabletOpts,
        }}
        permissions={{
          add: can("FlowManagement", "add"),
          edit: can("FlowManagement", "edit"),
          delete: can("FlowManagement", "delete"),
          duplicate: can("FlowManagement", "duplicate"),
          editStatus: can("FlowManagement", "editStatus"),
        }}
      />
    </>
  );
}
