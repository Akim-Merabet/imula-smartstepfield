import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/features/settings/components/coming-soon";

export async function generateMetadata() {
  const t = await getTranslations("settings.menu");
  return { title: t("filesCells") };
}

export default function Page() {
  return <ComingSoon routeId="SettingsCustomCell" titleKey="filesCells" />;
}
