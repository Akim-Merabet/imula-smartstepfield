-- Collaborateurs : un utilisateur invité (statut « En attente ») devient « Activé » à sa première
-- connexion (acceptation de l'invitation ou définition du mot de passe). Mémorise aussi la dernière
-- connexion (KPI « utilisateur actif »). Les comptes désactivés, bloqués ou supprimés ne sont pas réactivés.
create or replace function private.on_auth_user_sign_in()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
    update public.collaborators c
       set last_sign_in_at = new.last_sign_in_at,
           status = case when c.status = 'onboarding' then 'active'::public.collaborator_status else c.status end
     where c.auth_user_id = new.id;
  end if;
  return new;
end $$;
revoke execute on function private.on_auth_user_sign_in() from public, anon, authenticated;

drop trigger if exists on_auth_user_sign_in on auth.users;
create trigger on_auth_user_sign_in after update of last_sign_in_at on auth.users
  for each row execute function private.on_auth_user_sign_in();
