import { type CrudEntry, UpdateType } from "@powersync/react-native";

import { supabase } from "@/lib/supabase";

/** Erreur d'envoi classée selon la stratégie de la spec 05 §9.6. */
export class UploadError extends Error {
  constructor(
    readonly kind: "retry" | "forbidden" | "rejected",
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Convertit le résultat d'un appel Supabase en erreur classée (réseau/5xx/429 → nouvel essai, 403 → suspension, 4xx → refus). */
export function check(result: { error: { code?: string; message: string } | null; status: number }): void {
  const { error, status } = result;
  if (!error) return;
  if (status === 0 || status === 429 || status >= 500) throw new UploadError("retry", error.code ?? String(status), error.message);
  if (status === 401) throw new UploadError("retry", "UNAUTHORIZED", error.message);
  if (status === 403 || error.code === "42501") throw new UploadError("forbidden", error.code ?? "FORBIDDEN", error.message);
  throw new UploadError("rejected", error.code ?? String(status), error.message);
}

type Uploader = (op: CrudEntry) => Promise<void>;

// Écriture directe soumise à la RLS (tables sans règle métier côté serveur).
const direct = (table: "step_navigation_events" | "flow_geometries"): Uploader => async (op) => {
  if (op.op === UpdateType.DELETE) return check(await supabase.from(table).delete().eq("id", op.id));
  const row = { ...op.opData, id: op.id };
  if (op.op === UpdateType.PUT) return check(await supabase.from(table).upsert(row as never));
  check(await supabase.from(table).update(op.opData as never).eq("id", op.id));
};

// Table locale → appel serveur. Les RPC métier (réponses, signatures, validation d'étape…) s'ajoutent
// ici avec les écrans qui produisent ces écritures (spec 05 §9.6).
const uploaders: Partial<Record<string, Uploader>> = {
  step_navigation_events: direct("step_navigation_events"),
  flow_geometries: direct("flow_geometries"),
};

export async function uploadEntry(op: CrudEntry): Promise<void> {
  const uploader = uploaders[op.table];
  // Pas de route : on garde l'écriture en file plutôt que de la perdre (erreur de développement).
  if (!uploader) throw new UploadError("retry", "NO_UPLOADER", `Aucun envoi défini pour la table ${op.table}`);
  await uploader(op);
}
