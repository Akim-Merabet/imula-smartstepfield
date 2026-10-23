import { getTranslations } from "next-intl/server";
import { KpiView } from "@/features/settings/components/kpi-view";
import { SettingsPage, settingsCan } from "@/features/settings/components/settings-page";
import { computeKpis, KPI_FREQUENCIES, type KpiFrequency } from "@/features/settings/kpi";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("usage") };
}

export default async function KpiPage({ searchParams }: PageProps<"/explore/settings/kpi">) {
  const sp = await searchParams;
  const frequency: KpiFrequency = (KPI_FREQUENCIES as readonly string[]).includes(String(sp.frequency)) ? (sp.frequency as KpiFrequency) : "month";
  const seconds = Number(sp.month);
  const ref = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
  const accountIds = (Array.isArray(sp.account) ? sp.account.join(",") : sp.account ?? "").split(",").filter(Boolean);
  const t = await getTranslations("settings");
  const { can } = await settingsCan("SettingsKpis");
  if (!can("read")) return <SettingsPage routeId="SettingsKpis" title={t("kpi.title")}>{null}</SettingsPage>;
  const supabase = await createClient();
  const [{ data: accounts }, kpis] = await Promise.all([
    supabase.from("accounts").select("id, name").order("name"),
    computeKpis(frequency, ref, accountIds),
  ]);
  return (
    <SettingsPage routeId="SettingsKpis" title={t("kpi.title")} subtitle={t("kpi.subtitle")}>
      <KpiView frequency={frequency} start={kpis.start.toISOString()} end={kpis.end.toISOString()}
        usage={kpis.usage} licences={kpis.licences} accounts={accounts ?? []} />
    </SettingsPage>
  );
}
