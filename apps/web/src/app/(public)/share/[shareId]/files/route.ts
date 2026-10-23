import { NextResponse, type NextRequest } from "next/server";
import { FORM_FILES_BUCKET, MAX_PDF_BYTES } from "@/features/forms/meta";
import { requireShareSession } from "@/features/share/server/access";
import { loadShareResponse } from "@/features/share/server/response";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
const SUBS = new Set(["files", "photos", "signatures"]);
const safe = (name: string) => name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80) || "file";

async function context(token: string) {
  const auth = await requireShareSession(token, { kind: "form", contributor: true });
  if (!auth.ok) return null;
  const data = await loadShareResponse(auth.share);
  return data ? { share: auth.share, data } : null;
}

/**
 * URL signée d'un fichier : uniquement les fichiers de la réponse ciblée (responses/<id>/…)
 * ou les images du formulaire figurant dans la structure figée de cette réponse.
 */
export async function GET(req: NextRequest, { params }: RouteContext<"/share/[shareId]/files">) {
  const { shareId: token } = await params;
  const ctx = await context(token);
  if (!ctx) return NextResponse.json({ url: null }, { status: 401, headers: NO_STORE });
  const path = req.nextUrl.searchParams.get("path") ?? "";
  const ownFile = path.startsWith(`responses/${ctx.data.response.id}/`) && !path.includes("..");
  const builderImage = path.startsWith("forms/") && !path.includes("..") && JSON.stringify(ctx.data.definition).includes(JSON.stringify(path));
  if (!ownFile && !builderImage) return NextResponse.json({ url: null }, { status: 404, headers: NO_STORE });
  const { data } = await ctx.data.db.storage.from(FORM_FILES_BUCKET).createSignedUrl(path, 600);
  return NextResponse.json({ url: data?.signedUrl ?? null }, { headers: NO_STORE });
}

/** Dépôt d'un fichier (photo, PDF, signature) dans le dossier de la réponse ciblée. */
export async function POST(req: NextRequest, { params }: RouteContext<"/share/[shareId]/files">) {
  const { shareId: token } = await params;
  const ctx = await context(token);
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: NO_STORE });
  if (ctx.share.respondedAt || ctx.data.response.state === "done") return NextResponse.json({ error: "response_done" }, { status: 409, headers: NO_STORE });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const sub = String(form?.get("sub") ?? "files");
  if (!(file instanceof File) || !SUBS.has(sub)) return NextResponse.json({ error: "invalid" }, { status: 400, headers: NO_STORE });
  if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413, headers: NO_STORE });
  const path = `responses/${ctx.data.response.id}/${sub}/${crypto.randomUUID()}-${safe(file.name)}`;
  const { error } = await ctx.data.db.storage.from(FORM_FILES_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) return NextResponse.json({ error: "upload_failed" }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ path }, { headers: NO_STORE });
}
