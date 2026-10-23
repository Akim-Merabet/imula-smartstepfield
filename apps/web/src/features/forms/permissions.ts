import { ADMIN_AUTHORITIES, roleAtLeast, type Authority, type TeamRole } from "@/lib/permissions/types";
import type { Enums } from "@/lib/supabase/database.types";

type User = { authority: Authority | null; additional_rights: Enums<"additional_right">[] };
type FormLike = { location: Enums<"form_location">; nature: Enums<"form_nature">; origin: Enums<"form_origin"> | null };

const isAdmin = (u: User) => !!u.authority && ADMIN_AUTHORITIES.includes(u.authority);

/** Types proposés à la création en bibliothèque selon les droits complémentaires (spec 03 §2.2). */
export function creatableNatures(u: User): ("model" | "generic")[] {
  if (isAdmin(u)) return ["model", "generic"];
  const out: ("model" | "generic")[] = [];
  if (u.additional_rights.includes("model_form")) out.push("model");
  if (u.additional_rights.includes("generic_form")) out.push("generic");
  return out;
}

/** Droit d'écrire un formulaire bibliothèque d'une nature donnée (miroir de private.can_write_form). */
export function canWriteLibraryNature(u: User, nature: Enums<"form_nature">): boolean {
  if (isAdmin(u)) return true;
  if (nature === "generic") return u.additional_rights.includes("generic_form");
  if (nature === "model") return u.additional_rights.includes("model_form");
  return false;
}

/**
 * Édition du contenu (builder) : bibliothèque selon nature/droits ; dans une entité uniquement les copies locales
 * (un formulaire importé n'est pas éditable, spec 03 §2.5 « isSwitchModeAuthorized »).
 */
export function canEditFormContent(form: FormLike, u: User, projectRole: TeamRole | null): boolean {
  if (form.location === "library") return canWriteLibraryNature(u, form.nature);
  if (form.origin !== "local") return false;
  return projectRole ? roleAtLeast(projectRole, "writer") : isAdmin(u);
}
