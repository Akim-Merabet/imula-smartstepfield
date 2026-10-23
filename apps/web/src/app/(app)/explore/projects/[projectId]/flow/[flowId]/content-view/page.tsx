import { getTranslations } from "next-intl/server";
import { ContentEditor } from "@/features/flows/content/content-editor";
import { getFlowContent, getFlowHeader, getSignatoryCandidates, getStepDetail } from "@/features/flows/queries";
import { getProjectContext } from "@/features/projects/project-context";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/explore/projects/[projectId]/flow/[flowId]/content-view">) {
  const { flowId } = await params;
  const flow = await getFlowHeader(flowId);
  const t = await getTranslations("flowContent");
  return { title: flow?.name ?? t("title") };
}

export default async function ContentViewPage({ params, searchParams }: PageProps<"/explore/projects/[projectId]/flow/[flowId]/content-view">) {
  const { projectId, flowId } = await params;
  const sp = await searchParams;
  const { session, can } = await getProjectContext(projectId);
  const [flow, phases] = await Promise.all([getFlowHeader(flowId), getFlowContent(flowId)]);
  if (!flow) return null;
  const stepIds = new Set(phases.flatMap((p) => p.steps.map((s) => s.id)));
  const stepId = typeof sp.step === "string" && stepIds.has(sp.step) ? sp.step : null;
  const supabase = await createClient();
  const [step, candidates, mprStatuses, blockers] = await Promise.all([
    stepId ? getStepDetail(stepId) : Promise.resolve(null),
    stepId ? getSignatoryCandidates(flowId, projectId) : Promise.resolve({ restricted: false, candidates: [] }),
    supabase.from("custom_statuses").select("id, name, color, category").eq("nature", "multi_pr").eq("active", true).order("sort_order"),
    stepId ? supabase.rpc("step_sequence_blockers", { p_step_id: stepId }) : Promise.resolve({ data: [] as string[] }),
  ]);
  // Référentiel importé non débloqué : contenu en lecture seule (§2.6).
  const locked = flow.origin === "derived_from_standard" && !flow.unlocked;
  return (
    <ContentEditor
      flow={flow}
      phases={phases}
      step={step}
      blockParam={typeof sp.block === "string" ? sp.block : null}
      candidates={candidates}
      multiPrStatuses={mprStatuses.data ?? []}
      sequenceBlockers={blockers.data ?? []}
      me={{ id: session.collaborator.id, name: `${session.collaborator.first_name} ${session.collaborator.last_name}`, company: session.account.name }}
      permissions={{
        edit: !locked && can("FlowContent", "edit"),
        delete: !locked && can("FlowContent", "delete"),
        deactivate: !locked && can("FlowContent", "deactivate"),
        validateStep: can("FlowContent", "validateStep"),
        devalidateStep: can("FlowContent", "devalidateStep"),
        validateBlock: !locked && can("FlowBlockValidation", "edit"),
        sign: can("FlowSignatures", "add"),
        fieldData: can("FlowSignatures", "edit"),
        deleteSignature: can("FlowSignatures", "deleteSignature"),
        unlockSequence: can("FlowSequence", "unlock"),
      }}
    />
  );
}
