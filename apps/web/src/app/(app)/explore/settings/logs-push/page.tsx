import { getTranslations } from "next-intl/server";
import { LogsTable } from "@/features/mobile-support/logs-table";
import { listMobileLogs } from "@/features/mobile-support/queries";
import { SettingsPage } from "@/features/settings/components/settings-page";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("logsPush") };
}

const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(",") : v ?? "").split(",").filter(Boolean);

export default async function Page({ searchParams }: PageProps<"/explore/settings/logs-push">) {
  const sp = await searchParams;
  const t = await getTranslations("mobileSupport.logs");
  const [items, all] = await Promise.all([
    listMobileLogs({ actions: list(sp.action), principals: list(sp.user) }),
    listMobileLogs({ actions: [], principals: [] }),
  ]);
  // Profils présents dans le journal (filtre « Utilisateur »).
  const people = [...new Map(all.map((r) => {
    const p = r.principal as { first_name: string; last_name: string } | null;
    return [r.principal_id, { value: r.principal_id, label: p ? `${p.first_name} ${p.last_name}`.trim() : r.principal_id }];
  })).values()];
  return (
    <SettingsPage routeId="SettingsLogsPush" title={t("title")} subtitle={t("subtitle")}>
      <LogsTable items={items} people={people} />
    </SettingsPage>
  );
}
