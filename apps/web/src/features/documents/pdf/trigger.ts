import "server-only";
import { after } from "next/server";
import { drainDocumentQueue } from "./worker";

/**
 * Déclenchement immédiat de la génération après la réponse (Next `after`) : appelé par les actions
 * serveur qui mettent une tâche en file. Les reprises éventuelles sont assurées par
 * `npm run worker:documents` (sondage de la file).
 */
export function scheduleDocumentGeneration(taskIds?: (string | null | undefined)[]) {
  const ids = (taskIds ?? []).filter((x): x is string => !!x);
  after(async () => {
    try {
      await drainDocumentQueue(ids.length ? { taskIds: ids, max: ids.length } : { max: 3 });
    } catch (err) {
      console.error(`[document-worker] immediate run failed: ${err instanceof Error ? err.message : "error"}`);
    }
  });
}
