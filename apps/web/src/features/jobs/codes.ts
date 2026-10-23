/** Codes d'erreur métier remontés par les fonctions SQL des jobs (message d'exception). */
export const JOB_ERROR_CODES_CLIENT = [
  "has_signatures_or_responses", "source_missing", "not_refreshable", "flow_locked", "size_limit", "no_selection", "invalid_target",
  "invalid_copies", "not_referential", "not_duplicable", "invalid_type", "invalid_name", "no_flows", "not_sub_folder",
] as const;
