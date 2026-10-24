import { column, Schema, Table } from "@powersync/react-native";

import { syncedTables } from "./schema.generated";

// Tables locales uniquement (jamais synchronisées ni envoyées), spec 05 §9.
const localTables = {
  // Flows choisis pour le hors ligne (UI « Locale ») : un abonnement flow_offline par ligne.
  offline_selection: new Table(
    { flow_id: column.text, project_id: column.text, subscribed_at: column.text },
    { localOnly: true, indexes: { flow: ["flow_id"] } },
  ),
  // Flows ouverts (Exécution, Accès rapide, reprise à la dernière étape consultée — spec 05 §2.5, §2.6).
  flow_executions: new Table(
    {
      flow_id: column.text,
      project_id: column.text,
      phase_id: column.text,
      step_id: column.text,
      readonly: column.integer,
      last_access_at: column.text,
    },
    { localOnly: true, indexes: { flow: ["flow_id"] } },
  ),
  // File des pièces jointes (spec 05 §9.8) : fichiers à envoyer ou à télécharger, par chemin Storage.
  attachment_queue: new Table(
    {
      bucket: column.text,
      path: column.text,
      state: column.text,
      mime: column.text,
      attempts: column.integer,
      last_error: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    { localOnly: true, indexes: { path: ["path"] } },
  ),
  // Écritures refusées par le serveur pour une raison métier (§9.6) : retirées de la file, gardées pour l'écran de détail.
  sync_rejections: new Table(
    {
      table_name: column.text,
      row_id: column.text,
      op: column.text,
      payload: column.text,
      error_code: column.text,
      message: column.text,
      created_at: column.text,
    },
    { localOnly: true },
  ),
};

export const AppSchema = new Schema({ ...syncedTables, ...localTables });

export type AppDatabase = (typeof AppSchema)["types"];
