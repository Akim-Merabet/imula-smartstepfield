import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { ProjectFormsFilters } from "@/features/forms/components/project-forms-filters";
import { ProjectFormsTable } from "@/features/forms/components/project-forms-table";
import { FORM_NATURES } from "@/features/forms/meta";
import { canEditFormContent } from "@/features/forms/permissions";
import { getFormFilterOptions, listProjectForms, type FormNature } from "@/features/forms/queries";
import { getProjectContext } from "@/features/projects/project-context";

export async function generateMetadata() {
  const t = await getTranslations("nav.dashboard");
  return { title: t("forms") };
}

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(",") : v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** Entité › Formulaires (spec 03 §2.4) : formulaires importés et copies locales. */
export default async function ProjectFormsPage({ params, searchParams }: PageProps<"/explore/projects/[projectId]/dashboard/forms">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { project, can, session, role } = await getProjectContext(projectId);
  const t = await getTranslations("forms");
  const tp = await getTranslations("projects");
  const tn = await getTranslations("nav.dashboard");

  const [items, options] = await Promise.all([
    listProjectForms(projectId, {
      textSearch: typeof sp.textSearch === "string" ? sp.textSearch : undefined,
      natures: list(sp.type).filter((x): x is FormNature => (FORM_NATURES as readonly string[]).includes(x)),
      families: list(sp.family), statuses: list(sp.status),
      provenance: sp.provenance === "imported" || sp.provenance === "local" ? sp.provenance : "all",
      state: sp.state === "enabled" || sp.state === "disabled" ? sp.state : "all",
    }),
    getFormFilterOptions(),
  ]);
  const canEditLocal = canEditFormContent({ location: "project", origin: "local", nature: "local" }, session.collaborator, role);

  return (
    <>
      <PageHeader
        crumbs={[{ label: tp("crumb"), href: "/explore/projects" }, { label: project.designation, href: `/explore/projects/${projectId}/dashboard` }, { label: tn("forms") }]}
        title={t("projectTitle")} />
      <ProjectFormsFilters options={options} />
      <ProjectFormsTable
        projectId={projectId}
        items={items}
        permissions={{
          import: can("DashboardForms", "import"),
          edit: can("DashboardForms", "edit"),
          editContent: canEditLocal,
          duplicate: can("DashboardForms", "duplicate"),
          deactivate: can("DashboardForms", "deactivate"),
          delete: can("DashboardForms", "delete"),
          reply: can("FormResponse", "add"),
        }}
      />
    </>
  );
}
