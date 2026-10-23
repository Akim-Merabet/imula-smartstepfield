import type { Enums } from "@/lib/supabase/database.types";
import type { EntityKind } from "@/components/shell/entity-icon";

export type ProjectType = Enums<"project_type">;
export const PROJECT_TYPES: ProjectType[] = ["project", "referential", "template", "pgac", "folder"];
/** Types créables directement (le dossier référentiel s'obtient par conversion). */
export const CREATABLE_PROJECT_TYPES: ProjectType[] = ["project", "referential", "template", "pgac"];

export function projectKind(type: ProjectType): EntityKind {
  return type;
}

export const PROJECTS_PAGE_SIZE = 50;
