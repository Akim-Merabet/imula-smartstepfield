-- =============================================================================
-- Lot 1 — Socle : tenancy (organisation → comptes), dictionnaires, collaborateurs,
-- entités (projets). Réf. docs/specs/01-entites-parametres-collaborateurs.md
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

-- ===== ENUMS =====================================================================
create type public.project_type        as enum ('project','referential','template','pgac','folder');
create type public.authority           as enum ('simple','normal','advanced','admin','global_admin','siteflow_admin',
                                                'co_contractor_user','co_contractor_operator','co_contractor_device');
create type public.additional_right    as enum ('generic_form','model_form','manage_diffusion');
create type public.team_role           as enum ('readonly','operator','writer','expert','responsible');
create type public.collaborator_kind   as enum ('user','operator');
create type public.collaborator_status as enum ('active','inactive','onboarding','blocked','deleted');
create type public.tablet_nature       as enum ('internal','external');
create type public.tablet_status       as enum ('active','disabled','broken','down','maintenance');
create type public.auth_mode           as enum ('basic','sso','basic_sso','sso_webapp');
create type public.ui_language         as enum ('fr','en','de','it');
create type public.export_language     as enum ('none','fr','en','de','it');
create type public.label_family_kind   as enum ('family','category');
create type public.label_family_nature as enum ('project','flow','document','form','risk','equipment','device','team',
                                                'function','legal','skill','contract','technical_object','activity_domain',
                                                'list','hierarchy');
create type public.relative_nature     as enum ('parent','child');
create type public.label_provenance    as enum ('default','entity');
create type public.business_class      as enum ('project','flow','phase','step','document','form','form_response',
                                                'technical_object','multi_pr');
create type public.status_category     as enum ('todo','in_preparation','in_operation','in_progress','done');
create type public.link_type           as enum ('default','entity_family_parent','entity_family',
                                                'entity_parent_family_parent','entity_parent_family');
create type public.custom_field_type   as enum ('text','textarea','label','integer','double','boolean','date','datetime',
                                                'select','multiselect','file','image','metadata','link');
create type public.reference_field     as enum ('ref_ext','ref_int','complement_ref_int','complement_ref_ext');
create type public.counter_type        as enum ('global','local');
create type public.event_source        as enum ('mobile','webapp','api');
create type public.bg_task_status      as enum ('acknowledged','in_progress','done','error','to_retry');
create type public.number_format       as enum ('fr','en');
create type public.index_format        as enum ('numeric_zero','numeric','alpha','numeric_all_zero',
                                                'numeric_all_zero_start_zero','numeric_decimal','numeric_decimal_start_zero');

-- ===== UTILITAIRES ===============================================================
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ===== TENANCY ===================================================================
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subdomain text unique,
  auth_mode public.auth_mode not null default 'basic',
  allowed_download_response int,
  block_form_response_edition boolean not null default false,
  diagram_enabled boolean not null default true,
  link_expiration_days int not null default 30 check (link_expiration_days between 1 and 90),
  links_form_attributes_enabled boolean not null default false,
  local_form_allowed boolean not null default false,
  number_format public.number_format not null default 'fr',
  rubric_permissions_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compte = « Applicabilité » dans l'IHM
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  full_name text,
  address_line_1 text, address_line_2 text, postal_code text, city text, country text,
  phone text, fax text, contact_email text, website text, logo_path text,
  pgac_enabled boolean not null default false,
  pgac_subcontractors text[] not null default '{}',
  file_module_enabled boolean not null default false,
  freeze_signature_date boolean not null default false,
  local_form_creation boolean not null default false,
  auto_lock_form_responses boolean not null default false,
  hide_multi_pr_titles boolean not null default false,
  default_sequence_type text not null default 'linear' check (default_sequence_type in ('linear','parallel')),
  default_phase_type text not null default 'linear' check (default_phase_type in ('linear','parallel')),
  doc_language_1 public.export_language not null default 'fr',
  doc_language_2 public.export_language not null default 'none',
  doc_index_format public.index_format not null default 'alpha',
  doc_watermark text,
  cover_logo jsonb,
  date_formats jsonb not null default '{}'::jsonb,
  time_zone text not null default 'Europe/Paris',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);
