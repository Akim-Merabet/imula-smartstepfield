import { getTranslations } from "next-intl/server";
import { ReferencesTable } from "@/features/settings/components/references-table";
import { SettingsPage, settingsCan } from "@/features/settings/components/settings-page";
import { listReferences } from "@/features/settings/queries";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("references") };
}

export default async function ReferencesPage({ searchParams }: PageProps<"/explore/settings/references">) {
  const sp = await searchParams;
  const natures = (Array.isArray(sp.nature) ? sp.nature.join(",") : sp.nature ?? "").split(",").filter(Boolean);
  const t = await getTranslations("settings");
  const { can } = await settingsCan("SettingsReferences");
  const { items, total } = await listReferences(natures);
  return (
    <SettingsPage routeId="SettingsReferences" title={t("references.title")} subtitle={t("references.subtitle")}>
      <ReferencesTable items={items} total={total} permissions={{ add: can("add"), edit: can("edit"), delete: can("delete") }} />
    </SettingsPage>
  );
}
