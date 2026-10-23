import { NextResponse } from "next/server";
import { formBlankPreview } from "@/features/documents/pdf/preview";
import { createWorkerClient } from "@/features/documents/pdf/service-client";
import { buildDefinition, loadFormStructure } from "@/features/forms/server/structure";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Aperçu PDF du formulaire vierge (structure courante de l'éditeur), renvoyé directement. */
export async function GET(_req: Request, { params }: RouteContext<"/api/pdf/forms/[formId]">) {
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 401 });
  const { formId } = await params;
  const supabase = await createClient();
  const structure = await loadFormStructure(supabase, formId);
  if (!structure) return new NextResponse(null, { status: 404 });
  const { data: family } = structure.form.family_id
    ? await supabase.from("label_families").select("id, short_name, long_name, color").eq("id", structure.form.family_id).maybeSingle()
    : { data: null };
  const definition = buildDefinition(structure, 0, family ? { id: family.id, shortName: family.short_name, longName: family.long_name ?? undefined, color: family.color } : undefined);
  const res = await formBlankPreview(supabase, createWorkerClient(), {
    orgId: session.organization.id, locale: session.collaborator.language === "en" ? "en" : "fr",
    definition, formName: structure.form.name, watermark: session.account.doc_watermark,
  });
  const name = structure.form.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(0, 80) || "formulaire";
  return new NextResponse(Buffer.from(res.bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}.pdf"`, "cache-control": "no-store" },
  });
}