create index accounts_organization_id_idx on public.accounts (organization_id);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  name text not null,
  activity_area text,
  comment text,
  logo_path text,
  is_parent_company boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_organization_id_idx on public.companies (organization_id);
create index companies_account_id_idx on public.companies (account_id);
create unique index companies_one_parent_per_org on public.companies (organization_id) where is_parent_company;

-- ===== DICTIONNAIRES =============================================================
create table public.wording_configurations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  read_only boolean not null default false,
  is_default boolean not null default false,
  hide_bpa boolean not null default false,
  hide_bpe_valid boolean not null default false,
  hide_vso_sr boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.wording_configuration_languages (
  id uuid primary key default gen_random_uuid(),
  wording_configuration_id uuid not null references public.wording_configurations(id) on delete cascade,
  language public.ui_language not null,
  fields jsonb not null default '{}'::jsonb, -- {prel:{value,tooltip,icon,color}, bpoAd:{...}, ...}
  unique (wording_configuration_id, language)
);

-- Clients (carnet clients) — propres au compte
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  name_2 text, name_3 text,
  address text not null,
  address_comp text,
  zip_code text not null,
  city text not null,
  country text,
  observation text,
  reference text,
  logo_path text,
  cover_page_enabled boolean not null default false,
  cover_page_pdf_path text,
  page_number_x numeric, page_number_y numeric, index_max int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_account_id_idx on public.clients (account_id);

-- ===== ENTITÉS (déclarée tôt : les catégories locales y font référence) ==========
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  type public.project_type not null,
  is_sub_folder boolean not null default false,
  folder_id uuid references public.projects(id),
  designation text not null check (char_length(designation) between 3 and 255),
  client_id uuid not null references public.clients(id),
  family_id uuid not null, -- FK ajoutée après label_families
  custom_status_id uuid,   -- FK ajoutée après custom_statuses
  business_ref text,
  contract_ref text,
  location_label text,
  description text,
  project_index text,
  is_contractual boolean not null default false,
  internal_command text, external_command text, market_number text, technical_deal text,
  keywords text, business_domain text, national_program text,
  complement_ref_1 text, complement_ref_2 text,
  export_language_1 public.export_language not null default 'none',
  export_language_2 public.export_language not null default 'none',
  is_intern_supervised boolean not null default false,
  supervision_intern_1 text, supervision_intern_2 text, supervision_intern_3 text,
  is_supervised boolean not null default false,
  supervision_1 text, supervision_2 text, supervision_3 text,
  code_project text,
  pgac_activities text[] not null default '{}',
  start_date date, end_date date,
  published boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  check (not is_intern_supervised or supervision_intern_1 is not null),
  check (not is_supervised or supervision_1 is not null),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index projects_account_id_idx on public.projects (account_id) where deleted_at is null;
create index projects_organization_published_idx on public.projects (organization_id) where published and deleted_at is null;
create index projects_folder_id_idx on public.projects (folder_id);
create index projects_client_id_idx on public.projects (client_id);
create index projects_family_id_idx on public.projects (family_id);

