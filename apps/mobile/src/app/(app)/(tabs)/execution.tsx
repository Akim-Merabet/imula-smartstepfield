import { useQuery } from "@powersync/react";

import { ExecutionView } from "@/components/execution/execution-view";
import { Empty } from "@/components/kit";
import { t } from "@/i18n/fr";

/** Onglet Exécution : le dernier flow ouvert, sinon « Aucun flow ouvert » (spec 05 §2.1). */
export default function ExecutionTab() {
  const { data } = useQuery<{ flow_id: string; step_id: string | null; readonly: number }>(
    `select e.flow_id, e.step_id, e.readonly from flow_executions e
      where exists (select 1 from flows f where f.id = e.flow_id) order by e.last_access_at desc limit 1`);
  const last = data[0];
  if (!last) return <Empty>{t("common.noOpenFlow")}</Empty>;
  return <ExecutionView key={last.flow_id} flowId={last.flow_id} initialStepId={last.step_id ?? undefined} readonly={!!last.readonly} />;
}
