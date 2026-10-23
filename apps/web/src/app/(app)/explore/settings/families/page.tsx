import { getTranslations } from "next-intl/server";
import { FamiliesView } from "@/features/settings/components/families-view";
import { SettingsPage, settingsCan } from "@/features/settings/components/settings-page";
import { FAMILY_NATURES } from "@/features/settings/meta";
import { listFamilies } from "@/features/settings/queries";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("families") };
}

export default async function FamiliesPage() {
  const t = await getTranslations("settings");
  const { can } = await settingsCan("SettingsFamilies");
  const rows = await listFamilies("family");
  return (
    <SettingsPage routeId="SettingsFamilies" title={t("families.title")} subtitle={t("families.subtitle")}>
      <FamiliesView rows={rows} scope={{ kind: "family", projectId: null }} natures={FAMILY_NATURES}
        permissions={{ add: can("add"), edit: can("edit"), delete: can("delete"), archive: can("archive") }} />
    </SettingsPage>
  );
}