-- Familles + catégories (+ catégories par défaut et catégories locales d'une entité)
create table public.label_families (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade, -- null = partagé dans l'organisation
  project_id uuid references public.projects(id) on delete cascade, -- catégorie locale d'une entité
  kind public.label_family_kind not null,
  nature public.label_family_nature not null,
  relative_nature public.relative_nature not null,
  parent_id uuid references public.label_families(id),
  provenance public.label_provenance,
  default_source_id uuid references public.label_families(id),
  short_name text not null check (char_length(short_name) >= 1),
  long_name text,
  code text,
  color text not null default '#5e5a5a',
  priority int not null default 0,
  quality_reference text,
  logo_path text,
  client_supervision boolean not null default false,
  client_supervision_sub_index boolean not null default false,
  wording_configuration_id uuid references public.wording_configurations(id),
  active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((relative_nature = 'parent') = (parent_id is null)),
  check (kind = 'category' or nature not in ('list','hierarchy')),
  check (kind = 'family' or nature in ('flow','document','list','hierarchy'))
);
create index label_families_org_idx on public.label_families (organization_id, kind, nature);
create index label_families_account_idx on public.label_families (account_id);
create index label_families_project_idx on public.label_families (project_id);
create index label_families_parent_idx on public.label_families (parent_id);
create unique index label_families_unique_name on public.label_families (
  organization_id,
  coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
  kind, nature,
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(short_name)
) where deleted_at is null;
create unique index label_families_unique_code on public.label_families (organization_id, code)
  where code is not null and deleted_at is null and project_id is null;

alter table public.projects
  add constraint projects_family_id_fkey foreign key (family_id) references public.label_families(id);

create table public.custom_statuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade, -- null = partagé (form, form_response, technical_object)
  nature public.business_class not null
    check (nature in ('project','flow','form','form_response','technical_object','multi_pr')),
  name text not null check (char_length(name) >= 3),
  description text,
  color text not null default '#2563eb',
  category public.status_category not null default 'todo',
  link_type public.link_type not null default 'default',
  label_family_id uuid references public.label_families(id),
  is_default boolean not null default false,
  downloadable boolean not null default false,
  importable boolean not null default false,
  exportable boolean not null default false,
  hide_entity boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index custom_statuses_org_nature_idx on public.custom_statuses (organization_id, nature);
create index custom_statuses_account_idx on public.custom_statuses (account_id);
create index custom_statuses_family_idx on public.custom_statuses (label_family_id);

alter table public.projects
  add constraint projects_custom_status_id_fkey foreign key (custom_status_id) references public.custom_statuses(id);
create index projects_custom_status_idx on public.projects (custom_status_id);

create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  nature public.business_class not null
    check (nature in ('project','flow','phase','step','document','technical_object')),
  type public.custom_field_type not null,
  name text not null check (char_length(name) >= 3),
  link_type public.link_type not null default 'default',
  label_family_id uuid references public.label_families(id),
  choices text[] not null default '{}',
  default_value text,
  placeholder text,
  tooltip text,
  description text,
  required boolean not null default false,
  read_only boolean not null default false,
  pdf_field_name text,
  variable_name text,
  text_display text,
  display_in_flow_card boolean not null default false,
  display_in_flow_banner boolean not null default false,
  display_on_flow_opening boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nature not in ('phase','step') or type in ('text','textarea','integer','double','boolean','date','datetime'))
);
create index custom_fields_account_nature_idx on public.custom_fields (account_id, nature);
create index custom_fields_family_idx on public.custom_fields (label_family_id);
create unique index custom_fields_variable_unique on public.custom_fields (account_id, variable_name)
  where variable_name is not null and deleted_at is null;

-- Valeurs d'attributs : une ligne par (attribut, objet). Multi-valeurs (listes, images) en jsonb.
create table public.custom_field_values (
  custom_field_id uuid not null references public.custom_fields(id) on delete cascade,
  object_id uuid not null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  business_class public.business_class not null,
  value_text text,
  value_json jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (custom_field_id, object_id)
);
create index custom_field_values_object_idx on public.custom_field_values (object_id);
create index custom_field_values_account_idx on public.custom_field_values (account_id);

create table public.reference_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  nature public.business_class not null
    check (nature in ('project','flow','document','form','technical_object')),
  field public.reference_field not null,
  link_type public.link_type not null default 'default',
  label_family_id uuid references public.label_families(id),
  nomenclature text not null,
  counter_type public.counter_type not null default 'global',
  counter_format int not null default 4 check (counter_format between 4 and 8),
  start_value int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reference_rules_account_idx on public.reference_rules (account_id, nature);
create index reference_rules_family_idx on public.reference_rules (label_family_id);

