import { useQuery } from "@powersync/react";
import { Stack, useLocalSearchParams } from "expo-router";

import { ExecutionView } from "@/components/execution/execution-view";
import { t } from "@/i18n/fr";

/** Exécution d'un flow ouvert depuis une liste (« Ouvrir » / « Mode lecture »). */
export default function ExecutionScreen() {
  const { flowId, stepId, readonly } = useLocalSearchParams<{ flowId: string; stepId?: string; readonly?: string }>();
  const { data } = useQuery<{ name: string }>("select name from flow_summaries where id = ?", [flowId]);
  return (
    <>
      <Stack.Screen options={{ title: data[0]?.name ?? t("layout.execution") }} />
      <ExecutionView key={flowId} flowId={flowId} initialStepId={stepId} readonly={readonly === "1"} />
    </>
  );
}
