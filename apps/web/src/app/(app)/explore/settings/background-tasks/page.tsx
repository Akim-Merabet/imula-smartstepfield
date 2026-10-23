import { getTranslations } from "next-intl/server";
import { BackgroundTasksTable } from "@/features/settings/components/background-tasks-table";
import { SettingsPage } from "@/features/settings/components/settings-page";
import { listBackgroundTasks } from "@/features/settings/queries";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("backgroundTasks") };
}

export default async function BackgroundTasksPage({ searchParams }: PageProps<"/explore/settings/background-tasks">) {
  const sp = await searchParams;
  const statuses = (Array.isArray(sp.status) ? sp.status.join(",") : sp.status ?? "").split(",").filter(Boolean);
  const t = await getTranslations("settings");
  const { items, total } = await listBackgroundTasks(statuses);
  return (
    <SettingsPage routeId="SettingsBackgroundTasks" title={t("backgroundTasks.title")}>
      <BackgroundTasksTable items={items} total={total} />
    </SettingsPage>
  );
}
