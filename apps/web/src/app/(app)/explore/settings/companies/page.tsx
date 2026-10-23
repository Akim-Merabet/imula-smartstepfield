import { getTranslations } from "next-intl/server";
import { CompaniesTable } from "@/features/settings/components/companies-table";
import { SettingsPage, settingsCan } from "@/features/settings/components/settings-page";
import { listCompanies } from "@/features/settings/queries";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("companies") };
}

export default async function CompaniesPage({ searchParams }: PageProps<"/explore/settings/companies">) {
  const sp = await searchParams;
  const t = await getTranslations("settings");
  const { can } = await settingsCan("SettingsCompanies");
  const { items, total } = await listCompanies(typeof sp.textSearch === "string" ? sp.textSearch : undefined);
  return (
    <SettingsPage routeId="SettingsCompanies" title={t("companies.title")}>
      <CompaniesTable items={items} total={total} canAdd={can("add")} canDelete={can("delete")} />
    </SettingsPage>
  );
}
