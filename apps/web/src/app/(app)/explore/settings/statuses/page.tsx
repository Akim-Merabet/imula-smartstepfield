import { getTranslations } from "next-intl/server";
import { SettingsPage, settingsCan } from "@/features/settings/components/settings-page";
import { StatusesTable } from "@/features/settings/components/statuses-table";
import { STATUS_NATURES, type StatusNature } from "@/features/settings/meta";
import { listStatuses } from "@/features/settings/queries";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("statuses") };
}

export default async function StatusesPage({ searchParams }: PageProps<"/explore/settings/statuses">) {
  const sp = await searchParams;
  const nature: StatusNature = (STATUS_NATURES as readonly string[]).includes(String(sp.type)) ? (sp.type as StatusNature) : "flow";
  const state = sp.state === "active" || sp.state === "inactive" ? sp.state : "all";
  const t = await getTranslations("settings");
  const { can } = await settingsCan("CustomStatus");
  const { items, total } = await listStatuses(nature, state);
  return (
    <SettingsPage routeId="CustomStatus" title={t("statuses.title", { nature: t(`statusNatures.${nature}`) })} subtitle={t("statuses.subtitle")}>
      <StatusesTable key={nature} nature={nature} items={items} total={total}
        permissions={{ add: can("add"), edit: can("edit"), delete: can("delete") }} />
    </SettingsPage>
  );
}
