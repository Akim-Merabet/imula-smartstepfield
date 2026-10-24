-- App mobile terrain : périmètre du profil « appareil » d'une tablette (spec 05 §1.2, §9.2).

-- 1. Une tablette ne voit que les entités auxquelles elle est affectée (project_tablets, via private.project_role),
--    pas tout son compte comme un utilisateur : on l'exclut de la visibilité par compte.
create or replace function private.accessible_account_ids()
 returns setof uuid
 language sql
 stable security definer
 set search_path to ''
as $function$
  with me as (select * from private.current_collaborator())
  select a.id from public.accounts a, me
  where a.organization_id = me.organization_id
    and me.kind <> 'device'
    and (a.id = me.account_id or me.authority in ('global_admin','siteflow_admin'))
$function$;

-- 2. L'état du collaborateur « appareil » suit l'état de la tablette (Activé / Désactivé = profile_status),
--    et non son état matériel (status : cassée, en panne…). Une tablette désactivée ne peut plus se connecter.
create or replace function private.tablet_sync_device_collaborator()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_org uuid;
  v_id uuid;
begin
  if new.collaborator_id is null then
    select a.organization_id into v_org from public.accounts a where a.id = new.account_id;
    insert into public.collaborators (organization_id, account_id, kind, first_name, last_name, trigram, company_id, status)
    values (v_org, new.account_id, 'device', left(new.name, 50), '', 'TAB', new.company_id, new.profile_status)
    returning id into v_id;
    new.collaborator_id := v_id;
  elsif tg_op = 'UPDATE' and (new.name, new.company_id, new.profile_status) is distinct from (old.name, old.company_id, old.profile_status) then
    update public.collaborators
       set first_name = left(new.name, 50), company_id = new.company_id, status = new.profile_status, updated_at = now()
     where id = new.collaborator_id;
  end if;
  return new;
end $function$;

update public.collaborators c
   set status = t.profile_status, updated_at = now()
  from public.tablets t
 where t.collaborator_id = c.id and c.status is distinct from t.profile_status;

-- 3. Membre d'une entité = membre de l'équipe ou tablette affectée (utilisé par la politique projects_select).
create or replace function private.is_project_member(p_project_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select private.project_role(p_project_id) is not null
$function$;
