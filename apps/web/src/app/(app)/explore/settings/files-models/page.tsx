import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/features/settings/components/coming-soon";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("filesModels") };
}

export default function Page() {
  return <ComingSoon routeId="SettingsCustomFile" titleKey="filesModels" />;
}
