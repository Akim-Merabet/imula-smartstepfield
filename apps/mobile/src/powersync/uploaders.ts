import { type AbstractPowerSyncDatabase, type CrudEntry, UpdateType } from "@powersync/react-native";

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

/** `db` permet de relire la ligne locale complète (une modification partielle ne porte que les colonnes changées). */
type Uploader = (op: CrudEntry, db: AbstractPowerSyncDatabase) => Promise<void>;

const json = (v: unknown) => {
  if (typeof v !== "string") return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

// Écriture directe soumise à la RLS (tables sans règle métier côté serveur).
// Journal (step_navigation_events) : insertion seule, un rejeu (doublon de clé) vaut succès — un upsert prendrait
// le chemin UPDATE, refusé par la RLS, et serait pris à tort pour un accès retiré.
const insertOnly = (table: "step_navigation_events"): Uploader => async (op) => {
  if (op.op !== UpdateType.PUT) throw new UploadError("rejected", "NOT_ALLOWED", `Modification non autorisée sur ${table}`);
  const result = await supabase.from(table).insert({ ...op.opData, id: op.id } as never);
  if (result.error?.code === "23505") return;
  check(result);
};

const direct = (table: "flow_geometries"): Uploader => async (op) => {
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

// Réponse de formulaire : création (réponse unique contrôlée par le serveur) puis état, référence, rubrique courante.
const formResponses: Uploader = async (op) => {
  const data = op.opData ?? {};
  if (op.op === UpdateType.PUT) {
    return check(await supabase.rpc("mobile_create_form_response", {
      p: { ...data, id: op.id, dynamic_context: json(data.dynamic_context) ?? {} },
    }));
  }
  if (op.op === UpdateType.PATCH) {
    const allowed = ["state", "done_at", "reference", "last_rubric_lineage_id", "active_redirect"];
    const p: Record<string, unknown> = {};
    for (const k of allowed) if (k in data) p[k] = k === "active_redirect" ? json(data[k]) : data[k];
    if (!Object.keys(p).length) return;
    return check(await supabase.rpc("mobile_update_form_response", { p_id: op.id, p: p as never }));
  }
  throw new UploadError("rejected", "NOT_ALLOWED", "Suppression de réponse non autorisée depuis l'appareil");
};

// Valeur de réponse : on renvoie l'état courant de la ligne locale (idempotent, clé (réponse, option)).
const formResponseValues: Uploader = async (op, db) => {
  if (op.op === UpdateType.DELETE) throw new UploadError("rejected", "NOT_ALLOWED", "Suppression de valeur non autorisée");
  const row = await db.getOptional<Record<string, unknown>>("select * from form_response_values where id = ?", [op.id]);
  if (!row) return;
  const item = {
    rubric_lineage_id: row.rubric_lineage_id, question_lineage_id: row.question_lineage_id, option_lineage_id: row.option_lineage_id,
    option_code: row.option_code, coord: row.coord, question_type: row.question_type, value_type: row.value_type,
    value_json: json(row.value_json), value_text: row.value_text, value_number: row.value_number,
    value_bool: row.value_bool == null ? null : row.value_bool === 1 || row.value_bool === true,
    value_date: row.value_date, value_ts: row.value_ts, observation: row.observation,
    is_valid: row.is_valid == null ? null : row.is_valid === 1 || row.is_valid === true,
    lock: row.locked === 1 || row.locked === true,
  };
  check(await supabase.rpc("save_rubric_values", {
    p_response_id: row.response_id as string, p_rubric_lineage_id: row.rubric_lineage_id as string,
    p_values: [item] as never, p_options: { provenance: "mobile" } as never,
  }));
};

// Instructions multiples : statut / observation d'une sous-instruction, signature (spec 05 §4.6).
const multiPrItems: Uploader = async (op) => {
  const data = op.opData ?? {};
  if (op.op !== UpdateType.PATCH) throw new UploadError("rejected", "NOT_ALLOWED", "Modification de sous-instruction non autorisée");
  const p: Record<string, unknown> = {};
  for (const k of ["custom_status_id", "observation"]) if (k in data) p[k] = data[k];
  if (!Object.keys(p).length) return;
  check(await supabase.rpc("mobile_update_multi_pr_item", { p_id: op.id, p: p as never }));
};

const multiPrSignatures: Uploader = async (op) => {
  if (op.op !== UpdateType.PUT) throw new UploadError("rejected", "NOT_ALLOWED", "Modification de signature non autorisée");
  check(await supabase.rpc("mobile_sign_multi_pr", { p: { ...op.opData, id: op.id } as never }));
};

// Statut du flow (table « insertion seule ») et déverrouillage du flow signé.
const flowStatusChanges: Uploader = async (op) => {
  const d = op.opData ?? {};
  check(await supabase.rpc("mobile_set_flow_status", {
    p_flow_id: d.flow_id as string, p_status_id: d.status_id as string, p_comment: (d.comment as string | null) ?? undefined,
  }));
};

const flowFillUnlocks: Uploader = async (op) => {
  if (op.op !== UpdateType.PUT) throw new UploadError("rejected", "NOT_ALLOWED", "Modification de déverrouillage non autorisée");
  check(await supabase.rpc("mobile_unlock_flow", { p: { ...op.opData, id: op.id } as never }));
};

// Copie locale du flow : seuls le statut et le déverrouillage changent sur l'appareil, et ils partent par les
// demandes dédiées ci-dessus (même transaction) ; la modification de la ligne elle-même n'est pas envoyée.
const flows: Uploader = async (op) => {
  const allowed = new Set(["custom_status_id", "fill_restrictions_skipped"]);
  if (op.op === UpdateType.PATCH && Object.keys(op.opData ?? {}).every((k) => allowed.has(k))) return;
  throw new UploadError("rejected", "NOT_ALLOWED", "Modification de flow non autorisée depuis l'appareil");
};

// Table locale → appel serveur. Les RPC métier (réponses, signatures, validation d'étape…) s'ajoutent
// ici avec les écrans qui produisent ces écritures (spec 05 §9.6).
const uploaders: Partial<Record<string, Uploader>> = {
  steps,
  signatures,
  form_responses: formResponses,
  block_multi_pr_items: multiPrItems,
  block_multi_pr_signatures: multiPrSignatures,
  flow_status_changes: flowStatusChanges,
  flow_fill_unlocks: flowFillUnlocks,
  flows,
  form_response_values: formResponseValues,
  step_navigation_events: insertOnly("step_navigation_events"),
  flow_geometries: direct("flow_geometries"),
};

export async function uploadEntry(op: CrudEntry, db: AbstractPowerSyncDatabase): Promise<void> {
  const uploader = uploaders[op.table];
  // Pas de route : on garde l'écriture en file plutôt que de la perdre (erreur de développement).
  if (!uploader) throw new UploadError("retry", "NO_UPLOADER", `Aucun envoi défini pour la table ${op.table}`);
  await uploader(op, db);
}
