import { getTranslations } from "next-intl/server";
import { GeneralAccountForm } from "@/features/settings/components/general-account-form";
import { SettingsPage, settingsCan } from "@/features/settings/components/settings-page";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("generalAccount") };
}

export default async function GeneralAccountPage({ searchParams }: PageProps<"/explore/settings/general-account">) {
  const sp = await searchParams;
  const t = await getTranslations("settings");
  const { session, can } = await settingsCan("SettingsGeneralAccount");
  let accounts: { id: string; name: string }[] = [];
  let account = session.account;
  if (can("read")) {
    const supabase = await createClient();
    const { data } = await supabase.from("accounts").select("*").order("name");
    accounts = (data ?? []).map((a) => ({ id: a.id, name: a.name }));
    account = (data ?? []).find((a) => a.id === sp.account) ?? session.account;
  }
  return (
    <SettingsPage routeId="SettingsGeneralAccount" title={t("generalAccount.title")}>
      <GeneralAccountForm key={account.id} accounts={accounts} account={account} />
    </SettingsPage>
  );
}