create table public.reference_counters (
  id uuid primary key default gen_random_uuid(),
  reference_rule_id uuid not null references public.reference_rules(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade, -- null = compteur global
  current_value int not null,
  unique nulls not distinct (reference_rule_id, project_id)
);
create index reference_counters_project_idx on public.reference_counters (project_id);

-- ===== COLLABORATEURS ============================================================
create table public.collaborators (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  kind public.collaborator_kind not null,
  first_name text not null check (char_length(first_name) <= 50),
  last_name text not null check (char_length(last_name) <= 50),
  trigram text not null check (char_length(trigram) between 1 and 10),
  email text check (char_length(email) <= 100),
  sso_identifier text,
  register_number text,
  authority public.authority,
  additional_rights public.additional_right[] not null default '{}',
  company_id uuid references public.companies(id),
  function_id uuid references public.label_families(id),
  group_id uuid references public.label_families(id),
  legal_id uuid references public.label_families(id),
  contract_type_id uuid references public.label_families(id),
  complement text,
  profession text,
  language public.ui_language not null default 'fr',
  signature_path text,
  avatar_path text,
  status public.collaborator_status not null default 'onboarding',
  privacy_accepted_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (kind = 'operator' or (email is not null and authority is not null))
);
create index collaborators_account_idx on public.collaborators (account_id);
create index collaborators_org_idx on public.collaborators (organization_id);
create index collaborators_company_idx on public.collaborators (company_id);
create index collaborators_function_idx on public.collaborators (function_id);
create index collaborators_group_idx on public.collaborators (group_id);
create index collaborators_legal_idx on public.collaborators (legal_id);
create index collaborators_contract_idx on public.collaborators (contract_type_id);
create unique index collaborators_email_unique on public.collaborators (organization_id, lower(email))
  where email is not null and kind = 'user';
create unique index collaborators_sso_unique on public.collaborators (organization_id, sso_identifier)
  where sso_identifier is not null;
create unique index collaborators_register_unique on public.collaborators (organization_id, register_number)
  where register_number is not null;

alter table public.projects
  add constraint projects_created_by_fkey foreign key (created_by) references public.collaborators(id) on delete set null,
  add constraint projects_updated_by_fkey foreign key (updated_by) references public.collaborators(id) on delete set null,
  add constraint projects_deleted_by_fkey foreign key (deleted_by) references public.collaborators(id) on delete set null;

create table public.collaborator_default_hierarchies (
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  hierarchy_id uuid not null references public.label_families(id) on delete cascade,
  primary key (collaborator_id, hierarchy_id)
);
create index collaborator_default_hierarchies_h_idx on public.collaborator_default_hierarchies (hierarchy_id);

create table public.collaborator_skills (
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  skill_id uuid not null references public.label_families(id),
  activity_domain_id uuid references public.label_families(id),
  started_at date,
  business_updated_at date,
  ended_at date,
  expertise smallint check (expertise between 0 and 10),
  description text,
  comment text,
  file_paths text[] not null default '{}',
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collaborator_id, skill_id),
  check (ended_at is null or started_at is null or ended_at >= started_at),
  check (ended_at is null or business_updated_at is null or ended_at >= business_updated_at),
  check (business_updated_at is null or started_at is null or business_updated_at >= started_at)
);
create index collaborator_skills_skill_idx on public.collaborator_skills (skill_id);
create index collaborator_skills_domain_idx on public.collaborator_skills (activity_domain_id);

create table public.external_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  first_name text not null check (char_length(first_name) <= 50),
  last_name text not null check (char_length(last_name) <= 50),
  email text not null,
  company_name text not null,
  profession text not null,
  status public.collaborator_status not null default 'active',
  converted_to uuid references public.collaborators(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);
create index external_users_converted_idx on public.external_users (converted_to);

