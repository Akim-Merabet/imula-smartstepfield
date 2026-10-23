import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { SignaturesViewSwitch } from "@/features/flows/signatures/view-switch";
import { SignaturesSummary, type SummaryData } from "@/features/flows/signatures/signatures-summary";
import { getSignatureSummary, listProjectFlowsLite } from "@/features/flows/queries";
import { getProjectContext } from "@/features/projects/project-context";

export async function generateMetadata() {
  const t = await getTranslations("signatures");
  return { title: t("list.title") };
}

export default async function SignaturesListPage({ params, searchParams }: PageProps<"/explore/projects/[projectId]/dashboard/signatures/vue-list">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { project } = await getProjectContext(projectId);
  const t = await getTranslations("signatures");
  const tp = await getTranslations("projects");
  const flows = await listProjectFlowsLite(projectId);
  const flowId = typeof sp.flow === "string" && flows.some((f) => f.id === sp.flow) ? sp.flow : null;
  const data = flowId ? ((await getSignatureSummary(flowId)) as unknown as SummaryData) : null;
  return (
    <>
      <PageHeader
        crumbs={[
          { label: tp("crumb"), href: "/explore/projects" },
          { label: project.designation, href: `/explore/projects/${projectId}/dashboard` },
          { label: t("crumbList") },
        ]}
        title={t("list.title")}
        actions={<SignaturesViewSwitch projectId={projectId} current="list" />}
      />
      <SignaturesSummary flows={flows.map((f) => ({ value: f.id, label: f.ref_int ? `${f.ref_int} - ${f.name}` : f.name }))} data={data} />
    </>
  );
}
