import { getTranslations } from "next-intl/server";
import { CategorySyncButton } from "@/features/settings/components/category-sync-button";
import { FamiliesView } from "@/features/settings/components/families-view";
import { SettingsPage, settingsCan } from "@/features/settings/components/settings-page";
import { CATEGORY_NATURES } from "@/features/settings/meta";
import { listFamilies } from "@/features/settings/queries";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("categories") };
}

export default async function DefaultCategoriesPage() {
  const t = await getTranslations("settings");
  const { can } = await settingsCan("DefaultCategories");
  const rows = await listFamilies("category");
  return (
    <SettingsPage routeId="DefaultCategories" title={t("categories.title")} subtitle={t("categories.subtitle")}>
      <FamiliesView rows={rows} scope={{ kind: "category", projectId: null }} natures={CATEGORY_NATURES}
        permissions={{ add: can("add"), edit: can("edit"), delete: can("delete"), archive: can("edit") }}
        toolbar={can("edit") ? <CategorySyncButton /> : null} />
    </SettingsPage>
  );
}
