-- =============================================================================
-- App mobile terrain — compléments de schéma pour PowerSync (spec 05 §9.3).
-- Les Sync Streams ne savent filtrer que par égalité / IN sur des sous-requêtes simples :
-- on matérialise donc les droits d'accès mobiles et on dénormalise flow_id / project_id.
-- =============================================================================

-- ===== Droits d'accès mobiles (maintenus par déclencheurs) ======================
-- Entités visibles sur le terrain : membre de l'entité, ou tablette affectée à l'entité.
-- Seules les entités de type « project », non archivées ni supprimées.
create table if not exists public.mobile_project_access (
  project_id uuid not null references public.projects(id) on delete cascade,
  principal_id uuid not null references public.collaborators(id) on delete cascade,
  auth_user_id uuid,
  primary key (project_id, principal_id)
);
create index if not exists mobile_project_access_user_idx on public.mobile_project_access (auth_user_id, project_id);
create index if not exists mobile_project_access_principal_idx on public.mobile_project_access (principal_id);

-- Flows téléchargeables : entité accessible + statut personnalisé « téléchargeable ».
create table if not exists public.mobile_flow_access (
  flow_id uuid not null references public.flows(id) on delete cascade,
  principal_id uuid not null references public.collaborators(id) on delete cascade,
  project_id uuid not null,
  auth_user_id uuid,
  primary key (flow_id, principal_id)
);
create index if not exists mobile_flow_access_user_idx on public.mobile_flow_access (auth_user_id, flow_id);
create index if not exists mobile_flow_access_project_idx on public.mobile_flow_access (project_id);
create index if not exists mobile_flow_access_principal_idx on public.mobile_flow_access (principal_id);

alter table public.mobile_project_access enable row level security;
alter table public.mobile_flow_access enable row level security;
-- Lecture de ses propres droits uniquement (diagnostic) ; aucune écriture directe.
drop policy if exists mobile_project_access_select on public.mobile_project_access;
create policy mobile_project_access_select on public.mobile_project_access for select to authenticated
  using (auth_user_id = (select auth.uid()));
drop policy if exists mobile_flow_access_select on public.mobile_flow_access;
create policy mobile_flow_access_select on public.mobile_flow_access for select to authenticated
  using (auth_user_id = (select auth.uid()));
revoke insert, update, delete on public.mobile_project_access, public.mobile_flow_access from authenticated;
grant all on public.mobile_project_access, public.mobile_flow_access to service_role;

