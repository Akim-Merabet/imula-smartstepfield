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
  // Refus métier levé par une RPC (raise exception 'CODE' using errcode = 'P0001') : le message est le code.
  throw new UploadError("rejected", error.code === "P0001" ? error.message : error.code ?? String(status), error.message);
}

type Uploader = (op: CrudEntry) => Promise<void>;

// Écriture directe soumise à la RLS (tables sans règle métier côté serveur).
const direct = (table: "step_navigation_events" | "flow_geometries"): Uploader => async (op) => {
  if (op.op === UpdateType.DELETE) return check(await supabase.from(table).delete().eq("id", op.id));
  const row = { ...op.opData, id: op.id };
  if (op.op === UpdateType.PUT) return check(await supabase.from(table).upsert(row as never));
  check(await supabase.from(table).update(op.opData as never).eq("id", op.id));
};

// Étape : seules l'ouverture (pastille) et la validation partent de l'appareil, par RPC (contrôles re-vérifiés).
const steps: Uploader = async (op) => {
  const data = op.opData ?? {};
  const allowed = new Set(["first_opened_at", "validated_at"]);
  if (op.op !== UpdateType.PATCH || Object.keys(data).some((k) => !allowed.has(k))) {
    throw new UploadError("rejected", "NOT_ALLOWED", "Modification d'étape non autorisée depuis l'appareil");
  }
  if (data.first_opened_at) {
    check(await supabase.rpc("mobile_mark_step_opened", { p_step_id: op.id, p_opened_at: data.first_opened_at as string }));
  }
  if (data.validated_at) {
    const result = await supabase.rpc("mobile_validate_step", { p_step_id: op.id, p_validated_at: data.validated_at as string });
    check(result);
    if (result.data?.length) throw new UploadError("rejected", "STEP_REQUIREMENTS_NOT_MET", result.data.join(","));
  }
};

// Signature du bloc Contrôles : création (signer, non applicable, signer plus tard) et reprise d'une signature en attente.
const signatures: Uploader = async (op) => {
  const data = op.opData ?? {};
  if (op.op === UpdateType.PUT) return check(await supabase.rpc("mobile_sign", { p: { ...data, id: op.id } }));
  if (op.op === UpdateType.PATCH && data.state === "signed") {
    return check(await supabase.rpc("mobile_complete_signature", {
      p_id: op.id, p_signature_path: (data.signature_path as string | null) ?? "", p_signed_at: data.signed_at as string,
      p_comment: (data.comment as string | null) ?? undefined,
    }));
  }
  throw new UploadError("rejected", "NOT_ALLOWED", "Modification de signature non autorisée depuis l'appareil");
};

// Table locale → appel serveur. Les RPC métier (réponses, signatures, validation d'étape…) s'ajoutent
// ici avec les écrans qui produisent ces écritures (spec 05 §9.6).
const uploaders: Partial<Record<string, Uploader>> = {
  steps,
  signatures,
  step_navigation_events: direct("step_navigation_events"),
  flow_geometries: direct("flow_geometries"),
};

export async function uploadEntry(op: CrudEntry): Promise<void> {
  const uploader = uploaders[op.table];
  // Pas de route : on garde l'écriture en file plutôt que de la perdre (erreur de développement).
  if (!uploader) throw new UploadError("retry", "NO_UPLOADER", `Aucun envoi défini pour la table ${op.table}`);
  await uploader(op);
}
