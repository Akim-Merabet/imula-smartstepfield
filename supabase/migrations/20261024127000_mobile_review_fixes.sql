-- Corrections issues de la revue du lot 4 (app mobile terrain).

-- 1. Un profil désactivé, bloqué ou supprimé ne synchronise plus rien : les Sync Streams contournent la RLS et
--    s'appuient sur mobile_project_access / mobile_flow_access (ce dernier dérive du premier).
create or replace function private.mobile_access_refresh_project(p_project_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  delete from public.mobile_project_access where project_id = p_project_id;
  insert into public.mobile_project_access (project_id, principal_id, auth_user_id)
  select p.id, c.id, c.auth_user_id
    from public.projects p
    join lateral (
      select pm.collaborator_id as id from public.project_members pm where pm.project_id = p.id
      union
      select t.collaborator_id from public.project_tablets pt
        join public.tablets t on t.id = pt.tablet_id
       where pt.project_id = p.id and t.deleted_at is null and t.collaborator_id is not null
    ) m on true
    join public.collaborators c on c.id = m.id and c.deleted_at is null and c.status = 'active'
   where p.id = p_project_id and p.type = 'project' and not p.archived and p.deleted_at is null;

  delete from public.mobile_flow_access where project_id = p_project_id;
  insert into public.mobile_flow_access (flow_id, principal_id, project_id, auth_user_id)
  select f.id, a.principal_id, f.project_id, a.auth_user_id
    from public.flows f
    join public.custom_statuses cs on cs.id = f.custom_status_id and cs.downloadable
    join public.mobile_project_access a on a.project_id = f.project_id
   where f.project_id = p_project_id and f.deleted_at is null;
end $function$;

drop trigger if exists collaborators_mobile_access on public.collaborators;
create trigger collaborators_mobile_access after update of auth_user_id, deleted_at, status on public.collaborators
  for each row when (new.auth_user_id is distinct from old.auth_user_id or new.deleted_at is distinct from old.deleted_at
                     or new.status is distinct from old.status)
  execute function private.mobile_access_on_collaborator();

-- 1 bis. Recalcul des accès sur suppression ou changement de statut du collaborateur.
create or replace function private.mobile_access_on_collaborator()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v uuid;
begin
  if new.deleted_at is distinct from old.deleted_at or new.status is distinct from old.status then
    for v in select pm.project_id from public.project_members pm where pm.collaborator_id = new.id
             union select pt.project_id from public.project_tablets pt
                     join public.tablets t on t.id = pt.tablet_id where t.collaborator_id = new.id loop
      perform private.mobile_access_refresh_project(v);
    end loop;
  else
    update public.mobile_project_access set auth_user_id = new.auth_user_id where principal_id = new.id;
    update public.mobile_flow_access set auth_user_id = new.auth_user_id where principal_id = new.id;
  end if;
  return null;
end $function$;

-- Reprise : profils non actifs déjà présents.
do $$
declare v_project uuid;
begin
  for v_project in select distinct a.project_id from public.mobile_project_access a
                   join public.collaborators c on c.id = a.principal_id where c.status <> 'active' loop
    perform private.mobile_access_refresh_project(v_project);
  end loop;
end $$;

-- 2. Déverrouillage du flow : uniquement par mobile_unlock_flow (commentaire, signature, événement). Le signataire
--    est le profil connecté, sauf identification par QR code d'un collaborateur de l'organisation.
drop policy if exists flow_fill_unlocks_insert on public.flow_fill_unlocks;
revoke insert, update, delete on public.flow_fill_unlocks from authenticated;

create or replace function public.mobile_unlock_flow(p jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_id uuid := (p ->> 'id')::uuid; v_flow uuid := (p ->> 'flow_id')::uuid; v_me uuid := private.current_collaborator_id();
  v_qr boolean := coalesce((p ->> 'sign_with_qr_code')::boolean, false); v_signed timestamptz := (p ->> 'signed_at')::timestamptz;
  v_by uuid := v_me;
begin
  if v_id is null or v_flow is null then raise exception 'INVALID' using errcode = 'P0001'; end if;
  if exists (select 1 from public.flow_fill_unlocks where id = v_id) then return; end if;
  if not private.can_sign_flow(v_flow) then raise exception 'forbidden' using errcode = '42501'; end if;
  if nullif(trim(p ->> 'comment'), '') is null then raise exception 'COMMENT_REQUIRED' using errcode = 'P0001'; end if;
  if not v_qr and nullif(p ->> 'signature_path', '') is null then raise exception 'SIGNATURE_REQUIRED' using errcode = 'P0001'; end if;
  if v_signed is null or v_signed > now() + interval '5 minutes' then raise exception 'INVALID_DATE' using errcode = 'P0001'; end if;
  if v_qr and nullif(p ->> 'unlocked_by', '') is not null then
    select c.id into v_by from public.collaborators c
     where c.id = (p ->> 'unlocked_by')::uuid and c.organization_id = private.current_org_id() and c.deleted_at is null;
    if v_by is null then raise exception 'INVALID_SIGNATORY' using errcode = 'P0001'; end if;
  end if;

  insert into public.flow_fill_unlocks (id, flow_id, unlocked_by, signature_path, comment, sign_with_qr_code, signed_at, source)
  values (v_id, v_flow, v_by, nullif(p ->> 'signature_path', ''), trim(p ->> 'comment'), v_qr, v_signed, 'mobile');
  insert into public.flow_events (flow_id, event_type, actor_id) values (v_flow, 'skip_fill_restriction', v_me);
end $function$;

-- 3. Auteur d'une redirection = profil connecté (pas une valeur envoyée par l'appareil).
create or replace function private.step_navigation_events_actor()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  new.actor_id := coalesce(private.current_collaborator_id(), new.actor_id);
  return new;
end $function$;
drop trigger if exists step_navigation_events_actor on public.step_navigation_events;
create trigger step_navigation_events_actor before insert on public.step_navigation_events
  for each row execute function private.step_navigation_events_actor();

-- 4. Étape saisissable (active, phase active, pas « WebApp uniquement », non verrouillée) aussi pour la validation,
--    la reprise d'une signature en attente et la création d'une réponse liée à une étape.
create or replace function public.mobile_validate_step(p_step_id uuid, p_validated_at timestamptz default null)
 returns text[]
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare s public.steps; v_missing text[]; v_me uuid := private.current_collaborator_id(); v_err text;
begin
  select * into s from public.steps where id = p_step_id;
  if s.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.can_write_flow(s.flow_id, 'operator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if s.validated_at is not null then return '{}'; end if;
  v_err := private.mobile_step_writable(p_step_id);
  if v_err = 'STEP_LOCKED' then return array['sequence']; end if;
  if v_err is not null then return array[lower(v_err)]; end if;
  v_missing := private.step_missing_mandatory(p_step_id);
  if array_length(v_missing, 1) > 0 then return v_missing; end if;
  update public.steps
     set validated_at = least(coalesce(p_validated_at, now()), now()), validated_by = v_me, validation_source = 'mobile'
   where id = p_step_id;
  insert into public.flow_events (flow_id, event_type, actor_id, phase_id, step_id)
  values (s.flow_id, 'validate_step', v_me, s.phase_id, s.id);
  return '{}';
end $function$;

create or replace function public.mobile_complete_signature(p_id uuid, p_signature_path text, p_signed_at timestamptz, p_comment text default null)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare s public.signatures; v_me uuid := private.current_collaborator_id(); v_seq int; v_err text;
begin
  select * into s from public.signatures where id = p_id;
  if s.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not private.can_sign_flow(s.flow_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if s.state = 'signed' then return; end if;
  if s.state <> 'waiting' or s.disabled then raise exception 'NOT_WAITING' using errcode = 'P0001'; end if;
  v_err := private.mobile_step_writable(s.step_id);
  if v_err is not null then raise exception '%', v_err using errcode = 'P0001'; end if;
  if nullif(p_signature_path, '') is null and not s.sign_with_qr_code then raise exception 'SIGNATURE_REQUIRED' using errcode = 'P0001'; end if;
  if p_signed_at is null or p_signed_at > now() + interval '5 minutes' or (s.proxied and p_signed_at < s.proxy_date) then
    raise exception 'INVALID_DATE' using errcode = 'P0001';
  end if;
  update public.signatures
     set state = 'signed', signature_path = nullif(p_signature_path, ''), signed_at = p_signed_at,
         comment = coalesce(nullif(trim(p_comment), ''), comment)
   where id = p_id;
  select coalesce(max(event_sequence), -1) + 1 into v_seq from public.signature_events where signature_id = p_id;
  insert into public.signature_events (block_id, flow_id, signature_id, action, nature, actor_id, source, occurred_at,
                                       event_sequence, from_state, to_state, reason)
  values (s.block_id, s.flow_id, p_id, 'update', s.nature, v_me, 'mobile', p_signed_at, v_seq, 'waiting', 'signed', nullif(trim(p_comment), ''));
end $function$;

create or replace function private.mobile_check_response_link(p jsonb)
 returns void
 language plpgsql
 stable
 set search_path to ''
as $function$
declare v_step uuid; v_err text;
begin
  select l.step_id into v_step from public.form_block_links l where l.id = nullif(p ->> 'block_link_id', '')::uuid;
  if v_step is null then return; end if;
  v_err := private.mobile_step_writable(v_step);
  if v_err is not null then raise exception '%', v_err using errcode = 'P0001'; end if;
end $function$;

-- Appel en tête de mobile_create_form_response (la fonction existante reste la référence pour le reste).
alter function public.mobile_create_form_response(jsonb) rename to mobile_create_form_response_core;
revoke all on function public.mobile_create_form_response_core(jsonb) from public, anon, authenticated;
create or replace function public.mobile_create_form_response(p jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not exists (select 1 from public.form_responses where id = (p ->> 'id')::uuid) then
    perform private.mobile_check_response_link(p);
  end if;
  perform public.mobile_create_form_response_core(p);
end $function$;
revoke all on function public.mobile_create_form_response(jsonb) from public, anon;
grant execute on function public.mobile_create_form_response(jsonb) to authenticated;

-- 5. La suppression ou le changement de compte d'une tablette suit sur son collaborateur « appareil »
--    (un QR déjà émis ne rouvre plus de session pour une tablette supprimée).
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
  select a.organization_id into v_org from public.accounts a where a.id = new.account_id;
  if new.collaborator_id is null then
    insert into public.collaborators (organization_id, account_id, kind, first_name, last_name, trigram, company_id, status)
    values (v_org, new.account_id, 'device', left(new.name, 50), '', 'TAB', new.company_id, new.profile_status)
    returning id into v_id;
    new.collaborator_id := v_id;
  elsif tg_op = 'UPDATE' and (new.name, new.company_id, new.profile_status, new.deleted_at, new.account_id)
        is distinct from (old.name, old.company_id, old.profile_status, old.deleted_at, old.account_id) then
    update public.collaborators
       set first_name = left(new.name, 50), company_id = new.company_id, account_id = new.account_id, organization_id = v_org,
           status = case when new.deleted_at is not null then 'deleted'::public.collaborator_status else new.profile_status end,
           deleted_at = new.deleted_at, updated_at = now()
     where id = new.collaborator_id;
    if new.deleted_at is not null then
      delete from public.mobile_device_bindings where principal_id = new.collaborator_id;
      update public.quick_connection_tokens set revoked_at = now() where principal_id = new.collaborator_id and revoked_at is null;
    end if;
  end if;
  return new;
end $function$;

update public.collaborators c set status = 'deleted', deleted_at = t.deleted_at
  from public.tablets t where t.collaborator_id = c.id and t.deleted_at is not null and c.deleted_at is null;

-- 6. Vérification du mot de passe d'un utilisateur (« Connexion avec QR code » de la WebApp) sans ouvrir de session.
create or replace function public.verify_user_password(p_user_id uuid, p_password text)
 returns boolean
 language sql
 security definer
 set search_path to ''
as $function$
  select exists (select 1 from auth.users u
                 where u.id = p_user_id and u.encrypted_password is not null
                   and u.encrypted_password = extensions.crypt(p_password, u.encrypted_password))
$function$;
revoke all on function public.verify_user_password(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_user_password(uuid, text) to service_role;
