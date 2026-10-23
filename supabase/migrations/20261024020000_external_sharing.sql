-- =============================================================================
-- Partage externe (spec 03 §9, spec 04 §5.8, spec 01 §4.7) + journal des e-mails sortants.
-- Les parcours externes passent exclusivement par des route handlers / server actions
-- qui vérifient la session de partage puis utilisent le client service (filtres stricts sur la cible).
-- =============================================================================

-- ----- Partages de formulaires : contrôle du code secret, contribution, contributeur -----
alter table public.form_shares
  add column if not exists code_attempts int not null default 0,
  add column if not exists code_sent_at timestamptz,
  add column if not exists contribution_response_id uuid references public.form_responses(id) on delete set null,
  add column if not exists external_user_id uuid references public.external_users(id) on delete set null,
  add column if not exists last_access_at timestamptz;
create unique index if not exists form_shares_token_hash_uq on public.form_shares (token_hash);
create index if not exists form_shares_contribution_idx on public.form_shares (contribution_response_id);
create index if not exists form_shares_external_user_idx on public.form_shares (external_user_id);

-- ----- Partages de documents : mêmes contrôles -----
alter table public.document_shares
  add column if not exists blocked boolean not null default false,
  add column if not exists code_attempts int not null default 0,
  add column if not exists code_sent_at timestamptz,
  add column if not exists external_user_id uuid references public.external_users(id) on delete set null,
  add column if not exists downloaded_at timestamptz,
  add column if not exists last_access_at timestamptz;
create unique index if not exists document_shares_token_hash_uq on public.document_shares (token_hash);
create index if not exists document_shares_external_user_idx on public.document_shares (external_user_id);

-- Les empreintes de jeton et de code ne sont jamais lisibles par les utilisateurs connectés
-- (lecture des autres colonnes inchangée ; écriture toujours soumise à la RLS).
revoke select on public.form_shares from authenticated;
grant select (id, organization_id, project_id, form_id, response_id, email, language, comment, expires_at, sent_at, sent_by,
  blocked, responded_at, revoked_at, contributor, created_at, code_attempts, code_sent_at, contribution_response_id,
  external_user_id, last_access_at) on public.form_shares to authenticated;
revoke select on public.document_shares from authenticated;
grant select (id, organization_id, project_id, document_id, version_id, email, language, comment, expires_at, sent_at, sent_by,
  revoked_at, contributor, created_at, blocked, code_attempts, code_sent_at, external_user_id, downloaded_at, last_access_at)
  on public.document_shares to authenticated;

-- ----- Journal des e-mails sortants (toujours écrit ; SMTP en plus si configuré) -----
create table if not exists public.outbound_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 64),
  to_email text not null check (char_length(to_email) between 3 and 320),
  subject text not null,
  html text not null,
  text_body text not null,
  status text not null default 'logged' check (status in ('logged', 'sending', 'sent', 'failed')),
  transport text not null default 'log' check (transport in ('log', 'smtp')),
  error text,
  -- Contenu masqué en base (codes / liens) quand un transport réel est utilisé.
  redacted boolean not null default false,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists outbound_emails_org_created_idx on public.outbound_emails (organization_id, created_at desc);

alter table public.outbound_emails enable row level security;
-- Écriture : client service uniquement (aucune politique INSERT/UPDATE/DELETE pour authenticated).
revoke insert, update, delete on public.outbound_emails from authenticated, anon;
drop policy if exists outbound_emails_select on public.outbound_emails;
create policy outbound_emails_select on public.outbound_emails for select to authenticated
  using (organization_id = (select private.current_org_id())
         and (select private.current_authority()) = 'siteflow_admin');

-- ----- Saisie externe : le client service enregistre les rubriques via la même RPC -----
-- (security invoker ; current_collaborator_id() renvoie null pour le rôle service).
grant usage on schema private to service_role;
grant execute on function private.current_collaborator_id() to service_role;
grant execute on function public.save_rubric_values(uuid, uuid, jsonb, jsonb) to service_role;

-- ----- Essai de code secret : réservation atomique d'un essai (anti-force brute concurrente) -----
-- Renvoie le nombre d'essais après incrément, ou null si le partage est bloqué / révoqué / introuvable.
create or replace function public.share_code_attempt(p_kind text, p_id uuid, p_max int)
returns int language plpgsql security invoker set search_path = '' as $$
declare v int;
begin
  if p_kind = 'form' then
    update public.form_shares
       set code_attempts = code_attempts + 1, blocked = (code_attempts + 1 >= p_max)
     where id = p_id and not blocked and revoked_at is null
    returning code_attempts into v;
  elsif p_kind = 'document' then
    update public.document_shares
       set code_attempts = code_attempts + 1, blocked = (code_attempts + 1 >= p_max)
     where id = p_id and not blocked and revoked_at is null
    returning code_attempts into v;
  end if;
  return v;
end $$;
revoke execute on function public.share_code_attempt(text, uuid, int) from public, anon, authenticated;
grant execute on function public.share_code_attempt(text, uuid, int) to service_role;
