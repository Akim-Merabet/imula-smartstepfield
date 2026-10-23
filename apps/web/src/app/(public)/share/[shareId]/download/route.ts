import { NextResponse, type NextRequest } from "next/server";
import { requireShareSession } from "@/features/share/server/access";
import { sharedDocumentPdfs } from "@/features/share/server/document";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };

/** Téléchargement d'un PDF du document partagé (`?f=<clé>` parmi les PDF autorisés). */
export async function GET(req: NextRequest, { params }: RouteContext<"/share/[shareId]/download">) {
  const { shareId: token } = await params;
  const auth = await requireShareSession(token, { kind: "document", contributor: true });
  if (!auth.ok) return new NextResponse(null, { status: auth.error === "unauthenticated" ? 401 : 404, headers: NO_STORE });
  const pdfs = await sharedDocumentPdfs(auth.share);
  const key = req.nextUrl.searchParams.get("f");
  const pdf = key ? pdfs.find((p) => p.key === key) : pdfs[0];
  if (!pdf) return new NextResponse(null, { status: 404, headers: NO_STORE });
  const db = createAdminClient();
  const { data, error } = await db.storage.from("documents").download(pdf.path);
  if (error || !data) return new NextResponse(null, { status: 404, headers: NO_STORE });
  await db.from("document_shares").update({ downloaded_at: new Date().toISOString(), last_access_at: new Date().toISOString() }).eq("id", auth.share.id);
  const name = pdf.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-100) || "document.pdf";
  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: { ...NO_STORE, "content-type": data.type || "application/pdf", "content-disposition": `attachment; filename="${name}"` },
  });
}
