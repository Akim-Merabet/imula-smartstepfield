import { NextResponse, type NextRequest } from "next/server";
import { responsePreview } from "@/features/documents/pdf/preview";
import { createWorkerClient } from "@/features/documents/pdf/service-client";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Aperçu PDF d'une réponse de formulaire (« Voir PDF ») ; `?empty=1` : afficher les choix non renseignés. */
export async function GET(req: NextRequest, { params }: RouteContext<"/api/pdf/responses/[responseId]">) {
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 401 });
  const { responseId } = await params;
  const supabase = await createClient();
  const { data: response } = await supabase.from("form_responses").select("id, reference, project_id").eq("id", responseId).is("deleted_at", null).maybeSingle();
  if (!response) return new NextResponse(null, { status: 404 });
  const { data: project } = await supabase.from("projects").select("designation, export_language_1, client:clients(name)").eq("id", response.project_id).maybeSingle();
  const lang = project?.export_language_1 && project.export_language_1 !== "none" ? project.export_language_1 : session.collaborator.language;
  const res = await responsePreview(supabase, createWorkerClient(), {
    orgId: session.organization.id, locale: lang === "fr" ? "fr" : lang ? "en" : "fr", responseId,
    includeEmpty: req.nextUrl.searchParams.get("empty") === "1",
    footer: [project?.designation, (project?.client as { name: string } | null)?.name].filter(Boolean).join(" — ") || null,
    watermark: session.account.doc_watermark,
  });
  if (!res) return new NextResponse(null, { status: 404 });
  const name = response.reference.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(0, 80);
  return new NextResponse(Buffer.from(res.bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}.pdf"`, "cache-control": "no-store" },
  });
}