create table public.tablets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (char_length(name) between 3 and 255),
  nature public.tablet_nature not null default 'internal',
  family_id uuid not null references public.label_families(id),
  company_id uuid not null references public.companies(id),
  status public.tablet_status not null default 'active',
  profile_status public.collaborator_status not null default 'active',
  comment text,
  notify_email text not null,
  unique_device_id text, app_version text, android_version text, battery_level int,
  device_model text, screen_size text, mac_address text,
  last_push_at timestamptz,
  last_latitude double precision, last_longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (account_id, name)
);
create index tablets_family_idx on public.tablets (family_id);
create index tablets_company_idx on public.tablets (company_id);

create table public.authorized_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  designation text not null check (char_length(designation) >= 3),
  device_id text not null check (char_length(device_id) >= 3),
  created_at timestamptz not null default now(),
  unique (organization_id, device_id)
);

-- ===== ENTITÉS : membres, historique ============================================
create table public.project_status_history (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  from_status_id uuid references public.custom_statuses(id) on delete set null,
  to_status_id uuid references public.custom_statuses(id) on delete set null,
  comment text,
  source public.event_source not null default 'webapp',
  actor_id uuid references public.collaborators(id) on delete set null,
  created_at timestamptz not null default now()
);
create index project_status_history_project_idx on public.project_status_history (project_id, created_at desc);
create index project_status_history_actor_idx on public.project_status_history (actor_id);
create index project_status_history_from_idx on public.project_status_history (from_status_id);
create index project_status_history_to_idx on public.project_status_history (to_status_id);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  role public.team_role not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  primary key (project_id, collaborator_id)
);
create index project_members_collaborator_idx on public.project_members (collaborator_id);

create table public.project_member_hierarchies (
  project_id uuid not null,
  collaborator_id uuid not null,
  hierarchy_id uuid not null references public.label_families(id) on delete cascade,
  primary key (project_id, collaborator_id, hierarchy_id),
  foreign key (project_id, collaborator_id) references public.project_members (project_id, collaborator_id) on delete cascade
);
create index project_member_hierarchies_h_idx on public.project_member_hierarchies (hierarchy_id);

create table public.project_tablets (
  project_id uuid not null references public.projects(id) on delete cascade,
  tablet_id uuid not null references public.tablets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, tablet_id)
);
create index project_tablets_tablet_idx on public.project_tablets (tablet_id);

create table public.project_access_history (
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  flow_filters jsonb,
  accessed_at timestamptz not null default now(),
  primary key (collaborator_id, project_id)
);
create index project_access_history_project_idx on public.project_access_history (project_id);

-- ===== TECHNIQUE =================================================================
create table public.background_tasks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references public.collaborators(id) on delete set null,
  kind text not null,
  file_type text check (file_type in ('pdf','xlsx','zip')),
  name text,
  status public.bg_task_status not null default 'acknowledged',
  attempts int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  result_path text,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index background_tasks_account_idx on public.background_tasks (account_id, created_at desc);
create index background_tasks_user_idx on public.background_tasks (user_id, created_at desc);
create index background_tasks_project_idx on public.background_tasks (project_id);

-- ===== TRIGGERS updated_at =======================================================
do $$
declare t text;
begin
  foreach t in array array['organizations','accounts','companies','wording_configurations','clients','projects',
    'label_families','custom_statuses','custom_fields','reference_rules','collaborators','collaborator_skills',
    'external_users','tablets']
  loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function private.set_updated_at()', t);
  end loop;
end $$;

-- ===== FONCTIONS D'AUTORISATION (schéma private, non exposé) =====================
-- Collaborateur courant (ligne unique par utilisateur auth).
create or replace function private.current_collaborator()
returns public.collaborators
language sql stable security definer set search_path = '' as $$
  select c.* from public.collaborators c
  where c.auth_user_id = (select auth.uid())
    and c.deleted_at is null
    and c.status = 'active'
  limit 1
$$;

create or replace function private.current_collaborator_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select (private.current_collaborator()).id
$$;

create or replace function private.current_org_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select (private.current_collaborator()).organization_id
$$;

create or replace function private.current_authority()
returns public.authority language sql stable security definer set search_path = '' as $$
  select (private.current_collaborator()).authority
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((private.current_collaborator()).authority in ('admin','global_admin','siteflow_admin'), false)
$$;

