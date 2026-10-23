import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { buildTemplate } from "@/features/library/shared/excel";
import { authorize } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

const KEYS = ["family", "name", "reference", "source", "landmark", "pictogram", "major", "frequency", "occurrence", "severity"] as const;

/** Trame d'import Excel des risques (colonnes + feuille des familles disponibles). */
export async function GET() {
  const auth = await authorize("LibraryRisks", "import");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 403 });
  const t = await getTranslations("libraryRisks.template");
  const { data: families } = await (await createClient()).from("label_families").select("short_name, long_name")
    .eq("kind", "family").eq("nature", "risk").eq("relative_nature", "child").is("deleted_at", null).is("project_id", null).order("short_name");
  const buf = await buildTemplate(t("sheet"), KEYS.map((k) => t(`columns.${k}`)), t("families"), families ?? []);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="trame-risques.xlsx"`,
    },
  });
}
