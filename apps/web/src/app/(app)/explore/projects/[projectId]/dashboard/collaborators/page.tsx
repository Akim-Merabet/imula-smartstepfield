import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { getProjectContext } from "@/features/projects/project-context";
import { MembersFilters } from "@/features/project-dashboard/components/members-filters";
import { MembersTable } from "@/features/project-dashboard/components/members-table";
import { familyLabel } from "@/features/project-dashboard/components/family-label";
import { loadHierarchyOptions } from "@/features/project-dashboard/hierarchies";
import { listMembers } from "@/features/project-dashboard/queries";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.members");
  return { title: t("title") };
}

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(",") : v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export default async function ProjectCollaboratorsPage({ params, searchParams }: PageProps<"/explore/projects/[projectId]/dashboard/collaborators">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { project, can } = await getProjectContext(projectId);
  const t = await getTranslations("dashboard");
  const [all, hierarchies] = await Promise.all([listMembers(projectId), loadHierarchyOptions(await createClient(), projectId)]);

  const uniq = <T extends { id: string }>(items: (T | null | undefined)[]) =>
    [...new Map(items.filter((x): x is T => !!x).map((x) => [x.id, x])).values()];
  const options = {
    functions: uniq(all.map((m) => m.collaborator?.function)).map((f) => ({ value: f.id, label: familyLabel(f), color: f.color })),
    groups: uniq(all.map((m) => m.collaborator?.group)).map((f) => ({ value: f.id, label: familyLabel(f), color: f.color })),
    hierarchies: uniq(all.flatMap((m) => m.hierarchies.map((h) => h.hierarchy))).map((f) => ({ value: f.id, label: familyLabel(f), color: f.color })),
    companies: uniq(all.map((m) => m.collaborator?.company)).map((c) => ({ value: c.id, label: c.name })),
  };

  const q = typeof sp.textSearch === "string" ? sp.textSearch.toLowerCase() : "";
  const [types, roles, functions, groups, hier, companies] =
    [sp.type, sp.role, sp.function, sp.group, sp.hierarchy, sp.company].map(list);
  const members = all.filter((m) => {
    const c = m.collaborator;
    if (!c) return false;
    if (q && !`${c.first_name} ${c.last_name} ${c.trigram}`.toLowerCase().includes(q)) return false;
    if (types.length && !types.includes(c.kind)) return false;
    if (roles.length && !roles.includes(m.role)) return false;
    if (functions.length && !(c.function && functions.includes(c.function.id))) return false;
    if (groups.length && !(c.group && groups.includes(c.group.id))) return false;
    if (companies.length && !(c.company && companies.includes(c.company.id))) return false;
    if (hier.length) {
      const ids = m.hierarchies.map((h) => h.hierarchy?.id).filter(Boolean) as string[];
      if (!(hier.includes("none") && ids.length === 0) && !ids.some((id) => hier.includes(id))) return false;
    }
    return true;
  });

  return (
    <>
      <PageHeader
        crumbs={[
          { label: t("crumbs.entities"), href: "/explore/projects" },
          { label: project.designation, href: `/explore/projects/${projectId}/dashboard` },
          { label: t("members.title") },
        ]}
        title={t("members.title")}
      />
      <MembersFilters options={options} />
      <MembersTable
        projectId={projectId}
        members={members}
        total={all.length}
        hierarchies={hierarchies}
        permissions={{
          add: can("DashboardContributors", "add"),
          edit: can("DashboardContributors", "edit"),
          delete: can("DashboardContributors", "delete"),
        }}
      />
    </>
  );
}
