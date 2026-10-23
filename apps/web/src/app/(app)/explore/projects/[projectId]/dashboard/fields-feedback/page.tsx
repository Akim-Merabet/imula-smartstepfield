import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { FeedbackFilters } from "@/features/forms/feedback/feedback-filters";
import { FeedbackTable } from "@/features/forms/feedback/feedback-table";
import { FEEDBACK_PAGE_SIZE, getFeedbackFilterOptions, listFeedback, type FeedbackFilters as Filters } from "@/features/forms/feedback/queries";
import { getProjectContext } from "@/features/projects/project-context";

export async function generateMetadata() {
  const t = await getTranslations("nav.dashboard");
  return { title: t("fieldFeedback") };
}

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(",") : v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const SOURCES = ["webapp", "mobile", "project", "flow"] as const;

/** Entité › Remontées terrain (spec 03 §8.1). */
export default async function FieldsFeedbackPage({ params, searchParams }: PageProps<"/explore/projects/[projectId]/dashboard/fields-feedback">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { project, can } = await getProjectContext(projectId);
  const t = await getTranslations("forms.feedback");
  const tp = await getTranslations("projects");
  const tn = await getTranslations("nav.dashboard");
  const limit = Math.min(Number(sp.limit ?? FEEDBACK_PAGE_SIZE) || FEEDBACK_PAGE_SIZE, 2000);
  const dateField = sp.dateField === "updated_at" || sp.dateField === "done_at" ? sp.dateField : "created_at";
  const filters: Filters = {
    textSearch: typeof sp.textSearch === "string" ? sp.textSearch : undefined,
    flows: list(sp.flow), forms: list(sp.form), statuses: list(sp.status),
    sources: list(sp.source).filter((s): s is (typeof SOURCES)[number] => (SOURCES as readonly string[]).includes(s)),
    state: sp.state === "in_progress" || sp.state === "done" ? sp.state : "all",
    dateField, from: typeof sp.from === "string" ? sp.from : undefined, to: typeof sp.to === "string" ? sp.to : undefined, limit,
  };
  const [{ items, total }, options] = await Promise.all([listFeedback(projectId, filters), getFeedbackFilterOptions(projectId)]);

  return (
    <>
      <PageHeader
        crumbs={[{ label: tp("crumb"), href: "/explore/projects" }, { label: project.designation, href: `/explore/projects/${projectId}/dashboard` }, { label: tn("fieldFeedback") }]}
        title={t("title")} />
      <FeedbackFilters options={options} />
      <FeedbackTable projectId={projectId} items={items} total={total} limit={limit}
        permissions={{
          edit: can("DashboardFieldFeedback", "edit"), duplicate: can("DashboardFieldFeedback", "duplicate"),
          delete: can("DashboardFieldFeedback", "delete"), export: can("DashboardFieldFeedback", "export"),
        }} />
    </>
  );
}
