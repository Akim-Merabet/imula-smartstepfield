import { getTranslations } from "next-intl/server";
import { ConstructionIcon } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { SettingsPage } from "./settings-page";

/** Écran prévu mais pas encore livré (état vide propre). */
export async function ComingSoon({ routeId, titleKey }: { routeId: string; titleKey: string }) {
  const t = await getTranslations("settings");
  return (
    <SettingsPage routeId={routeId} title={t(`menu.${titleKey}` as never)}>
      <div className="flex flex-1 items-center justify-center rounded-md border bg-card">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ConstructionIcon /></EmptyMedia>
            <EmptyTitle>{t("comingSoon.title")}</EmptyTitle>
            <EmptyDescription>{t("comingSoon.description")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </SettingsPage>
  );
}
