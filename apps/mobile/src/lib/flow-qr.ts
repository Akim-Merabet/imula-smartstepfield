/**
 * QR imprimable d'un flow (spec 02 action 14, spec 05 §2.2). Format reconstruit : { v: 1, flow_id, project_id } ;
 * le format d'origine { flowRef, projectRef } est aussi accepté.
 */
export function parseFlowQr(raw: string): { flowId: string; projectId: string | null } | null {
  try {
    const data = JSON.parse(raw);
    const flowId = data?.flow_id ?? data?.flowRef;
    if (typeof flowId !== "string" || !flowId) return null;
    const projectId = data?.project_id ?? data?.projectRef;
    return { flowId, projectId: typeof projectId === "string" ? projectId : null };
  } catch {
    return null;
  }
}
