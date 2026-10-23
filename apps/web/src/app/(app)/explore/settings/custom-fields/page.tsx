import { getTranslations } from "next-intl/server";
import { CustomFieldsTable } from "@/features/settings/components/custom-fields-table";
import { SettingsPage, settingsCan } from "@/features/settings/components/settings-page";
import { FIELD_NATURES, type FieldNature } from "@/features/settings/meta";
import { listCustomFields } from "@/features/settings/queries";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("customFields") };
}

export default async function CustomFieldsPage({ searchParams }: PageProps<"/explore/settings/custom-fields">) {
  const sp = await searchParams;
  const nature: FieldNature = (FIELD_NATURES as readonly string[]).includes(String(sp.type)) ? (sp.type as FieldNature) : "project";
  const state = sp.state === "active" || sp.state === "inactive" ? sp.state : "all";
  const t = await getTranslations("settings");
  const { can } = await settingsCan("SettingsCustomField");
  const { items, total } = await listCustomFields(nature, state);
  return (
    <SettingsPage routeId="SettingsCustomField" title={t("customFields.title", { nature: t(`fieldNatures.${nature}`) })}>
      <CustomFieldsTable key={nature} nature={nature} items={items} total={total}
        permissions={{ add: can("add"), edit: can("edit"), delete: can("delete") }} />
    </SettingsPage>
  );
}