-- Recalcule les flows téléchargeables d'un flow donné.
create or replace function private.mobile_access_refresh_flow(p_flow_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.mobile_flow_access where flow_id = p_flow_id;
  insert into public.mobile_flow_access (flow_id, principal_id, project_id, auth_user_id)
  select f.id, a.principal_id, f.project_id, a.auth_user_id
    from public.flows f
    join public.custom_statuses cs on cs.id = f.custom_status_id and cs.downloadable
    join public.mobile_project_access a on a.project_id = f.project_id
   where f.id = p_flow_id and f.deleted_at is null;
end $$;

-- Recalcule toute une entité (droits d'entité puis flows).
create or replace function private.mobile_access_refresh_project(p_project_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
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
    join public.collaborators c on c.id = m.id and c.deleted_at is null
   where p.id = p_project_id and p.type = 'project' and not p.archived and p.deleted_at is null;

  delete from public.mobile_flow_access where project_id = p_project_id;
  insert into public.mobile_flow_access (flow_id, principal_id, project_id, auth_user_id)
  select f.id, a.principal_id, f.project_id, a.auth_user_id
    from public.flows f
    join public.custom_statuses cs on cs.id = f.custom_status_id and cs.downloadable
    join public.mobile_project_access a on a.project_id = f.project_id
   where f.project_id = p_project_id and f.deleted_at is null;
end $$;

create or replace function private.mobile_access_on_project_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform private.mobile_access_refresh_project(old.project_id); end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.project_id is distinct from old.project_id) then
    perform private.mobile_access_refresh_project(new.project_id);
  end if;
  return null;
end $$;

drop trigger if exists project_members_mobile_access on public.project_members;
create trigger project_members_mobile_access after insert or update or delete on public.project_members
  for each row execute function private.mobile_access_on_project_link();
drop trigger if exists project_tablets_mobile_access on public.project_tablets;
create trigger project_tablets_mobile_access after insert or update or delete on public.project_tablets
  for each row execute function private.mobile_access_on_project_link();

create or replace function private.mobile_access_on_project()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.mobile_access_refresh_project(new.id);
  return null;
end $$;

drop trigger if exists projects_mobile_access on public.projects;
create trigger projects_mobile_access after update of type, archived, deleted_at on public.projects
  for each row when ((new.type, new.archived, new.deleted_at) is distinct from (old.type, old.archived, old.deleted_at))
  execute function private.mobile_access_on_project();

create or replace function private.mobile_access_on_flow()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.mobile_access_refresh_flow(new.id);
  return null;
end $$;

drop trigger if exists flows_mobile_access_ins on public.flows;
create trigger flows_mobile_access_ins after insert on public.flows
  for each row execute function private.mobile_access_on_flow();
drop trigger if exists flows_mobile_access_upd on public.flows;
create trigger flows_mobile_access_upd after update of custom_status_id, project_id, deleted_at on public.flows
  for each row when ((new.custom_status_id, new.project_id, new.deleted_at)
                     is distinct from (old.custom_status_id, old.project_id, old.deleted_at))
  execute function private.mobile_access_on_flow();

create or replace function private.mobile_access_on_custom_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  for v in select f.id from public.flows f where f.custom_status_id = new.id and f.deleted_at is null loop
    perform private.mobile_access_refresh_flow(v);
  end loop;
  return null;
end $$;

drop trigger if exists custom_statuses_mobile_access on public.custom_statuses;
create trigger custom_statuses_mobile_access after update of downloadable on public.custom_statuses
  for each row when (new.downloadable is distinct from old.downloadable)
  execute function private.mobile_access_on_custom_status();

-- Compte d'authentification attribué / retiré / profil supprimé.
create or replace function private.mobile_access_on_collaborator()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if new.deleted_at is distinct from old.deleted_at then
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
end $$;

drop trigger if exists collaborators_mobile_access on public.collaborators;
create trigger collaborators_mobile_access after update of auth_user_id, deleted_at on public.collaborators
  for each row when ((new.auth_user_id, new.deleted_at) is distinct from (old.auth_user_id, old.deleted_at))
  execute function private.mobile_access_on_collaborator();

create or replace function private.mobile_access_on_tablet()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  for v in select pt.project_id from public.project_tablets pt where pt.tablet_id = new.id loop
    perform private.mobile_access_refresh_project(v);
  end loop;
  return null;
end $$;

drop trigger if exists tablets_mobile_access on public.tablets;
create trigger tablets_mobile_access after update of collaborator_id, deleted_at on public.tablets
  for each row when ((new.collaborator_id, new.deleted_at) is distinct from (old.collaborator_id, old.deleted_at))
  execute function private.mobile_access_on_tablet();

-- Reprise de l'existant.
do $$
declare v uuid;
begin
  for v in select id from public.projects loop
    perform private.mobile_access_refresh_project(v);
  end loop;
end $$;

-- ===== Dénormalisation flow_id / project_id ======================================
alter table public.form_response_values
  add column if not exists flow_id uuid,
  add column if not exists project_id uuid;
create index if not exists form_response_values_flow_idx on public.form_response_values (flow_id) where flow_id is not null;
create index if not exists form_response_values_project_idx on public.form_response_values (project_id);

create or replace function private.form_response_values_denorm()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select r.flow_id, r.project_id into new.flow_id, new.project_id
    from public.form_responses r where r.id = new.response_id;
  return new;
end $$;

drop trigger if exists form_response_values_denorm on public.form_response_values;
create trigger form_response_values_denorm before insert or update of response_id on public.form_response_values
  for each row execute function private.form_response_values_denorm();

create or replace function private.form_responses_propagate_denorm()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.form_response_values set flow_id = new.flow_id, project_id = new.project_id
   where response_id = new.id;
  update public.custom_field_values set flow_id = new.flow_id, project_id = new.project_id
   where business_class = 'form_response' and object_id = new.id;
  return null;
end $$;

drop trigger if exists form_responses_propagate_denorm on public.form_responses;
create trigger form_responses_propagate_denorm after update of flow_id, project_id on public.form_responses
  for each row when ((new.flow_id, new.project_id) is distinct from (old.flow_id, old.project_id))
  execute function private.form_responses_propagate_denorm();

update public.form_response_values v set flow_id = r.flow_id, project_id = r.project_id
  from public.form_responses r where r.id = v.response_id;

alter table public.custom_field_values
  add column if not exists flow_id uuid,
  add column if not exists project_id uuid;
create index if not exists custom_field_values_flow_idx on public.custom_field_values (flow_id) where flow_id is not null;
create index if not exists custom_field_values_project_idx on public.custom_field_values (project_id) where project_id is not null;

-- Rattachement d'une valeur d'attribut à son flow / son entité selon la classe métier de l'objet.
create or replace function private.custom_field_values_denorm()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.flow_id := null;
  new.project_id := null;
  case new.business_class
    when 'project' then
      new.project_id := new.object_id;
    when 'flow' then
      select f.id, f.project_id into new.flow_id, new.project_id from public.flows f where f.id = new.object_id;
    when 'phase' then
      select f.id, f.project_id into new.flow_id, new.project_id
        from public.phases p join public.flows f on f.id = p.flow_id where p.id = new.object_id;
    when 'step' then
      select f.id, f.project_id into new.flow_id, new.project_id
        from public.steps s join public.flows f on f.id = s.flow_id where s.id = new.object_id;
    when 'form_response' then
      select r.flow_id, r.project_id into new.flow_id, new.project_id
        from public.form_responses r where r.id = new.object_id;
    else null;
  end case;
  return new;
end $$;

drop trigger if exists custom_field_values_denorm on public.custom_field_values;
create trigger custom_field_values_denorm before insert or update of object_id, business_class on public.custom_field_values
  for each row execute function private.custom_field_values_denorm();

update public.custom_field_values set object_id = object_id;

-- Un flow qui change d'entité entraîne ses valeurs d'attributs (flow, phases, étapes).
create or replace function private.flows_propagate_project()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.custom_field_values set project_id = new.project_id where flow_id = new.id;
  return null;
end $$;

drop trigger if exists flows_propagate_project on public.flows;
create trigger flows_propagate_project after update of project_id on public.flows
  for each row when (new.project_id is distinct from old.project_id)
  execute function private.flows_propagate_project();

-- ===== Réponses visibles sur le terrain ==========================================
-- organizations.allowed_download_response = nombre de réponses terminées téléchargées par lien
-- (null = toutes) ; les réponses en cours sont toujours téléchargées.
alter table public.form_responses add column if not exists mobile_visible boolean not null default true;
create index if not exists form_responses_flow_mobile_idx on public.form_responses (flow_id) where mobile_visible and deleted_at is null;

-- Recalcule la visibilité d'un groupe : un lien bloc↔formulaire, ou (entité, lignée de formulaire)
-- pour les réponses de contexte entité.
create or replace function private.form_responses_refresh_mobile_visible(p_block_link_id uuid, p_project_id uuid, p_lineage_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  with grp as (
    select r.id, r.state,
           row_number() over (partition by r.state order by r.done_at desc nulls last, r.created_at desc) as rk,
           o.allowed_download_response as lim
      from public.form_responses r
      join public.organizations o on o.id = r.organization_id
     where r.deleted_at is null
       and case when p_block_link_id is not null then r.block_link_id = p_block_link_id
                else r.block_link_id is null and r.project_id = p_project_id and r.form_lineage_id = p_lineage_id end
  )
  update public.form_responses r
     set mobile_visible = (g.state = 'in_progress' or g.lim is null or g.rk <= g.lim)
    from grp g
   where r.id = g.id
     and r.mobile_visible is distinct from (g.state = 'in_progress' or g.lim is null or g.rk <= g.lim);
end $$;

create or replace function private.form_responses_mobile_visible()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (old.block_link_id, old.project_id, old.form_lineage_id)
                          is distinct from (new.block_link_id, new.project_id, new.form_lineage_id) then
    perform private.form_responses_refresh_mobile_visible(old.block_link_id, old.project_id, old.form_lineage_id);
  end if;
  perform private.form_responses_refresh_mobile_visible(new.block_link_id, new.project_id, new.form_lineage_id);
  return null;
end $$;

drop trigger if exists form_responses_mobile_visible on public.form_responses;
create trigger form_responses_mobile_visible
  after insert or update of state, done_at, deleted_at, block_link_id, project_id, form_lineage_id on public.form_responses
  for each row execute function private.form_responses_mobile_visible();

create or replace function private.organizations_mobile_visible()
returns trigger language plpgsql security definer set search_path = '' as $$
declare g record;
begin
  for g in select distinct block_link_id, project_id, form_lineage_id from public.form_responses
            where organization_id = new.id and deleted_at is null loop
    perform private.form_responses_refresh_mobile_visible(g.block_link_id, g.project_id, g.form_lineage_id);
  end loop;
  return null;
end $$;

drop trigger if exists organizations_mobile_visible on public.organizations;
create trigger organizations_mobile_visible after update of allowed_download_response on public.organizations
  for each row when (new.allowed_download_response is distinct from old.allowed_download_response)
  execute function private.organizations_mobile_visible();

do $$
declare g record;
begin
  for g in select distinct block_link_id, project_id, form_lineage_id from public.form_responses where deleted_at is null loop
    perform private.form_responses_refresh_mobile_visible(g.block_link_id, g.project_id, g.form_lineage_id);
  end loop;
end $$;

-- ===== Signatures : parité avec le modèle mobile (spec 05 §7.5) ===================
alter table public.signatures
  add column if not exists local_created_at timestamptz,
  add column if not exists device_id text,
  add column if not exists connection_mode text check (connection_mode in ('online', 'offline')),
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists proxy_principal_first_name text,
  add column if not exists proxy_principal_last_name text,
  add column if not exists proxy_holder_name text;

-- Journal d'événements idempotent : client_event_id est généré par l'appareil (clé de synchro).
alter table public.signature_events
  add column if not exists client_event_id uuid not null default gen_random_uuid(),
  add column if not exists event_sequence int,
  add column if not exists from_state public.signature_state,
  add column if not exists to_state public.signature_state,
  add column if not exists payload_path text,
  add column if not exists reason text;
create unique index if not exists signature_events_client_event_uq on public.signature_events (client_event_id);

-- ===== Déverrouillage signé d'un flow entier (R-SEQ-4) ============================
-- Distinct de flows.unlocked (déverrouillage des référentiels).
alter table public.flows add column if not exists fill_restrictions_skipped boolean not null default false;

create table if not exists public.flow_fill_unlocks (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.flows(id) on delete cascade,
  unlocked_by uuid references public.collaborators(id) on delete set null,
  signature_path text,
  comment text not null check (char_length(btrim(comment)) > 0),
  sign_with_qr_code boolean not null default false,
  signed_at timestamptz not null default now(),
  source public.event_source not null default 'mobile',
  created_at timestamptz not null default now()
);
create index if not exists flow_fill_unlocks_flow_idx on public.flow_fill_unlocks (flow_id);

create or replace function private.flow_fill_unlocks_apply()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.flows set fill_restrictions_skipped = true
   where id = new.flow_id and not fill_restrictions_skipped;
  return null;
end $$;

drop trigger if exists flow_fill_unlocks_apply on public.flow_fill_unlocks;
create trigger flow_fill_unlocks_apply after insert on public.flow_fill_unlocks
  for each row execute function private.flow_fill_unlocks_apply();

-- ===== Traçabilité des redirections d'étape (spec 05 §4.5) ========================
create table if not exists public.step_navigation_events (
  id uuid primary key default gen_random_uuid(),
  step_navigation_id uuid references public.step_navigations(id) on delete set null,
  step_id uuid not null references public.steps(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  action text not null check (action in ('navigate', 'exit', 'skip')),
  comment text,
  actor_id uuid references public.collaborators(id) on delete set null,
  source public.event_source not null default 'mobile',
  occurred_at timestamptz not null default now()
);
create index if not exists step_navigation_events_flow_idx on public.step_navigation_events (flow_id, occurred_at desc);
create index if not exists step_navigation_events_step_idx on public.step_navigation_events (step_id);
create index if not exists step_navigation_events_actor_idx on public.step_navigation_events (actor_id);

-- Journaux : lecture = lecture du flow ; insertion = signataire du flow (pas de modification).
do $$
declare t text;
begin
  foreach t in array array['flow_fill_unlocks', 'step_navigation_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
                    using ((select private.can_read_flow(flow_id)))', t);
    execute format('drop policy if exists %1$s_insert on public.%1$I', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated
                    with check ((select private.can_sign_flow(flow_id)))', t);
    execute format('grant select, insert on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- ===== Carte : configuration du fournisseur de tuiles ============================
alter table public.organizations add column if not exists map_config jsonb;
