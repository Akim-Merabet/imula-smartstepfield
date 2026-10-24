-- App mobile terrain : restauration d'une sauvegarde sur l'appareil (spec 05 §6.1, « Importer les données »).
-- La fonction Edge mobile-backup-restore déchiffre la sauvegarde avec la clé privée de l'organisation et ne la rend
-- qu'au profil qui l'a produite : elle identifie l'appelant par cette fonction (organisation et profil du jeton).
create or replace function public.mobile_restore_context()
 returns table (organization_id uuid, principal_id uuid)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  -- Sans profil actif, current_collaborator() rend une ligne vide : écartée.
  select c.organization_id, c.id from private.current_collaborator() c where c.id is not null
$function$;
revoke all on function public.mobile_restore_context() from public, anon;
grant execute on function public.mobile_restore_context() to authenticated;
