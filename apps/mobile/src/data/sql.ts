// Requêtes SQL de la base locale, sans dépendance React (réutilisables par les tests sur données synchronisées).

export type Query = readonly [sql: string, params: unknown[]];

/**
 * Paramètres nommés (`:nom`) convertis en `?` positionnels : lisible et portable (op-sqlite, better-sqlite3),
 * un même paramètre pouvant apparaître plusieurs fois.
 */
export function named(sql: string, values: Record<string, unknown>): Query {
  const params: unknown[] = [];
  const text = sql.replace(/:(\w+)/g, (_, name: string) => {
    if (!(name in values)) throw new Error(`Paramètre SQL manquant : ${name}`);
    params.push(values[name]);
    return "?";
  });
  return [text, params];
}

export const like = (search: string) => `%${search.trim().toLowerCase()}%`;

export const projectsQuery = (search: string) => named(`select p.id, p.designation, p.project_index, c.name as client_name,
            f.short_name as family_name, f.color as family_color, s.name as status_name, s.color as status_color,
            (select count(*) from flow_summaries fl where fl.project_id = p.id) as flow_count,
            exists (select 1 from offline_selection o where o.project_id = p.id) as downloaded
       from projects p
       left join clients c on c.id = p.client_id
       left join label_families f on f.id = p.family_id
       left join custom_statuses s on s.id = p.custom_status_id
      where p.type = 'project' and ifnull(p.archived, 0) = 0 and p.deleted_at is null
        and (lower(p.designation) like :search or lower(ifnull(p.project_index, '')) like :search or lower(ifnull(c.name, '')) like :search)
      order by p.designation collate nocase`, { search: like(search) });

/** Flows d'une entité ; `mine` : profil responsable, collaborateur ou tablette du flow. */
export const projectFlowsQuery = (p: { projectId: string; principalId: string; tabletId: string | null; search: string; mineOnly: boolean }) => named(`select * from (
       select fl.id, fl.project_id, fl.flow_type, fl.name, fl.ref_int, fl.ref_ext, fl.location_site, fl.location_area,
              fl.location_local, fl.start_date, fl.finish_date,
              f.short_name as family_name, f.color as family_color, s.name as status_name, s.color as status_color,
              ifnull(s.downloadable, 0) as downloadable, c.name as client_name,
              t1.name as tablet_1, t2.name as tablet_2, t3.name as tablet_3,
              (exists (select 1 from flow_assignees a where a.flow_id = fl.id and a.collaborator_id = :me)
                or exists (select 1 from flow_collaborators fc where fc.flow_id = fl.id and fc.collaborator_id = :me)
                or (:tablet is not null and :tablet in (fl.tablet_1_id, fl.tablet_2_id, fl.tablet_3_id))) as mine,
              exists (select 1 from offline_selection o where o.flow_id = fl.id) as selected_offline
         from flow_summaries fl
         join projects p on p.id = fl.project_id
         left join clients c on c.id = p.client_id
         left join label_families f on f.id = fl.family_id
         left join custom_statuses s on s.id = fl.custom_status_id
         left join tablets t1 on t1.id = fl.tablet_1_id
         left join tablets t2 on t2.id = fl.tablet_2_id
         left join tablets t3 on t3.id = fl.tablet_3_id
        where fl.project_id = :project
          and (lower(fl.name) like :search or lower(ifnull(fl.ref_int, '')) like :search or lower(ifnull(fl.ref_ext, '')) like :search)
     ) where (:mineOnly = 0 or mine)
     order by name collate nocase`,
  { project: p.projectId, me: p.principalId, tablet: p.tabletId, search: like(p.search), mineOnly: p.mineOnly ? 1 : 0 });

/**
 * Flows sélectionnés hors ligne qui ne sont plus téléchargeables (statut non « En opération », accès retiré ou flow
 * supprimé) : l'app d'origine les fait disparaître de l'appareil (spec 05 §5.2, purge RN97).
 */
export const staleOfflineSelectionQuery: Query = [`select o.flow_id from offline_selection o
       left join flow_summaries fl on fl.id = o.flow_id
       left join custom_statuses s on s.id = fl.custom_status_id
      where fl.id is null or ifnull(s.downloadable, 0) = 0`, []];
