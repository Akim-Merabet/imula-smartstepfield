import { NextResponse } from "next/server";
import { responsePreview } from "@/features/documents/pdf/preview";
import { createWorkerClient } from "@/features/documents/pdf/service-client";
import { requireShareSession, targetResponseId } from "@/features/share/server/access";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };

/** PDF récapitulatif de la réponse ciblée par le partage (session de partage exigée). */
export async function GET(_req: Request, { params }: RouteContext<"/share/[shareId]/pdf">) {
  const { shareId: token } = await params;
  const auth = await requireShareSession(token, { kind: "form", contributor: true });
  if (!auth.ok) return new NextResponse(null, { status: auth.error === "unauthenticated" ? 401 : 404, headers: NO_STORE });
  const { share } = auth;
  const responseId = targetResponseId(share);
  if (!responseId) return new NextResponse(null, { status: 404, headers: NO_STORE });
  const db = createWorkerClient();
  // Filtre strict : la réponse doit appartenir à l'entité et à l'organisation du partage.
  const { data: response } = await db.from("form_responses").select("id, reference")
    .eq("id", responseId).eq("project_id", share.projectId).eq("organization_id", share.organizationId).is("deleted_at", null).maybeSingle();
  if (!response) return new NextResponse(null, { status: 404, headers: NO_STORE });
  const { data: project } = await db.from("projects").select("designation, client:clients(name)").eq("id", share.projectId).maybeSingle();
  const res = await responsePreview(db, db, {
    orgId: share.organizationId, locale: share.language, responseId: response.id, includeEmpty: false,
    footer: [project?.designation, (project?.client as { name: string } | null)?.name].filter(Boolean).join(" — ") || null,
  });
  if (!res) return new NextResponse(null, { status: 404, headers: NO_STORE });
  const name = response.reference.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(0, 80) || "response";
  return new NextResponse(Buffer.from(res.bytes), {
    headers: { ...NO_STORE, "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}.pdf"` },
  });
}
