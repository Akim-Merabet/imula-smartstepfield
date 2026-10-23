import { getTranslations } from "next-intl/server";
import { OrganizationForm } from "@/features/settings/components/organization-form";
import { SettingsPage, settingsCan } from "@/features/settings/components/settings-page";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("generalOrganization") };
}

export default async function GeneralOrganizationPage() {
  const t = await getTranslations("settings");
  const { session } = await settingsCan("SettingsGeneralOrganization");
  return (
    <SettingsPage routeId="SettingsGeneralOrganization" title={t("organization.title")} subtitle={session.organization.name}>
      <OrganizationForm organization={session.organization} />
    </SettingsPage>
  );
}
