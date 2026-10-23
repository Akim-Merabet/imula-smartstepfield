import { getTranslations } from "next-intl/server";
import { SettingsPage } from "@/features/settings/components/settings-page";
import { WordingTable } from "@/features/settings/components/wording-table";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("wording") };
}

export default async function WordingPage() {
  const t = await getTranslations("settings");
  const supabase = await createClient();
  const { data } = await supabase.from("wording_configurations")
    .select("id, name, description, is_default, read_only, languages:wording_configuration_languages(language)").order("name");
  return (
    <SettingsPage routeId="SettingsWordingConfiguration" title={t("wording.title")} subtitle={t("wording.subtitle")}>
      <WordingTable items={data ?? []} />
    </SettingsPage>
  );
}
