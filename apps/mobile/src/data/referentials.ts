// Référentiels et Modèles (spec 05 §2.2) : listes lues en ligne, flow consulté en mode lecture via le stream
// referential_flow (souscription courte : les lignes disparaissent de l'appareil après la durée de vie).
import type { AbstractPowerSyncDatabase } from "@powersync/react-native";

import { supabase } from "@/lib/supabase";

/** Durée de conservation d'un flow modèle consulté (secondes). */
const REFERENTIAL_TTL = 30 * 60;

export type ReferentialEntity = { id: string; designation: string; type: string; published: boolean };
export type ReferentialFlow = { id: string; name: string; flow_type: string; ref_int: string | null };

export async function listReferentialEntities(): Promise<ReferentialEntity[] | null> {
  const { data, error } = await supabase.from("projects").select("id, designation, type, published")
    .in("type", ["referential", "template"]).is("deleted_at", null).eq("archived", false).order("designation");
  return error ? null : (data as ReferentialEntity[]);
}

export async function listReferentialFlows(projectId: string): Promise<ReferentialFlow[] | null> {
  const { data, error } = await supabase.from("flows").select("id, name, flow_type, ref_int")
    .eq("project_id", projectId).is("deleted_at", null).order("name");
  return error ? null : (data as ReferentialFlow[]);
}

/** Télécharge le flow modèle pour la consultation (attente bornée de la première synchronisation). */
export async function loadReferentialFlow(db: AbstractPowerSyncDatabase, flowId: string, timeoutMs = 20_000): Promise<boolean> {
  const sub = await db.syncStream("referential_flow", { flow_id: flowId }).subscribe({ ttl: REFERENTIAL_TTL });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    await sub.waitForFirstSync(abort.signal);
  } catch {
    // délai dépassé : on vérifie ce qui est arrivé
  } finally {
    clearTimeout(timer);
    // La durée de vie garde les données le temps de la consultation, sans gérer la fin de l'écran.
    sub.unsubscribe();
  }
  return !!(await db.getOptional("select 1 from flows where id = ?", [flowId]));
}
