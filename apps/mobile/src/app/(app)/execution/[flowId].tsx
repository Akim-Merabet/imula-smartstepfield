import { Stack } from "expo-router";

import { Empty } from "@/components/kit";
import { t } from "@/i18n/fr";

// Écran d'exécution (spec 05 §4) : livré à l'étape suivante.
export default function ExecutionScreen() {
  return (
    <>
      <Stack.Screen options={{ title: t("layout.execution") }} />
      <Empty>{t("common.noOpenFlow")}</Empty>
    </>
  );
}