create or replace function private.is_admin_or_advanced()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((private.current_collaborator()).authority in ('admin','global_admin','siteflow_admin','advanced'), false)
$$;

-- Comptes accessibles : le sien ; tous ceux de l'organisation pour les admins globaux / Siteflow.
create or replace function private.accessible_account_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  with me as (select * from private.current_collaborator())
  select a.id from public.accounts a, me
  where a.organization_id = me.organization_id
    and (a.id = me.account_id or me.authority in ('global_admin','siteflow_admin'))
$$;

-- Rôle du collaborateur courant dans une entité (null si non membre).
create or replace function private.project_role(p_project_id uuid)
returns public.team_role language sql stable security definer set search_path = '' as $$
  select pm.role from public.project_members pm
  where pm.project_id = p_project_id
    and pm.collaborator_id = private.current_collaborator_id()
$$;

create or replace function private.can_read_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and (
        p.account_id in (select private.accessible_account_ids())
        or (p.published and p.organization_id = private.current_org_id())
        or exists (select 1 from public.project_members pm
                   where pm.project_id = p.id and pm.collaborator_id = private.current_collaborator_id())
      )
  )
$$;

-- Écriture dans le contenu d'une entité : le rôle d'entité prime sur le droit global (spec 01 §3.4).
create or replace function private.can_write_project(p_project_id uuid, p_min_role public.team_role default 'writer')
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when private.project_role(p_project_id) is not null
      then private.project_role(p_project_id) >= p_min_role
    else private.is_admin()
         and exists (select 1 from public.projects p
                     where p.id = p_project_id and p.account_id in (select private.accessible_account_ids()))
  end
$$;

grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ===== RLS ======================================================================
alter table public.organizations                  enable row level security;
alter table public.accounts                       enable row level security;
alter table public.companies                      enable row level security;
alter table public.wording_configurations         enable row level security;
alter table public.wording_configuration_languages enable row level security;
alter table public.clients                        enable row level security;
alter table public.projects                       enable row level security;
alter table public.label_families                 enable row level security;
alter table public.custom_statuses                enable row level security;
alter table public.custom_fields                  enable row level security;
alter table public.custom_field_values            enable row level security;
alter table public.reference_rules                enable row level security;
alter table public.reference_counters             enable row level security;
alter table public.collaborators                  enable row level security;
alter table public.collaborator_default_hierarchies enable row level security;
alter table public.collaborator_skills            enable row level security;
alter table public.external_users                 enable row level security;
alter table public.tablets                        enable row level security;
alter table public.authorized_devices             enable row level security;
alter table public.project_status_history         enable row level security;
alter table public.project_members                enable row level security;
alter table public.project_member_hierarchies     enable row level security;
alter table public.project_tablets                enable row level security;
alter table public.project_access_history         enable row level security;
alter table public.background_tasks               enable row level security;

-- Organisation / comptes
create policy organizations_select on public.organizations for select to authenticated
  using (id = (select private.current_org_id()));
create policy organizations_update on public.organizations for update to authenticated
  using (id = (select private.current_org_id()) and (select private.current_authority()) = 'siteflow_admin')
  with check (id = (select private.current_org_id()));

create policy accounts_select on public.accounts for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy accounts_update on public.accounts for update to authenticated
  using (id in (select private.accessible_account_ids()) and (select private.is_admin()))
  with check (id in (select private.accessible_account_ids()));
create policy accounts_insert on public.accounts for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.current_authority()) = 'siteflow_admin');

-- Dictionnaires partagés organisation (account_id nullable)
create policy companies_select on public.companies for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy companies_write on public.companies for all to authenticated
  using (organization_id = (select private.current_org_id())
         and (select private.current_authority()) in ('global_admin','siteflow_admin'))
  with check (organization_id = (select private.current_org_id()));

create policy wording_select on public.wording_configurations for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy wording_write on public.wording_configurations for all to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.current_authority()) = 'siteflow_admin')
  with check (organization_id = (select private.current_org_id()));
