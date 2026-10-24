-- App mobile terrain : sauvegardes chiffrées envoyées au support et journaux d'envoi (spec 05 §6.1, §6.5, §9.9).

-- 1. Clés de chiffrement des sauvegardes, par organisation. La clé privée ne quitte jamais le serveur
--    (schéma privé, fonctions réservées au rôle service) ; les appareils ne reçoivent que la clé publique.
create table if not exists private.organization_backup_keys (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  public_key text not null,
  secret_key text not null,
  created_at timestamptz not null default now()
);

-- Organisation du profil connecté et clé publique (null tant qu'elle n'a pas été générée).
create or replace function public.mobile_backup_key()
 returns table (organization_id uuid, public_key text)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select o.id, k.public_key
    from public.organizations o
    left join private.organization_backup_keys k on k.organization_id = o.id
   where o.id = private.current_org_id()
$function$;
revoke all on function public.mobile_backup_key() from public, anon;
grant execute on function public.mobile_backup_key() to authenticated;

-- Enregistre une paire générée par la fonction Edge ; renvoie la clé publique en vigueur (la première gagne).
create or replace function public.backup_key_store(p_organization_id uuid, p_public_key text, p_secret_key text)
 returns text
 language sql
 security definer
 set search_path to ''
as $function$
  insert into private.organization_backup_keys (organization_id, public_key, secret_key)
  values (p_organization_id, p_public_key, p_secret_key)
  on conflict (organization_id) do nothing;
  select public_key from private.organization_backup_keys where organization_id = p_organization_id;
$function$;
revoke all on function public.backup_key_store(uuid, text, text) from public, anon, authenticated;
grant execute on function public.backup_key_store(uuid, text, text) to service_role;

create or replace function public.backup_secret_key(p_organization_id uuid)
 returns text
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select secret_key from private.organization_backup_keys where organization_id = p_organization_id
$function$;
revoke all on function public.backup_secret_key(uuid) from public, anon, authenticated;
grant execute on function public.backup_secret_key(uuid) to service_role;

-- Admin Siteflow de l'organisation (pages « Backups » et « Logs push » de la WebApp).
create or replace function private.is_siteflow_admin(p_organization_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select exists (select 1 from private.current_collaborator() c
                 where c.organization_id = p_organization_id and c.authority = 'siteflow_admin')
$function$;

-- 2. Sauvegardes déposées par les appareils.
create table if not exists public.mobile_backups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  principal_id uuid not null references public.collaborators(id) on delete cascade,
  device_id text,
  storage_path text not null unique,
  size bigint,
  trigger text not null check (trigger in ('manual', 'support', 'auto', 'database_error')),
  app_version text,
  created_at timestamptz not null default now()
);
create index if not exists mobile_backups_org_idx on public.mobile_backups (organization_id, created_at desc);
alter table public.mobile_backups enable row level security;
create policy mobile_backups_insert on public.mobile_backups for insert to authenticated
  with check (principal_id = (select private.current_collaborator_id()) and organization_id = (select private.current_org_id()));
create policy mobile_backups_select on public.mobile_backups for select to authenticated
  using ((select private.is_siteflow_admin(organization_id)));
grant select, insert on public.mobile_backups to authenticated;

-- 3. Journal d'actions de l'appareil (envoi, bascule en ligne / hors ligne, téléchargement, scan…), « Logs push ».
create table if not exists public.mobile_log_entries (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  principal_id uuid not null references public.collaborators(id) on delete cascade,
  device_id text,
  app_version text,
  action text not null check (char_length(action) between 1 and 64),
  detail jsonb,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index if not exists mobile_log_entries_org_idx on public.mobile_log_entries (organization_id, occurred_at desc);
alter table public.mobile_log_entries enable row level security;
create policy mobile_log_entries_insert on public.mobile_log_entries for insert to authenticated
  with check (principal_id = (select private.current_collaborator_id()) and organization_id = (select private.current_org_id()));
create policy mobile_log_entries_select on public.mobile_log_entries for select to authenticated
  using ((select private.is_siteflow_admin(organization_id)));
grant select, insert on public.mobile_log_entries to authenticated;

-- 4. Stockage des sauvegardes : <organisation>/<profil>/<fichier>.imb, dépôt par l'appareil du profil uniquement.
insert into storage.buckets (id, name, public) values ('mobile-backups', 'mobile-backups', false) on conflict (id) do nothing;
create policy mobile_backups_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'mobile-backups'
              and (storage.foldername(name))[1] = (select private.current_org_id())::text
              and (storage.foldername(name))[2] = (select private.current_collaborator_id())::text);
create policy mobile_backups_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'mobile-backups' and (select private.is_siteflow_admin(((storage.foldername(name))[1])::uuid)));
