import { SequenceView } from "@/features/flows/content/sequence-view";
import { getFlowContent, getFlowHeader } from "@/features/flows/queries";
import { getProjectContext } from "@/features/projects/project-context";
import { createClient } from "@/lib/supabase/server";

export default async function SequenceViewPage({ params }: PageProps<"/explore/projects/[projectId]/flow/[flowId]/sequence-view">) {
  const { projectId, flowId } = await params;
  const { can } = await getProjectContext(projectId);
  const supabase = await createClient();
  const [flow, phases, sequences, phaseSeq] = await Promise.all([
    getFlowHeader(flowId),
    getFlowContent(flowId),
    supabase.from("sequences").select("id, position, type").eq("flow_id", flowId).order("position"),
    supabase.from("phases").select("id, sequence_id").eq("flow_id", flowId),
  ]);
  if (!flow) return null;
  const { data: account } = await supabase.from("accounts").select("default_sequence_type").eq("id", flow.account_id).maybeSingle();
  return (
    <SequenceView
      flowId={flowId}
      phases={phases}
      sequences={sequences.data ?? []}
      phaseSeq={Object.fromEntries((phaseSeq.data ?? []).map((p) => [p.id, p.sequence_id]))}
      defaultType={account?.default_sequence_type === "parallel" ? "parallel" : "linear"}
      canEdit={can("FlowSequence", "edit")}
      locked={flow.origin === "derived_from_standard" && !flow.unlocked}
    />
  );
}
