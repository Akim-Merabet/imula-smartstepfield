import { getTranslations } from "next-intl/server";
import { TramsTable, type TramRow } from "@/features/documents/pdf/trams/trams-table";
import { SettingsPage, settingsCan } from "@/features/settings/components/settings-page";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("trams") };
}

/** Trames PDF (spec 01 §6.12) — réservé Admin Siteflow. */
export default async function TramsPage() {
  const t = await getTranslations("settings.menu");
  const tp = await getTranslations("pdf.trams");
  const { can } = await settingsCan("SettingsTrams");
  const supabase = await createClient();
  const { data } = can("read")
    ? await supabase.from("document_templates")
      .select("id, link_type, page_type, margin_top, margin_bottom, margin_left, margin_right, page_number_x, page_number_y, index_max, created_at, client:clients(name), family:label_families(short_name, long_name)")
      .order("link_type").order("page_type")
    : { data: [] };
  const items: TramRow[] = (data ?? []).map((r) => {
    const fam = r.family as { short_name: string; long_name: string | null } | null;
    return {
      id: r.id, link_type: r.link_type, page_type: r.page_type, created_at: r.created_at,
      client: (r.client as { name: string } | null)?.name ?? null, family: fam ? fam.short_name : null,
      margin_top: Number(r.margin_top), margin_bottom: Number(r.margin_bottom), margin_left: Number(r.margin_left), margin_right: Number(r.margin_right),
      page_number_x: r.page_number_x === null ? null : Number(r.page_number_x), page_number_y: r.page_number_y === null ? null : Number(r.page_number_y),
      index_max: r.index_max,
    };
  });
  return (
    <SettingsPage routeId="SettingsTrams" title={t("trams")} subtitle={tp("subtitle")}>
      <TramsTable items={items} canEdit={can("edit")} />
    </SettingsPage>
  );
}
