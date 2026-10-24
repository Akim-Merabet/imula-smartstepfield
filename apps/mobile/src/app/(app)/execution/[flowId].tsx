import { useQuery } from "@powersync/react";
import { Stack, useLocalSearchParams } from "expo-router";

import { ExecutionView } from "@/components/execution/execution-view";
import { t } from "@/i18n/fr";

/** Exécution d'un flow ouvert depuis une liste (« Ouvrir » / « Mode lecture »). */
export default function ExecutionScreen() {
  const { flowId, stepId, readonly } = useLocalSearchParams<{ flowId: string; stepId?: string; readonly?: string }>();
  // Flow de projet (liste légère) ou flow modèle consulté (Référentiels et Modèles).
  const { data } = useQuery<{ name: string | null }>(
    "select coalesce((select name from flow_summaries where id = ?), (select name from flows where id = ?)) as name",
    [flowId, flowId]);
  return (
    <>
      <Stack.Screen options={{ title: data[0]?.name ?? t("layout.execution") }} />
      <ExecutionView key={flowId} flowId={flowId} initialStepId={stepId} readonly={readonly === "1"} />
    </>
  );
}