create policy wording_lang_select on public.wording_configuration_languages for select to authenticated
  using (exists (select 1 from public.wording_configurations w
                 where w.id = wording_configuration_id and w.organization_id = (select private.current_org_id())));
create policy wording_lang_write on public.wording_configuration_languages for all to authenticated
  using ((select private.current_authority()) = 'siteflow_admin'
         and exists (select 1 from public.wording_configurations w
                     where w.id = wording_configuration_id and w.organization_id = (select private.current_org_id())))
  with check ((select private.current_authority()) = 'siteflow_admin');

create policy label_families_select on public.label_families for select to authenticated
  using (organization_id = (select private.current_org_id())
         and (account_id is null or account_id in (select private.accessible_account_ids()))
         and (project_id is null or (select private.can_read_project(project_id))));
create policy label_families_write on public.label_families for all to authenticated
  using (organization_id = (select private.current_org_id())
         and (account_id is null or account_id in (select private.accessible_account_ids()))
         and case when project_id is null then (select private.is_admin())
                  else (select private.can_write_project(project_id, 'expert')) end)
  with check (organization_id = (select private.current_org_id())
         and (account_id is null or account_id in (select private.accessible_account_ids())));

create policy custom_statuses_select on public.custom_statuses for select to authenticated
  using (organization_id = (select private.current_org_id())
         and (account_id is null or account_id in (select private.accessible_account_ids())));
create policy custom_statuses_write on public.custom_statuses for all to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin())
         and (account_id is null or account_id in (select private.accessible_account_ids())))
  with check (organization_id = (select private.current_org_id())
         and (account_id is null or account_id in (select private.accessible_account_ids())));

-- Dictionnaires propres au compte
create policy clients_select on public.clients for select to authenticated
  using (account_id in (select private.accessible_account_ids()));
create policy clients_write on public.clients for all to authenticated
  using (account_id in (select private.accessible_account_ids()) and (select private.is_admin_or_advanced()))
  with check (account_id in (select private.accessible_account_ids()));

create policy custom_fields_select on public.custom_fields for select to authenticated
  using (account_id in (select private.accessible_account_ids()));
create policy custom_fields_write on public.custom_fields for all to authenticated
  using (account_id in (select private.accessible_account_ids()) and (select private.is_admin()))
  with check (account_id in (select private.accessible_account_ids()));

create policy custom_field_values_select on public.custom_field_values for select to authenticated
  using (account_id in (select private.accessible_account_ids()));
create policy custom_field_values_write on public.custom_field_values for all to authenticated
  using (account_id in (select private.accessible_account_ids()))
  with check (account_id in (select private.accessible_account_ids()));

create policy reference_rules_select on public.reference_rules for select to authenticated
  using (account_id in (select private.accessible_account_ids()));
create policy reference_rules_write on public.reference_rules for all to authenticated
  using (account_id in (select private.accessible_account_ids()) and (select private.is_admin()))
  with check (account_id in (select private.accessible_account_ids()));
create policy reference_counters_select on public.reference_counters for select to authenticated
  using (exists (select 1 from public.reference_rules r
                 where r.id = reference_rule_id and r.account_id in (select private.accessible_account_ids())));

-- Collaborateurs
create policy collaborators_select on public.collaborators for select to authenticated
  using (organization_id = (select private.current_org_id())
         and (account_id in (select private.accessible_account_ids())
              or auth_user_id = (select auth.uid())
              or exists (select 1 from public.project_members pm
                         where pm.collaborator_id = collaborators.id
                           and (select private.can_read_project(pm.project_id)))));
create policy collaborators_insert on public.collaborators for insert to authenticated
  with check (account_id in (select private.accessible_account_ids()) and (select private.is_admin_or_advanced()));
create policy collaborators_update on public.collaborators for update to authenticated
  using ((account_id in (select private.accessible_account_ids()) and (select private.is_admin_or_advanced()))
         or auth_user_id = (select auth.uid()))
  with check (account_id in (select private.accessible_account_ids()) or auth_user_id = (select auth.uid()));
