// Requêtes de la base locale pour les écrans de liste (spec 05 §2.2, §2.3). Lecture seule, en ligne comme hors ligne.
import { useQuery } from "@powersync/react";

import { useSession } from "@/session/session-context";

import { projectFlowsQuery, projectsQuery } from "./sql";

export type ProjectItem = {
  id: string;
  designation: string;
  project_index: string | null;
  client_name: string | null;
  family_name: string | null;
  family_color: string | null;
  status_name: string | null;
  status_color: string | null;
  flow_count: number;
  downloaded: number;
};

export function useProjects(search: string) {
  return useQuery<ProjectItem>(...projectsQuery(search));
}

export type FlowItem = {
  id: string;
  project_id: string;
  flow_type: string;
  name: string;
  ref_int: string | null;
  ref_ext: string | null;
  location_site: string | null;
  location_area: string | null;
  location_local: string | null;
  start_date: string | null;
  finish_date: string | null;
  family_name: string | null;
  family_color: string | null;
  status_name: string | null;
  status_color: string | null;
  downloadable: number;
  client_name: string | null;
  tablet_1: string | null;
  tablet_2: string | null;
  tablet_3: string | null;
  mine: number;
  selected_offline: number;
};

/** Profil connecté et sa tablette éventuelle (profil « appareil »). */
export function useMe() {
  const { profile } = useSession();
  const principalId = profile?.principalId ?? "";
  const { data } = useQuery<{ tablet_id: string | null }>(
    "select (select id from tablets where collaborator_id = ?) as tablet_id", [principalId],
  );
  return { principalId, tabletId: data[0]?.tablet_id ?? null };
}

export function useProjectFlows(projectId: string, search: string, mineOnly: boolean) {
  const { principalId, tabletId } = useMe();
  return useQuery<FlowItem>(...projectFlowsQuery({ projectId, principalId, tabletId, search, mineOnly }));
}
