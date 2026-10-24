-- =============================================================================
-- App mobile terrain — identité (spec 05 §9.2).
-- Chaque tablette porte un collaborateur « appareil » (kind = 'device') : il reçoit le compte
-- d'authentification de la tablette et sert d'acteur pour toutes les FK (validated_by, actor_id…).
-- Liaison appareil ↔ profil (un appareil par profil) et jetons de connexion rapide par QR.
-- =============================================================================

-- Un collaborateur « appareil » n'a ni e-mail ni niveau d'autorité propres.
alter table public.collaborators drop constraint if exists collaborators_check;
alter table public.collaborators add constraint collaborators_check
  check (kind::text in ('operator', 'device') or (email is not null and authority is not null));

alter table public.tablets
  add column if not exists collaborator_id uuid unique references public.collaborators(id) on delete set null;

-- ----- Création / renommage automatique du collaborateur « appareil » -----
create or replace function private.tablet_sync_device_collaborator()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_id uuid;
begin
  if new.collaborator_id is null then
    select a.organization_id into v_org from public.accounts a where a.id = new.account_id;
    insert into public.collaborators (organization_id, account_id, kind, first_name, last_name, trigram, company_id, status)
    values (v_org, new.account_id, 'device', left(new.name, 50), '', 'TAB', new.company_id,
            case when new.status = 'active' then 'active' else 'inactive' end::public.collaborator_status)
    returning id into v_id;
    new.collaborator_id := v_id;
  elsif tg_op = 'UPDATE' and (new.name, new.company_id, new.status) is distinct from (old.name, old.company_id, old.status) then
    update public.collaborators
       set first_name = left(new.name, 50), company_id = new.company_id,
           status = case when new.status = 'active' then 'active' else 'inactive' end::public.collaborator_status,
           updated_at = now()
     where id = new.collaborator_id;
  end if;
  return new;
end $$;

drop trigger if exists tablets_device_collaborator on public.tablets;
create trigger tablets_device_collaborator before insert or update on public.tablets
  for each row execute function private.tablet_sync_device_collaborator();

-- Reprise des tablettes existantes (le déclencheur crée le collaborateur).
update public.tablets set collaborator_id = null where collaborator_id is null;

-- ----- Un appareil par profil (connexion identifiants / QR) -----
create table if not exists public.mobile_device_bindings (
  principal_id uuid primary key references public.collaborators(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 3 and 200),
  bound_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists mobile_device_bindings_device_idx on public.mobile_device_bindings (device_id);

-- ----- Jetons de connexion rapide (QR) ; seule l'empreinte est stockée -----
create table if not exists public.quick_connection_tokens (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.collaborators(id) on delete cascade,
  token_hash text not null unique,
  device_id text,
  created_by uuid references public.collaborators(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists quick_connection_tokens_principal_idx on public.quick_connection_tokens (principal_id);

alter table public.mobile_device_bindings enable row level security;
alter table public.quick_connection_tokens enable row level security;

-- Lecture par les gestionnaires du compte du profil (WebApp : « Dissocier l'appareil actuel », liste des QR).
-- Écritures : Edge Functions (service_role) et RPC dédiées uniquement.
drop policy if exists mobile_device_bindings_select on public.mobile_device_bindings;
create policy mobile_device_bindings_select on public.mobile_device_bindings for select to authenticated
  using (exists (select 1 from public.collaborators c
                 where c.id = principal_id and c.account_id in (select private.accessible_account_ids())));
drop policy if exists mobile_device_bindings_delete on public.mobile_device_bindings;
create policy mobile_device_bindings_delete on public.mobile_device_bindings for delete to authenticated
  using (exists (select 1 from public.collaborators c
                 where c.id = principal_id and c.account_id in (select private.accessible_account_ids())));

drop policy if exists quick_connection_tokens_select on public.quick_connection_tokens;
create policy quick_connection_tokens_select on public.quick_connection_tokens for select to authenticated
  using (exists (select 1 from public.collaborators c
                 where c.id = principal_id and c.account_id in (select private.accessible_account_ids())));

revoke select on public.quick_connection_tokens from authenticated;
grant select (id, principal_id, device_id, created_by, created_at, expires_at, revoked_at)
  on public.quick_connection_tokens to authenticated;
grant all on public.mobile_device_bindings, public.quick_connection_tokens to service_role;

-- ----- Droits d'une tablette : rôle « opérateur » sur les entités auxquelles elle est affectée -----
-- (project_tablets) ; un rôle de membre explicite reste prioritaire.
create or replace function private.project_role(p_project_id uuid)
returns public.team_role language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select pm.role from public.project_members pm
      where pm.project_id = p_project_id
        and pm.collaborator_id = private.current_collaborator_id()),
    (select 'operator'::public.team_role from public.project_tablets pt
       join public.tablets t on t.id = pt.tablet_id
      where pt.project_id = p_project_id
        and t.collaborator_id = private.current_collaborator_id()
        and t.deleted_at is null
      limit 1))
$$;

create or replace function private.can_read_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and (
        p.account_id in (select private.accessible_account_ids())
        or (p.published and p.organization_id = private.current_org_id())
        or private.project_role(p.id) is not null
      )
  )
$$;
