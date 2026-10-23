import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE } from "@/i18n/config";
import { findShareByToken } from "@/features/share/server/access";
import { initPath } from "@/features/share/server/guard";

export const dynamic = "force-dynamic";

/** Lien reçu par e-mail : langue du partage, puis écran d'accueil (init-form / init-document). */
export async function GET(req: NextRequest, { params }: RouteContext<"/share/[shareId]">) {
  const { shareId: token } = await params;
  const share = await findShareByToken(token);
  const url = req.nextUrl.clone();
  url.search = "";
  url.pathname = share ? initPath(token, share) : `/share/${encodeURIComponent(token)}/init-form`;
  const res = NextResponse.redirect(url, 303);
  if (share) res.cookies.set(LOCALE_COOKIE, share.language, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  res.headers.set("cache-control", "no-store");
  res.headers.set("referrer-policy", "no-referrer");
  return res;
}