create policy collaborators_delete on public.collaborators for delete to authenticated
  using (account_id in (select private.accessible_account_ids()) and (select private.is_admin()));

create policy collab_hier_select on public.collaborator_default_hierarchies for select to authenticated
  using (exists (select 1 from public.collaborators c where c.id = collaborator_id
                 and c.account_id in (select private.accessible_account_ids())));
create policy collab_hier_write on public.collaborator_default_hierarchies for all to authenticated
  using ((select private.is_admin_or_advanced()) and exists (select 1 from public.collaborators c where c.id = collaborator_id
                 and c.account_id in (select private.accessible_account_ids())))
  with check ((select private.is_admin_or_advanced()));

create policy collab_skills_select on public.collaborator_skills for select to authenticated
  using (exists (select 1 from public.collaborators c where c.id = collaborator_id
                 and c.organization_id = (select private.current_org_id())));
create policy collab_skills_write on public.collaborator_skills for all to authenticated
  using ((select private.is_admin()) and exists (select 1 from public.collaborators c where c.id = collaborator_id
                 and c.account_id in (select private.accessible_account_ids())))
  with check ((select private.is_admin()));

create policy external_users_select on public.external_users for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy external_users_write on public.external_users for all to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.current_authority()) = 'siteflow_admin')
  with check (organization_id = (select private.current_org_id()));

create policy tablets_select on public.tablets for select to authenticated
  using (account_id in (select private.accessible_account_ids()));
create policy tablets_write on public.tablets for all to authenticated
  using (account_id in (select private.accessible_account_ids()) and (select private.is_admin_or_advanced()))
  with check (account_id in (select private.accessible_account_ids()));

create policy authorized_devices_all on public.authorized_devices for all to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_admin_or_advanced()))
  with check (organization_id = (select private.current_org_id()));

-- Entités
create policy projects_select on public.projects for select to authenticated
  using ((select private.can_read_project(id)));
create policy projects_insert on public.projects for insert to authenticated
  with check (account_id in (select private.accessible_account_ids())
              and (select private.current_authority()) not in ('simple','co_contractor_operator','co_contractor_device'));
create policy projects_update on public.projects for update to authenticated
  using ((select private.can_write_project(id, 'responsible')))
  with check (account_id in (select private.accessible_account_ids()) or (select private.can_write_project(id, 'responsible')));

create policy psh_select on public.project_status_history for select to authenticated
  using ((select private.can_read_project(project_id)));
create policy psh_insert on public.project_status_history for insert to authenticated
  with check ((select private.can_write_project(project_id, 'writer')));

create policy pm_select on public.project_members for select to authenticated
  using ((select private.can_read_project(project_id)));
create policy pm_write on public.project_members for all to authenticated
  using ((select private.can_write_project(project_id, 'expert')))
  with check ((select private.can_write_project(project_id, 'expert')));

create policy pmh_select on public.project_member_hierarchies for select to authenticated
  using ((select private.can_read_project(project_id)));
create policy pmh_write on public.project_member_hierarchies for all to authenticated
  using ((select private.can_write_project(project_id, 'expert')))
  with check ((select private.can_write_project(project_id, 'expert')));

create policy pt_select on public.project_tablets for select to authenticated
  using ((select private.can_read_project(project_id)));
create policy pt_write on public.project_tablets for all to authenticated
  using ((select private.can_write_project(project_id, 'expert')))
  with check ((select private.can_write_project(project_id, 'expert')));

create policy pah_all on public.project_access_history for all to authenticated
  using (collaborator_id = (select private.current_collaborator_id()))
  with check (collaborator_id = (select private.current_collaborator_id()));

create policy bg_tasks_select on public.background_tasks for select to authenticated
  using (user_id = (select private.current_collaborator_id())
         or (account_id in (select private.accessible_account_ids())
             and (select private.current_authority()) in ('global_admin','siteflow_admin')));
