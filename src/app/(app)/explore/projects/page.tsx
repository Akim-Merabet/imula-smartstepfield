import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { ProjectsFilters } from "@/features/projects/components/projects-filters";
import { ProjectsTable } from "@/features/projects/components/projects-table";
import { PROJECT_TYPES, PROJECTS_PAGE_SIZE, type ProjectType } from "@/features/projects/meta";
import { getProjectFilterOptions, listProjects } from "@/features/projects/queries";

export async function generateMetadata() {
  const t = await getTranslations("projects");
  return { title: t("crumb") };
}

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(",") : v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export default async function ProjectsPage({ searchParams }: PageProps<"/explore/projects">) {
  const sp = await searchParams;
  const t = await getTranslations("projects");
  const session = await getSession();
  const ctx = { authority: session?.collaborator.authority ?? null };

  const limit = Math.min(Number(sp.limit ?? PROJECTS_PAGE_SIZE) || PROJECTS_PAGE_SIZE, 1000);
  const [{ items, total, hasMore }, options] = await Promise.all([
    listProjects({
      textSearch: typeof sp.textSearch === "string" ? sp.textSearch : undefined,
      types: list(sp.type).filter((x): x is ProjectType => (PROJECT_TYPES as string[]).includes(x)),
      state: sp.state === "hidden" || sp.state === "all" ? sp.state : "visible",
      families: list(sp.family),
      clients: list(sp.client),
      statuses: list(sp.status),
      sharing: sp.published === "public" || sp.published === "private" ? sp.published : "all",
      limit,
    }),
    getProjectFilterOptions(),
  ]);

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6 shadow-[0_3px_6px_#00000029]">
      <PageHeader
        crumbs={[{ label: t("crumb"), href: "/explore/projects" }]}
        title={t("title")}
      />
      <ProjectsFilters options={options} />
      <ProjectsTable
        items={items}
        total={total}
        hasMore={hasMore}
        limit={limit}
        permissions={{
          add: can("Projects", "add", ctx),
          publish: can("Projects", "publish", ctx),
        }}
      />
    </main>
  );
}
