import { redirect } from "next/navigation";
import type { DynamicCtx } from "@/features/forms/response/engine/values";
import { ShareResponse } from "@/features/share/components/share-response";
import { ShareUnavailable } from "@/features/share/components/share-unavailable";
import { guardSharePage, shareBase } from "@/features/share/server/guard";
import { loadShareResponse } from "@/features/share/server/response";

export default async function ShareFormPage({ params }: PageProps<"/share/[shareId]/form">) {
  const { shareId: token } = await params;
  const g = await guardSharePage(token, "contributor", "form");
  if (!g.ok) return <ShareUnavailable reason={g.reason} />;
  if (g.share.respondedAt) redirect(`${shareBase(token)}/finish`);
  const data = await loadShareResponse(g.share);
  if (!data) return <ShareUnavailable reason="not_found" />;
  if (data.response.state === "done") redirect(`${shareBase(token)}/finish`);
  const { response, definition } = data;
  // Rubriques saisissables = rubriques comportant au moins une question partagée.
  const fillable = definition.rubrics.filter((r) => r.questions.some((q) => q.shared)).map((r) => r.lineageId);
  const c = g.share.contributor!;
  return (
    <ShareResponse
      key={response.id}
      token={token}
      contributor={{ name: `${c.firstName} ${c.lastName}`, email: g.share.email }}
      response={{
        id: response.id, project_id: response.project_id, reference: response.reference, state: response.state, created_at: response.created_at,
        custom_status_id: null, context: response.context, last_rubric_lineage_id: response.last_rubric_lineage_id,
        dynamic_context: (response.dynamic_context ?? {}) as DynamicCtx, form_index_label: response.form_index_label,
      }}
      definition={definition}
      items={data.items}
      stored={data.stored}
      formName={data.formName}
      family={null}
      link={{ initial_rubric_lineage_id: fillable[0] ?? null, fillable_rubric_lineage_ids: fillable }}
      flow={null}
      statuses={[]}
      members={[]}
      historyCounts={{}}
      permissions={{ edit: true, unlock: false, editRef: false, editStatus: false }}
      locale={data.locale}
      me={{ id: g.share.externalUserId ?? "external", firstName: c.firstName, lastName: c.lastName }}
      returnTo={`${shareBase(token)}/later`}
      initialRubric={null}
    />
  );
}
