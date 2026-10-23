import { getTranslations } from "next-intl/server";
import { SettingsPage, settingsCan } from "@/features/settings/components/settings-page";
import { TrashTable } from "@/features/settings/components/trash-table";
import { listTrash } from "@/features/settings/trash";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("trash") };
}

export default async function TrashPage() {
  const t = await getTranslations("settings");
  const { can } = await settingsCan("SettingsTrash");
  const items = can("read") ? await listTrash() : [];
  return (
    <SettingsPage routeId="SettingsTrash" title={t("trash.title")} subtitle={t("trash.subtitle")}>
      <TrashTable items={items} canRestore={can("restore")} />
    </SettingsPage>
  );
}
