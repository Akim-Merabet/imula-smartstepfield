export type FamilyLike = { short_name: string; long_name: string | null } | null | undefined;

/** Affichage « court - long » d'une famille / catégorie. */
export function familyLabel(f: FamilyLike): string {
  if (!f) return "";
  return f.long_name ? `${f.short_name} - ${f.long_name}` : f.short_name;
}
