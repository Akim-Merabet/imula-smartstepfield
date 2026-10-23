import { getTranslations } from "next-intl/server";
import { ClientsTable } from "@/features/settings/components/clients-table";
import { SettingsPage, settingsCan } from "@/features/settings/components/settings-page";
import { listClients } from "@/features/settings/queries";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("clients") };
}

export default async function ClientsPage({ searchParams }: PageProps<"/explore/settings/clients">) {
  const sp = await searchParams;
  const t = await getTranslations("settings");
  const { can } = await settingsCan("SettingsClientBook");
  const { items, total } = await listClients(typeof sp.textSearch === "string" ? sp.textSearch : undefined);
  return (
    <SettingsPage routeId="SettingsClientBook" title={t("clients.title")}>
      <ClientsTable items={items} total={total} canEdit={can("edit")} canDelete={can("delete")} />
    </SettingsPage>
  );
}
