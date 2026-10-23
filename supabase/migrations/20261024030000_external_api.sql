-- =============================================================================
-- API externe v2 : clés d'accès (consommateurs API), jetons d'accès 24 h, journal des appels.
-- Réf. docs/reverse/helpcenter « API-key-Scope », « Typology-of-errors », « Retrieving-lists-of-items ».
--
-- Sécurité :
--  * le secret client n'est JAMAIS stocké en clair : empreinte scrypt (sel aléatoire) dans api_client_secrets ;
--  * les jetons d'accès sont opaques, stockés sous forme d'empreinte SHA-256 (api_access_tokens) ;
--  * api_client_secrets et api_access_tokens n'ont aucune politique : seul le rôle service (route handlers) y accède ;
--  * api_clients et api_request_logs sont lisibles par les administrateurs Siteflow de l'organisation uniquement.
-- =============================================================================

create type public.api_key_type as enum ('account', 'organization');
create type public.api_service_class as enum ('L1', 'L2', 'L3');

-- ===== CONSOMMATEURS API (clés) ===================================================
create table public.api_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,  -- compte cible (obligatoire pour une clé compte)
  name text not null check (char_length(name) between 3 and 100),
  key_type public.api_key_type not null,
  service_class public.api_service_class not null default 'L1',
  client_id text not null unique check (client_id ~ '^sfc_[A-Za-z0-9]{24,64}$'),
  active boolean not null default true,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.collaborators(id) on delete set null,
  secret_rotated_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.collaborators(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.collaborators(id) on delete set null,
  check (key_type = 'organization' or account_id is not null)
);
create index api_clients_org_idx on public.api_clients (organization_id, created_at);
create index api_clients_account_idx on public.api_clients (account_id);
create index api_clients_created_by_idx on public.api_clients (created_by);
create index api_clients_updated_by_idx on public.api_clients (updated_by);
create index api_clients_revoked_by_idx on public.api_clients (revoked_by);

create trigger set_updated_at before update on public.api_clients
  for each row execute function private.set_updated_at();

-- Le compte cible doit appartenir à l'organisation de la clé.
create or replace function private.api_clients_check_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.account_id is not null and not exists (
    select 1 from public.accounts a where a.id = new.account_id and a.organization_id = new.organization_id
  ) then
    raise exception 'api_client_account_not_in_organization' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger api_clients_check_account before insert or update of account_id, organization_id on public.api_clients
  for each row execute function private.api_clients_check_account();

-- Empreinte du secret (scrypt) : table séparée, inaccessible aux rôles anon / authenticated.
create table public.api_client_secrets (
  api_client_id uuid primary key references public.api_clients(id) on delete cascade,
  secret_hash text not null check (secret_hash like 'scrypt$%'),
  created_at timestamptz not null default now()
);

-- Jetons d'accès opaques (24 h), stockés hachés (SHA-256 hex).
create table public.api_access_tokens (
  id uuid primary key default gen_random_uuid(),
  api_client_id uuid not null references public.api_clients(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_access_tokens_client_idx on public.api_access_tokens (api_client_id);
create index api_access_tokens_expires_idx on public.api_access_tokens (expires_at);

-- ===== JOURNAL DES APPELS ==========================================================
-- Aucune donnée sensible : ni secret, ni jeton, ni corps de requête ; seulement la méthode, le chemin,
-- les noms (pas les valeurs) des paramètres de requête, le statut HTTP et la durée.
create table public.api_request_logs (
  id bigint generated always as identity primary key,
  api_client_id uuid references public.api_clients(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  method text not null,
  path text not null,
  query_keys text[] not null default '{}',
  status int not null,
  error_key text,
  duration_ms int not null default 0,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index api_request_logs_client_idx on public.api_request_logs (api_client_id, created_at desc);
create index api_request_logs_org_idx on public.api_request_logs (organization_id, created_at desc);
create index api_request_logs_account_idx on public.api_request_logs (account_id);

-- ===== RLS ========================================================================
alter table public.api_clients enable row level security;
alter table public.api_client_secrets enable row level security;
alter table public.api_access_tokens enable row level security;
alter table public.api_request_logs enable row level security;

revoke all on public.api_client_secrets from anon, authenticated;
revoke all on public.api_access_tokens from anon, authenticated;
revoke all on public.api_request_logs from anon;
revoke all on public.api_clients from anon;
revoke insert, update, delete on public.api_request_logs from authenticated;

create policy api_clients_select on public.api_clients for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.current_authority()) = 'siteflow_admin');
create policy api_clients_insert on public.api_clients for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.current_authority()) = 'siteflow_admin');
create policy api_clients_update on public.api_clients for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.current_authority()) = 'siteflow_admin')
  with check (organization_id = (select private.current_org_id()) and (select private.current_authority()) = 'siteflow_admin');
create policy api_clients_delete on public.api_clients for delete to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.current_authority()) = 'siteflow_admin');

create policy api_request_logs_select on public.api_request_logs for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.current_authority()) = 'siteflow_admin');

grant select, insert, update, delete on public.api_clients, public.api_client_secrets, public.api_access_tokens, public.api_request_logs to service_role;
grant usage, select on all sequences in schema public to service_role;
