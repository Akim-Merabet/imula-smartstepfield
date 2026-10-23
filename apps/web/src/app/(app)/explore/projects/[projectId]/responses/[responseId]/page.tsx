import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getProjectContext } from "@/features/projects/project-context";
import { ResponseView } from "@/features/forms/response/components/response-view";
import { loadResponsePage } from "@/features/forms/response/queries";
import type { DynamicCtx } from "@/features/forms/response/engine/values";

export async function generateMetadata() {
  const t = await getTranslations("responses");
  return { title: t("title") };
}

export default async function ResponsePage({ params, searchParams }: PageProps<"/explore/projects/[projectId]/responses/[responseId]">) {
  const { projectId, responseId } = await params;
  const sp = await searchParams;
  const { session, can } = await getProjectContext(projectId);
  const data = await loadResponsePage(responseId);
  if (!data || data.response.project_id !== projectId) notFound();
  const { collaborator, organization } = session;
  const returnTo = typeof sp.returnTo === "string" && sp.returnTo.startsWith("/") ? sp.returnTo : `/explore/projects/${projectId}/dashboard/fields-feedback`;

  return (
    <ResponseView
      key={data.response.id}
      response={{ ...data.response, dynamic_context: (data.response.dynamic_context ?? {}) as DynamicCtx }}
      definition={data.definition}
      items={data.items}
      stored={data.stored}
      formName={data.formName}
      family={data.family}
      link={data.link}
      flow={data.flow}
      statuses={data.statuses}
      members={data.members}
      historyCounts={data.historyCounts}
      objectPrefill={data.objectPrefill}
      permissions={{
        edit: can("FormResponse", "edit"),
        unlock: can("FormResponse", "unlock"),
        editRef: can("FormResponse", "editRef"),
        editStatus: can("FormResponse", "editStatus"),
        share: can("FormResponse", "share"),
      }}
      locale={organization.number_format}
      me={{ id: collaborator.id, firstName: collaborator.first_name, lastName: collaborator.last_name }}
      returnTo={returnTo}
      initialRubric={typeof sp.rubric === "string" ? sp.rubric : null}
    />
  );
}
