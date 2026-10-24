import { getTranslations } from "next-intl/server";
import { BackupsTable } from "@/features/mobile-support/backups-table";
import { listMobileBackups } from "@/features/mobile-support/queries";
import { SettingsPage } from "@/features/settings/components/settings-page";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("backups") };
}

export default async function Page() {
  const t = await getTranslations("mobileSupport.backups");
  const items = await listMobileBackups();
  return (
    <SettingsPage routeId="SettingsBackups" title={t("title")} subtitle={t("subtitle")}>
      <BackupsTable items={items} />
    </SettingsPage>
  );
}
