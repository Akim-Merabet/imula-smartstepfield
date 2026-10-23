import { getTranslations } from "next-intl/server";
import { AccountForm } from "@/features/settings/components/account-form";
import { SettingsPage, settingsCan } from "@/features/settings/components/settings-page";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("account") };
}

export default async function AccountPage() {
  const t = await getTranslations("settings");
  const { session, can } = await settingsCan("SettingsAccount");
  return (
    <SettingsPage routeId="SettingsAccount" title={t("menu.account")} subtitle={t("account.subtitle")}>
      <AccountForm
        account={session.account}
        organization={{ id: session.organization.id, name: session.organization.name, subdomain: session.organization.subdomain }}
        canEdit={can("edit")}
      />
    </SettingsPage>
  );
}
