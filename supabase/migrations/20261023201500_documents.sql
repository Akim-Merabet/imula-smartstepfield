-- =============================================================================
-- Module Documents : bibliothèque, documents d'entité, versions (suivi), fichiers,
-- dossier de clôture, listes, trames, liens bloc ↔ document, gel des indices.
-- Réf. docs/specs/04-documents.md (§9), spec 02 §5.11 / R-DSI-4.
-- Les transitions du suivi passent par des fonctions publiques SECURITY INVOKER
-- qui délèguent à des fonctions private SECURITY DEFINER (contrôle de droits en tête,
-- verrou FOR UPDATE) : aucune écriture directe sur document_versions.
-- =============================================================================

-- ===== ENUMS ====================================================================
create type public.document_nature as enum (
  'pr','emm','adr','dsi','multi_pr','flow_form','object',
  'project_form','block_form','multi_flow_form',
  'lfa','lda','list_emm','list_emm_flow','list_adr','list_adr_flow',
  'lca','field_feedback','diagram',
  'pdf_versioned','pdf_unversioned',
  'rfi');
create type public.document_source   as enum ('flow','form','module','extern','closing_folder');
create type public.document_scope    as enum ('library','project');
create type public.document_origin   as enum ('local','imported_from_library','derived_from_standard');
create type public.document_state    as enum ('prel','bpo','bpe','temp','bpa','none');
create type public.document_step     as enum ('diffusion','client_res','bpe','bpe_valid',
                                              'diffusion_bpa','client_res_bpa','bpa','bpa_refused','upload_file');
create type public.document_visa     as enum ('diffusion','diffusion_bpa','modification','modification_bpa',
                                              'vso','vso_sr','vao','vso_bpa','vao_bpa','bpe_valid');
create type public.form_content_location as enum ('none','content','appendix');
create type public.selection_strategy    as enum ('all','selected','none');
create type public.closing_section_type  as enum ('document','report','certificate','reference',
                                                  'client_response','document_large_file','closing_folder');
create type public.document_selection_kind as enum ('flow','document','skill','technical_object_attribute',
                                                    'form_response','emm_element');
create type public.project_list_type     as enum ('emm','adr');

-- ===== LISTES (sources des documents « Liste de moyens / risques ») ==============
create table public.project_lists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  type public.project_list_type not null,
  name text not null, reference text, description text,
  category_id uuid references public.label_families(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index project_lists_project_idx on public.project_lists (project_id);
create index project_lists_category_idx on public.project_lists (category_id);
create table public.project_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.project_lists(id) on delete cascade,
  equipment_id uuid references public.library_equipments(id) on delete restrict,
  risk_id uuid references public.library_risks(id) on delete restrict,
  quantity numeric, unit text, consumable boolean not null default false,
  comment text, display_comment boolean not null default false,
  position int not null default 0,
  check ((equipment_id is null) <> (risk_id is null))
);
create unique index project_list_items_unique on public.project_list_items (list_id, coalesce(equipment_id, risk_id));
create index project_list_items_equipment_idx on public.project_list_items (equipment_id);
create index project_list_items_risk_idx on public.project_list_items (risk_id);

-- ===== MODÈLES DE DOSSIER DE CLÔTURE (spec 01 §6.10) ===========================
create table public.closing_folder_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null, description text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index closing_folder_templates_account_idx on public.closing_folder_templates (account_id);
create table public.closing_section_templates (
  id uuid primary key default gen_random_uuid(),
  folder_template_id uuid not null references public.closing_folder_templates(id) on delete restrict,
  type public.closing_section_type not null,
  name text not null, description text,
  category_id uuid references public.label_families(id) on delete set null,
  include_previous_versions boolean not null default false,
  all_emm_elements boolean not null default true,
  position int not null default 0
);
create index closing_section_templates_folder_idx on public.closing_section_templates (folder_template_id);
create index closing_section_templates_category_idx on public.closing_section_templates (category_id);

-- ===== DOCUMENTS ================================================================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  scope public.document_scope not null,
  project_id uuid references public.projects(id) on delete cascade,
  nature public.document_nature not null,
  source public.document_source not null,
  origin public.document_origin not null default 'local',
  library_source_id uuid references public.documents(id) on delete set null,
  standard_source_id uuid references public.documents(id) on delete set null,
  name text not null check (char_length(name) between 3 and 255),
  ref_int text check (ref_int is null or char_length(ref_int) between 1 and 255),
  ref_ext text check (ref_ext is null or char_length(ref_ext) between 1 and 255),
  complement_ref_int text,
  complement_ref_ext text,
  family_id uuid not null references public.label_families(id),
  category_id uuid references public.label_families(id) on delete set null,
  closing_category_id uuid references public.label_families(id) on delete set null,
  index_format public.index_format not null,
  start_index text check (start_index is null or char_length(start_index) between 1 and 16),
  language_1 public.export_language not null default 'fr',
  language_2 public.export_language not null default 'none',
  linked_flow_id uuid references public.flows(id) on delete set null,
  linked_form_id uuid references public.forms(id) on delete set null,
  linked_response_id uuid references public.form_responses(id) on delete set null,
  linked_diagram_id uuid references public.diagrams(id) on delete set null,
  linked_list_id uuid references public.project_lists(id) on delete restrict,
  folder_template_id uuid references public.closing_folder_templates(id) on delete set null,
  responses_strategy public.selection_strategy,
  form_content_location public.form_content_location not null default 'none',
  preamble text, subject text, glossary text,
  options jsonb not null default '{}'::jsonb,
  selection_query jsonb,
  client_cover_page boolean not null default false,
  highlight_changes boolean not null default false,
  content_disabled boolean not null default false,
  actions_disabled boolean not null default false,
  library_update_available boolean not null default false,
  is_large_file boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.collaborators(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.collaborators(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.collaborators(id) on delete set null,
  check ((scope = 'library') = (project_id is null)),
  check (scope = 'project' or nature in ('pdf_versioned','pdf_unversioned')),
  check (language_2 = 'none' or language_2 <> language_1),
  check (source <> 'extern' or nature in ('pdf_versioned','pdf_unversioned')),
  check ((source = 'closing_folder') = (nature = 'rfi'))
);
create index documents_project_idx on public.documents (project_id) where deleted_at is null;
create index documents_account_idx on public.documents (account_id) where scope = 'library' and deleted_at is null;
create index documents_org_idx on public.documents (organization_id);
create index documents_family_idx on public.documents (family_id);
create index documents_category_idx on public.documents (category_id);
create index documents_closing_category_idx on public.documents (closing_category_id);
create index documents_library_source_idx on public.documents (library_source_id);
create index documents_standard_source_idx on public.documents (standard_source_id);
create index documents_linked_flow_idx on public.documents (linked_flow_id);
create index documents_linked_form_idx on public.documents (linked_form_id);
create index documents_linked_response_idx on public.documents (linked_response_id);
create index documents_linked_list_idx on public.documents (linked_list_id);
create index documents_folder_template_idx on public.documents (folder_template_id);
create index documents_created_by_idx on public.documents (created_by);
create index documents_updated_by_idx on public.documents (updated_by);
create index documents_deleted_by_idx on public.documents (deleted_by);
create unique index documents_unique_flow_nature on public.documents (project_id, nature, linked_flow_id)
  where linked_flow_id is not null and source = 'flow' and deleted_at is null;
create unique index documents_unique_form_nature on public.documents
  (project_id, nature, linked_form_id, coalesce(linked_flow_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where linked_form_id is not null and deleted_at is null;
create unique index documents_unique_diagram on public.documents (linked_diagram_id)
  where linked_diagram_id is not null and deleted_at is null;
create unique index documents_unique_library_import on public.documents (project_id, library_source_id)
  where library_source_id is not null and deleted_at is null;

create table public.document_selections (
  document_id uuid not null references public.documents(id) on delete cascade,
  kind public.document_selection_kind not null,
  ref_id uuid not null,
  position int not null default 0,
  primary key (document_id, kind, ref_id)
);
create index document_selections_ref_idx on public.document_selections (ref_id);

-- ===== VERSIONS (lignes du suivi) ==================================================
create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  seq int not null,
  index_label text not null check (char_length(index_label) between 1 and 20),
  is_sub_index boolean not null default false,
  state public.document_state not null,
  step public.document_step,
  visa public.document_visa,
  is_last boolean not null default true,
  diffusion_date timestamptz,
  diffusion_comment text check (char_length(diffusion_comment) <= 255),
  diffused_by uuid references public.collaborators(id) on delete set null,
  redactor_id uuid references public.collaborators(id) on delete set null,  redactor_date date,
  checker_id uuid references public.collaborators(id) on delete set null,   checker_date date,
  approver_id uuid references public.collaborators(id) on delete set null,  approver_date date,
  quality_supervisor_id uuid references public.collaborators(id) on delete set null, quality_date date,
  safety_supervisor_id uuid references public.collaborators(id) on delete set null,  safety_date date,
  bpe_user_id uuid references public.collaborators(id) on delete set null,
  bpe_date timestamptz, bpe_comment text check (char_length(bpe_comment) <= 255),
  bpa_user_id uuid references public.collaborators(id) on delete set null,
  response_date timestamptz,
  response_label text, response_ref text,
  response_comment text check (char_length(response_comment) <= 255),
  response_file_path text,
  client_cover_page_path text,
  complement_ref_int text, complement_ref_ext text,
  pdf_path text,
  pdf_name text,
  pdf_size bigint,
  template_snapshot jsonb,
  wording_snapshot jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.collaborators(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (document_id, seq)
);
create unique index document_versions_one_last on public.document_versions (document_id) where is_last;
create index document_versions_redactor_idx on public.document_versions (redactor_id);
create index document_versions_checker_idx on public.document_versions (checker_id);
create index document_versions_approver_idx on public.document_versions (approver_id);
create index document_versions_quality_idx on public.document_versions (quality_supervisor_id);
create index document_versions_safety_idx on public.document_versions (safety_supervisor_id);
create index document_versions_bpe_user_idx on public.document_versions (bpe_user_id);
create index document_versions_bpa_user_idx on public.document_versions (bpa_user_id);
create index document_versions_diffused_by_idx on public.document_versions (diffused_by);
create index document_versions_created_by_idx on public.document_versions (created_by);

create table public.document_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_id uuid references public.document_versions(id) on delete cascade,
  storage_path text not null,
  name text not null,
  size bigint not null check (size <= 2147483648),
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.collaborators(id) on delete set null
);
create index document_files_document_idx on public.document_files (document_id);
create index document_files_version_idx on public.document_files (version_id);
create index document_files_created_by_idx on public.document_files (created_by);

create table public.document_version_events (
  id bigint generated always as identity primary key,
  version_id uuid not null references public.document_versions(id) on delete cascade,
  action text not null,
  from_state public.document_state, to_state public.document_state,
  from_step public.document_step,  to_step public.document_step,
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid references public.collaborators(id) on delete set null,
  created_at timestamptz not null default now()
);
create index document_version_events_version_idx on public.document_version_events (version_id);
create index document_version_events_actor_idx on public.document_version_events (actor_id);

-- ===== PARTAGE ==================================================================
create table public.document_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  version_id uuid references public.document_versions(id) on delete set null,
  email text not null,
  language public.ui_language not null default 'fr',
  comment text,
  token_hash text not null, code_hash text, code_expires_at timestamptz,
  expires_at timestamptz not null,
  sent_at timestamptz, sent_by uuid references public.collaborators(id) on delete set null,
  revoked_at timestamptz,
  contributor jsonb,
  created_at timestamptz not null default now()
);
create unique index document_shares_active_unique on public.document_shares (lower(email), document_id) where revoked_at is null;
create index document_shares_document_idx on public.document_shares (document_id);
create index document_shares_project_idx on public.document_shares (project_id);
create index document_shares_version_idx on public.document_shares (version_id);
create index document_shares_sent_by_idx on public.document_shares (sent_by);

-- ===== TRAMES (spec 01 §6.12) ===================================================
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  link_type text not null check (link_type in ('default','client','family')),
  client_id uuid references public.clients(id) on delete cascade,
  family_id uuid references public.label_families(id) on delete cascade,
  page_type text not null,
  pdf_path text not null,
  margin_top numeric not null, margin_bottom numeric not null,
  margin_left numeric not null, margin_right numeric not null,
  page_number_x numeric, page_number_y numeric,
  index_max int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((link_type = 'client') = (client_id is not null)),
  check ((link_type = 'family') = (family_id is not null))
);
create unique index document_templates_unique on public.document_templates
  (organization_id, page_type, link_type, coalesce(client_id, family_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index document_templates_client_idx on public.document_templates (client_id);
create index document_templates_family_idx on public.document_templates (family_id);

-- ===== DOSSIER DE CLÔTURE ========================================================
create table public.closing_sections (
  id uuid primary key default gen_random_uuid(),
  folder_document_id uuid not null references public.documents(id) on delete cascade,
  type public.closing_section_type not null,
  name text not null check (char_length(name) between 1 and 255),
  description text, observation text,
  category_id uuid references public.label_families(id) on delete set null,
  flow_id uuid references public.flows(id) on delete set null,
  all_emm_elements boolean not null default true,
  include_previous_versions boolean not null default false,
  sort_mode smallint check (sort_mode between 1 and 10),
  disabled boolean not null default false,
  position int not null default 0,
  last_generated_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.collaborators(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.collaborators(id) on delete set null
);
create index closing_sections_folder_idx on public.closing_sections (folder_document_id, position);
create index closing_sections_category_idx on public.closing_sections (category_id);
create index closing_sections_flow_idx on public.closing_sections (flow_id);
create index closing_sections_created_by_idx on public.closing_sections (created_by);
create index closing_sections_updated_by_idx on public.closing_sections (updated_by);

create table public.closing_section_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.closing_sections(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  version_id uuid references public.document_versions(id) on delete set null,
  emm_element_id uuid,
  position int not null default 0,
  added_at timestamptz not null default now(),
  check (document_id is not null or emm_element_id is not null)
);
create index closing_section_items_section_idx on public.closing_section_items (section_id, position);
create index closing_section_items_document_idx on public.closing_section_items (document_id);
create index closing_section_items_version_idx on public.closing_section_items (version_id);

-- ===== FK SUR LES TABLES EXISTANTES ===============================================
alter table public.block_documents
  add constraint block_documents_document_fkey foreign key (document_id)
    references public.documents(id) on delete restrict,
  add constraint block_documents_pinned_version_fkey foreign key (pinned_version_id)
    references public.document_versions(id) on delete set null,
  add constraint block_documents_frozen_version_fkey foreign key (frozen_version_id)
    references public.document_versions(id) on delete restrict;
-- Deux indices identiques d'un même document interdits sur un même bloc (le gel ne participe pas à l'unicité).
create unique index block_documents_unique_doc_version on public.block_documents
  (block_id, document_id, coalesce(pinned_version_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where document_id is not null;
create index block_documents_pinned_idx on public.block_documents (pinned_version_id);
create index block_documents_frozen_idx on public.block_documents (frozen_version_id);

alter table public.diagrams
  add constraint diagrams_document_fkey foreign key (document_id)
    references public.documents(id) on delete set null;
create unique index diagrams_document_unique on public.diagrams (document_id) where document_id is not null;

-- ===== updated_at ================================================================
do $$
declare t text;
begin
  foreach t in array array['documents','document_versions','document_templates','closing_sections',
    'closing_folder_templates','project_lists']
  loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function private.set_updated_at()', t);
  end loop;
end $$;

-- ===== INDICES (R-IDX-1..5) =======================================================
create or replace function private.document_index_first(p_format public.index_format)
returns text language sql immutable set search_path = '' as $$
  select case p_format when 'numeric_zero' then '0' when 'numeric' then '1' when 'alpha' then 'A'
    when 'numeric_all_zero' then '01' when 'numeric_all_zero_start_zero' then '00'
    when 'numeric_decimal' then '1.0' when 'numeric_decimal_start_zero' then '0.0' end
$$;

-- Format déduit d'un indice de départ (null = non conforme).
create or replace function private.document_index_format_of(p_index text)
returns public.index_format language sql immutable set search_path = '' as $$
  select (case
    when p_index is null or char_length(p_index) not between 1 and 16 then null
    when p_index ~ '^[A-Z]+$' then 'alpha'
    when p_index ~ '^0\.[0-9]+$' then 'numeric_decimal_start_zero'
    when p_index ~ '^[1-9][0-9]*\.[0-9]+$' then 'numeric_decimal'
    when p_index ~ '^0+$' and char_length(p_index) >= 2 then 'numeric_all_zero_start_zero'
    when p_index ~ '^0[0-9]+$' then 'numeric_all_zero'
    when p_index = '0' then 'numeric_zero'
    when p_index ~ '^[1-9][0-9]*$' then 'numeric'
  end)::public.index_format
$$;

-- Indice principal suivant (n+1) dans le format.
create or replace function private.document_index_next(p_format public.index_format, p_index text)
returns text language plpgsql immutable set search_path = '' as $$
declare n bigint; s text; i int;
begin
  if p_index is null then return private.document_index_first(p_format); end if;
  if p_format in ('numeric_decimal','numeric_decimal_start_zero') then
    if p_index ~ '^[0-9]+\.[0-9]+$' then
      return split_part(p_index, '.', 1) || '.' || (split_part(p_index, '.', 2)::bigint + 1)::text;
    end if;
    return private.document_index_first(p_format);
  elsif p_format = 'alpha' then
    if p_index !~ '^[A-Z]+$' then return 'A'; end if;
    n := 0;
    for i in 1 .. char_length(p_index) loop n := n * 26 + (ascii(substr(p_index, i, 1)) - 64); end loop;
    n := n + 1; s := '';
    while n > 0 loop s := chr(65 + ((n - 1) % 26)::int) || s; n := (n - 1) / 26; end loop;
    return s;
  end if;
  if p_index !~ '^[0-9]+$' then return private.document_index_first(p_format); end if;
  s := (p_index::numeric + 1)::text;
  if p_format in ('numeric_all_zero','numeric_all_zero_start_zero') then s := lpad(s, greatest(char_length(p_index), 2), '0'); end if;
  return s;
end $$;

-- Indice principal d'une ligne (retire le sous-indice « .n »).
create or replace function private.document_index_base(p_index text, p_is_sub boolean)
returns text language sql immutable set search_path = '' as $$
  select case when p_is_sub then regexp_replace(p_index, '\.[0-9]+$', '') else p_index end
$$;

-- Sous-indice suivant : « B » → « B.1 », « B.1 » → « B.2 ».
create or replace function private.document_index_sub(p_index text, p_is_sub boolean)
returns text language sql immutable set search_path = '' as $$
  select case when p_is_sub
    then regexp_replace(p_index, '\.[0-9]+$', '') || '.' || ((regexp_match(p_index, '\.([0-9]+)$'))[1]::int + 1)::text
    else p_index || '.1' end
$$;

-- ===== RÉFÉRENCES GÉNÉRÉES (règles nature Document, spec 01 §6.9) =================
create or replace function private.document_generate_ref(p_account uuid, p_project uuid, p_family uuid, p_field public.reference_field)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.reference_rules; v_parent uuid; v_counter int; fam public.label_families; pfam public.label_families;
begin
  select parent_id into v_parent from public.label_families where id = p_family;
  select * into r from public.reference_rules
   where account_id = p_account and nature = 'document' and field = p_field and active
     and (link_type = 'default' or label_family_id = p_family or label_family_id = v_parent)
   order by case when label_family_id = p_family then 0 when label_family_id = v_parent then 1 else 2 end
   limit 1;
  if r.id is null then return null; end if;
  insert into public.reference_counters (reference_rule_id, project_id, current_value)
  values (r.id, case when r.counter_type = 'local' then p_project end, r.start_value)
  on conflict (reference_rule_id, project_id) do update set current_value = public.reference_counters.current_value + 1
  returning current_value into v_counter;
  select * into fam from public.label_families where id = p_family;
  select * into pfam from public.label_families where id = v_parent;
  return replace(replace(replace(replace(replace(r.nomenclature,
    '{counter}', lpad(v_counter::text, r.counter_format, '0')),
    '{year}', to_char(now(), 'YYYY')), '{month}', to_char(now(), 'MM')),
    '{family}', coalesce(fam.code, fam.short_name, '')), '{parent_family}', coalesce(pfam.code, pfam.short_name, ''));
end $$;

-- ===== DROITS ===================================================================
create or replace function private.document_can_read(p_document_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d where d.id = p_document_id
      and case when d.scope = 'project' then private.can_read_project(d.project_id)
               else d.organization_id = private.current_org_id()
                    and d.account_id in (select private.accessible_account_ids())
                    and private.current_authority() in ('siteflow_admin','global_admin','admin','advanced','normal') end)
$$;

create or replace function private.document_can_write(p_document_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d where d.id = p_document_id
      and case when d.scope = 'project' then private.can_write_project(d.project_id, 'writer')
               else d.organization_id = private.current_org_id()
                    and d.account_id in (select private.accessible_account_ids())
                    and private.is_admin_or_advanced() end)
$$;

-- « Déverrouiller le suivi » : admin plateforme ou droit complémentaire manage_diffusion (+ écriture).
create or replace function private.document_can_unlock(p_document_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.document_can_write(p_document_id)
     and coalesce((select c.authority = 'siteflow_admin' or 'manage_diffusion' = any (c.additional_rights)
                   from private.current_collaborator() c), false)
$$;

-- ===== TRIGGERS DOCUMENTS ========================================================
-- Avant insertion : format d'indice (déduit de l'indice de départ, sinon compte), référence générée.
create or replace function private.documents_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_fmt public.index_format;
begin
  if new.start_index is not null and new.nature <> 'pdf_unversioned' then
    v_fmt := private.document_index_format_of(new.start_index);
    if v_fmt is null then raise exception 'invalid_index' using errcode = 'P0001'; end if;
    new.index_format := v_fmt;
  end if;
  if new.index_format is null then
    select a.doc_index_format into new.index_format from public.accounts a where a.id = new.account_id;
  end if;
  if new.origin = 'local' and new.ref_int is null then
    new.ref_int := private.document_generate_ref(new.account_id, new.project_id, new.family_id, 'ref_int');
  end if;
  new.created_by := coalesce(new.created_by, private.current_collaborator_id());
  new.updated_by := coalesce(new.updated_by, new.created_by);
  return new;
end $$;
create trigger documents_before_insert before insert on public.documents
  for each row execute function private.documents_before_insert();

-- T0 : première ligne de suivi (PREL ; externe avec version : fichier à déposer ; sans version : « Sans état »).
create or replace function private.documents_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if new.origin <> 'local' then return new; end if;
  if new.nature = 'pdf_unversioned' then
    insert into public.document_versions (document_id, seq, index_label, state, step, is_last, created_by)
    values (new.id, 1, '-', 'none', null, true, new.created_by) returning id into v_id;
  else
    insert into public.document_versions (document_id, seq, index_label, state, step, is_last, created_by)
    values (new.id, 1, coalesce(new.start_index, private.document_index_first(new.index_format)), 'prel',
            case when new.source = 'extern' then 'upload_file'::public.document_step else 'diffusion'::public.document_step end,
            true, new.created_by) returning id into v_id;
  end if;
  insert into public.document_version_events (version_id, action, to_state, to_step, actor_id)
  select v_id, 'T0', v.state, v.step, new.created_by from public.document_versions v where v.id = v_id;
  return new;
end $$;
create trigger documents_after_insert after insert on public.documents
  for each row execute function private.documents_after_insert();

-- Garde : colonnes figées après création ; corbeille réservée aux experts / responsables (projet).
create or replace function private.documents_guard_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.document_sync', true), '') = 'on' then return new; end if;
  if new.scope <> old.scope or new.project_id is distinct from old.project_id or new.source <> old.source
     or new.origin <> old.origin or new.library_source_id is distinct from old.library_source_id
     or new.organization_id <> old.organization_id then
    raise exception 'immutable' using errcode = 'P0001';
  end if;
  if new.nature <> old.nature and not (
       (old.nature in ('list_emm','list_emm_flow') and new.nature in ('list_emm','list_emm_flow'))
    or (old.nature in ('list_adr','list_adr_flow') and new.nature in ('list_adr','list_adr_flow'))) then
    raise exception 'immutable' using errcode = 'P0001';
  end if;
  if new.start_index is distinct from old.start_index or new.index_format <> old.index_format then
    raise exception 'start_index_locked' using errcode = 'P0001';
  end if;
  if old.deleted_at is null and new.deleted_at is not null and old.scope = 'project'
     and not private.can_write_project(old.project_id, 'expert') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger documents_guard_update before update on public.documents
  for each row execute function private.documents_guard_update();

-- Bibliothèque → entités : icône orange « Mettre à jour » uniquement si une nouvelle version existe (R2.18).
create or replace function private.document_library_flag(p_library_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.documents c set library_update_available = exists (
    select 1 from public.document_versions lv
    where lv.document_id = p_library_id and lv.is_last
      and not exists (select 1 from public.document_versions cv
                      where cv.document_id = c.id and cv.is_last and cv.seq = lv.seq
                        and cv.state = lv.state and cv.step is not distinct from lv.step
                        and cv.pdf_path is not distinct from lv.pdf_path))
  where c.library_source_id = p_library_id and c.deleted_at is null
$$;

create or replace function private.document_versions_library_propagate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_doc uuid := coalesce(new.document_id, old.document_id);
begin
  if exists (select 1 from public.documents d where d.id = v_doc and d.scope = 'library') then
    perform private.document_library_flag(v_doc);
  end if;
  return null;
end $$;
create trigger document_versions_library_propagate after insert or update or delete on public.document_versions
  for each row execute function private.document_versions_library_propagate();

-- ===== FILE DE GÉNÉRATION (contrat agent PDF) ======================================
-- background_tasks(kind='document_generation', file_type='pdf', status='acknowledged',
--   metadata = {document_version_id, document_id, action}) ; action ∈ preview | freeze | regenerate |
--   refresh_config | refresh_last_index | without_field_data | closing_folder | closing_section.
create or replace function private.document_enqueue(p_version_id uuid, p_action text, p_extra jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.background_tasks (account_id, project_id, user_id, kind, file_type, name, status, metadata)
  select d.account_id, d.project_id, private.current_collaborator_id(), 'document_generation', 'pdf',
         d.name || ' - ' || v.index_label, 'acknowledged',
         jsonb_build_object('document_version_id', v.id, 'document_id', d.id, 'action', p_action) || coalesce(p_extra, '{}'::jsonb)
  from public.document_versions v join public.documents d on d.id = v.document_id
  where v.id = p_version_id
  returning id into v_id;
  return v_id;
end $$;

create or replace function private.document_enqueue_checked(p_version_id uuid, p_action text, p_extra jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare d public.documents;
begin
  select d2.* into d from public.document_versions v join public.documents d2 on d2.id = v.document_id where v.id = p_version_id;
  if d.id is null or d.deleted_at is not null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not private.document_can_write(d.id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if d.source = 'extern' then raise exception 'invalid_action' using errcode = 'P0001'; end if;
  if p_action not in ('preview','freeze','regenerate','refresh_config','refresh_last_index','without_field_data','closing_folder','closing_section') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  return private.document_enqueue(p_version_id, p_action, p_extra);
end $$;

create or replace function public.document_enqueue_generation(p_version_id uuid, p_action text default 'preview', p_extra jsonb default '{}'::jsonb)
returns uuid language sql security invoker set search_path = '' as $$
  select private.document_enqueue_checked(p_version_id, p_action, p_extra)
$$;

-- Fin de génération (worker PDF, rôle service) : PDF figé sur la ligne pour les actions qui figent.
create or replace function public.document_complete_generation(p_task_id uuid, p_path text, p_size bigint, p_error text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare t public.background_tasks; v_version uuid; v_action text;
begin
  select * into t from public.background_tasks where id = p_task_id for update;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_version := (t.metadata ->> 'document_version_id')::uuid;
  v_action := t.metadata ->> 'action';
  if p_error is not null then
    update public.background_tasks set status = 'error', error = p_error, finished_at = now() where id = p_task_id;
    return;
  end if;
  update public.background_tasks set status = 'done', result_path = p_path, finished_at = now() where id = p_task_id;
  if v_action in ('freeze','regenerate','refresh_config','refresh_last_index') and v_version is not null then
    update public.document_versions set pdf_path = p_path, pdf_size = p_size where id = v_version;
    update public.documents d set is_large_file = coalesce(p_size, 0) > 20971520
      from public.document_versions v where v.id = v_version and d.id = v.document_id and v.is_last;
  end if;
end $$;

-- ===== MACHINE À ÉTATS DU SUIVI (§4.5) =============================================
create or replace function private.document_insert_version(
  p_src public.document_versions, p_label text, p_is_sub boolean, p_state public.document_state,
  p_step public.document_step, p_copy_pdf boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_seq int;
begin
  select coalesce(max(seq), 0) + 1 into v_seq from public.document_versions where document_id = p_src.document_id;
  update public.document_versions set is_last = false where document_id = p_src.document_id and is_last;
  insert into public.document_versions (document_id, seq, index_label, is_sub_index, state, step, is_last,
    redactor_id, checker_id, approver_id, quality_supervisor_id, safety_supervisor_id,
    complement_ref_int, complement_ref_ext, pdf_path, pdf_name, pdf_size, created_by)
  values (p_src.document_id, v_seq, p_label, p_is_sub, p_state, p_step, true,
    p_src.redactor_id, p_src.checker_id, p_src.approver_id, p_src.quality_supervisor_id, p_src.safety_supervisor_id,
    p_src.complement_ref_int, p_src.complement_ref_ext,
    case when p_copy_pdf then p_src.pdf_path end, case when p_copy_pdf then p_src.pdf_name end,
    case when p_copy_pdf then p_src.pdf_size end, private.current_collaborator_id())
  returning id into v_id;
  insert into public.document_version_events (version_id, action, to_state, to_step, actor_id)
  values (v_id, 'create', p_state, p_step, private.current_collaborator_id());
  return v_id;
end $$;

create or replace function private.document_version_action(p_version_id uuid, p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.document_versions;
  d public.documents;
  f public.label_families;
  w public.wording_configurations;
  p jsonb := coalesce(p_payload, '{}'::jsonb);
  v_me uuid := private.current_collaborator_id();
  v_ext boolean;
  v_new uuid;
  v_task uuid;
  v_visa public.document_visa;
  v_base text;
  v_upload public.document_step;
  v_prev_state public.document_state;
  v_prev_step public.document_step;
  v_unlock_actions text[] := array['new_index_next','new_sub_index','new_index_same','delete_last','edit_diffusion',
                                   'edit_response','edit_file','regenerate','refresh_config','refresh_last_index'];
  v_unlock boolean;
  v_after public.document_versions;
  v_size bigint;
begin
  select * into v from public.document_versions where id = p_version_id for update;
  if v.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into d from public.documents where id = v.document_id for update;
  if d.deleted_at is not null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not private.document_can_write(d.id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if d.nature = 'pdf_unversioned' then raise exception 'not_versioned' using errcode = 'P0001'; end if;
  if d.origin = 'imported_from_library' then raise exception 'library_action' using errcode = 'P0001'; end if;
  if d.actions_disabled then raise exception 'referential_locked' using errcode = 'P0001'; end if;

  v_unlock := p_action = any (v_unlock_actions) or (p_action = 'set_contributors' and coalesce((p ->> 'unlock')::boolean, false));
  if v_unlock and not private.document_can_unlock(d.id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not v.is_last and p_action not in ('set_contributors','edit_diffusion','edit_response','edit_file') then
    raise exception 'not_last' using errcode = 'P0001';
  end if;

  select * into f from public.label_families where id = d.family_id;
  select * into w from public.wording_configurations where id = f.wording_configuration_id;
  v_ext := d.source = 'extern';
  v_base := private.document_index_base(v.index_label, v.is_sub_index);
  v_upload := case when v_ext then 'upload_file'::public.document_step else 'diffusion'::public.document_step end;
  v_size := nullif(p ->> 'size', '')::bigint;

  case p_action
  -- T1 : dépôt du fichier d'indice (externe) — remplaçable tant que la ligne n'est pas diffusée.
  when 'attach_file' then
    if not v_ext then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    if v.step is null or v.step not in ('upload_file','diffusion','diffusion_bpa') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if coalesce(p ->> 'path', '') = '' then raise exception 'file_required' using errcode = 'P0001'; end if;
    update public.document_versions set pdf_path = p ->> 'path', pdf_name = p ->> 'name', pdf_size = v_size,
      step = case when v.step = 'upload_file' then (case when v.state = 'bpa' then 'diffusion_bpa' else 'diffusion' end)::public.document_step else v.step end
    where id = v.id;
    update public.documents set is_large_file = coalesce(v_size, 0) > 20971520 where id = d.id;

  -- T2 / T2e : diffusion.
  when 'diffuse' then
    if v.step is distinct from 'diffusion' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if not v_ext then
      if d.source = 'flow' and d.linked_flow_id is not null and exists (
           select 1 from public.blocks b join public.steps s on s.id = b.step_id
           where b.flow_id = d.linked_flow_id and b.enabled and not s.disabled and b.state <> 'validated') then
        raise exception 'internal_validation_incomplete' using errcode = 'P0001';
      end if;
      if v.redactor_id is null and v.checker_id is null and v.approver_id is null then
        raise exception 'contributors_required' using errcode = 'P0001';
      end if;
    end if;
    update public.document_versions set
      diffusion_date = coalesce(nullif(p ->> 'date', '')::timestamptz, now()),
      diffusion_comment = nullif(p ->> 'comment', ''), diffused_by = v_me, visa = 'diffusion',
      state = case when f.client_supervision then 'bpo' else 'bpe' end::public.document_state,
      step = case when f.client_supervision then 'client_res' else 'bpe' end::public.document_step
    where id = v.id;
    if not v_ext then v_task := private.document_enqueue(v.id, 'freeze'); end if;

  -- T3 : annulation de diffusion (retour à l'état d'avant diffusion).
  when 'cancel_diffusion' then
    if v.step is null or v.step not in ('client_res','client_res_bpa') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    select e.from_state, e.from_step into v_prev_state, v_prev_step from public.document_version_events e
     where e.version_id = v.id and e.action in ('diffuse','diffuse_bpa') order by e.id desc limit 1;
    update public.document_versions set
      state = coalesce(v_prev_state, case when v.step = 'client_res_bpa' then 'bpa' else 'prel' end::public.document_state),
      step = coalesce(v_prev_step, case when v.step = 'client_res_bpa' then 'diffusion_bpa' else 'diffusion' end::public.document_step),
      visa = null, diffusion_date = null, diffusion_comment = null, diffused_by = null,
      bpa_user_id = case when v.step = 'client_res_bpa' then null else bpa_user_id end,
      pdf_path = case when v_ext then pdf_path end, pdf_size = case when v_ext then pdf_size end,
      pdf_name = case when v_ext then pdf_name end
    where id = v.id;

  -- T4 / T5 / T6 : retour client sur l'indice.
  when 'client_response' then
    if v.step is distinct from 'client_res' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    v_visa := (p ->> 'visa')::public.document_visa;
    if v_visa is null or v_visa not in ('vso','vso_sr','vao') or (v_visa = 'vso_sr' and coalesce(w.hide_vso_sr, false)) then
      raise exception 'invalid_action' using errcode = 'P0001';
    end if;
    if nullif(p ->> 'date', '') is null then raise exception 'response_date_required' using errcode = 'P0001'; end if;
    update public.document_versions set visa = v_visa,
      response_date = (p ->> 'date')::timestamptz, response_label = nullif(p ->> 'label', ''),
      response_ref = nullif(p ->> 'ref', ''), response_comment = nullif(p ->> 'comment', ''),
      response_file_path = nullif(p ->> 'response_file_path', ''), client_cover_page_path = nullif(p ->> 'cover_page_path', '')
    where id = v.id;
    if v_visa = 'vso' then
      v_new := private.document_insert_version(v, v.index_label, v.is_sub_index, 'bpe', 'bpe', true);
    elsif v_visa = 'vso_sr' then
      v_new := private.document_insert_version(v, v.index_label, v.is_sub_index, 'temp', 'bpe', true);
    else
      v_new := private.document_insert_version(v, private.document_index_next(d.index_format, v_base), false, 'bpo', v_upload, false);
    end if;

  -- T7 : retour à l'état BPO (nouvel indice n+1).
  when 'to_bpo' then
    if v.step is null or v.step not in ('bpe','bpe_valid','bpa','bpa_refused') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    update public.document_versions set visa = 'modification' where id = v.id;
    v_new := private.document_insert_version(v, private.document_index_next(d.index_format, v_base), false, 'bpo', v_upload, false);

  -- T8 : passage indice validé bis (BPE*), hors bibliothèque.
  when 'bpe_valid' then
    if v.step is distinct from 'bpe' or v.state <> 'bpe' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if coalesce(w.hide_bpe_valid, false) or d.scope = 'library' then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    if nullif(p ->> 'user_id', '') is null then raise exception 'user_required' using errcode = 'P0001'; end if;
    update public.document_versions set step = 'bpe_valid', visa = 'bpe_valid', bpe_user_id = (p ->> 'user_id')::uuid,
      bpe_date = coalesce(nullif(p ->> 'date', '')::timestamptz, now()), bpe_comment = nullif(p ->> 'comment', '')
    where id = v.id;

  -- T9 : ajout d'un sous-indice.
  when 'add_sub_index' then
    if v.step is null or v.step not in ('bpe','bpe_valid','bpa','bpa_refused') or v.state = 'temp' then
      raise exception 'sub_index_state' using errcode = 'P0001';
    end if;
    if coalesce(w.hide_bpa, false) then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    update public.document_versions set visa = 'modification_bpa' where id = v.id;
    v_new := private.document_insert_version(v, private.document_index_sub(v.index_label, v.is_sub_index), true, 'bpa',
      case when v_ext then 'upload_file' else 'diffusion_bpa' end::public.document_step, false);

  -- T10 : diffusion du sous-indice (BPA).
  when 'diffuse_bpa' then
    if v.step is distinct from 'diffusion_bpa' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if nullif(p ->> 'user_id', '') is null then raise exception 'user_required' using errcode = 'P0001'; end if;
    if nullif(p ->> 'date', '') is null then raise exception 'date_required' using errcode = 'P0001'; end if;
    update public.document_versions set bpa_user_id = (p ->> 'user_id')::uuid,
      diffusion_date = (p ->> 'date')::timestamptz, diffusion_comment = nullif(p ->> 'comment', ''), diffused_by = v_me,
      visa = 'diffusion_bpa',
      step = case when f.client_supervision_sub_index then 'client_res_bpa' else 'bpa' end::public.document_step
    where id = v.id;
    if not v_ext then v_task := private.document_enqueue(v.id, 'freeze'); end if;

  -- T11 / T12 : retour client sur le sous-indice (OK / KO).
  when 'client_response_bpa' then
    if v.step is distinct from 'client_res_bpa' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    v_visa := (p ->> 'visa')::public.document_visa;
    if v_visa is null or v_visa not in ('vso_bpa','vao_bpa') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    if nullif(p ->> 'date', '') is null then raise exception 'response_date_required' using errcode = 'P0001'; end if;
    update public.document_versions set visa = v_visa,
      step = case when v_visa = 'vso_bpa' then 'bpa' else 'bpa_refused' end::public.document_step,
      response_date = (p ->> 'date')::timestamptz, response_label = nullif(p ->> 'label', ''),
      response_ref = nullif(p ->> 'ref', ''), response_comment = nullif(p ->> 'comment', ''),
      response_file_path = nullif(p ->> 'response_file_path', ''), client_cover_page_path = nullif(p ->> 'cover_page_path', '')
    where id = v.id;

  -- §4.7 / U6 : contributeurs de l'indice.
  when 'set_contributors' then
    if d.nature = 'pdf_versioned' then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    if not v_unlock and (not v.is_last or v.step is null or v.step not in ('diffusion','diffusion_bpa')) then
      raise exception 'invalid_state' using errcode = 'P0001';
    end if;
    update public.document_versions set
      redactor_id = nullif(p ->> 'redactor_id', '')::uuid, redactor_date = nullif(p ->> 'redactor_date', '')::date,
      checker_id = nullif(p ->> 'checker_id', '')::uuid, checker_date = nullif(p ->> 'checker_date', '')::date,
      approver_id = nullif(p ->> 'approver_id', '')::uuid, approver_date = nullif(p ->> 'approver_date', '')::date,
      quality_supervisor_id = nullif(p ->> 'quality_supervisor_id', '')::uuid, quality_date = nullif(p ->> 'quality_date', '')::date,
      safety_supervisor_id = nullif(p ->> 'safety_supervisor_id', '')::uuid, safety_date = nullif(p ->> 'safety_date', '')::date
    where id = v.id;

  -- T13 : particularisation (compléments de référence) puis régénération.
  when 'particularize' then
    if d.nature in ('pdf_versioned','pdf_unversioned') then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    if not (v.step in ('diffusion','diffusion_bpa') or v.state = 'prel') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    update public.document_versions set complement_ref_int = nullif(p ->> 'complement_ref_int', ''),
      complement_ref_ext = nullif(p ->> 'complement_ref_ext', '') where id = v.id;
    v_task := private.document_enqueue(v.id, 'regenerate');

  -- T14 : version avant données terrain (génération seule).
  when 'without_field_data' then
    if d.nature not in ('dsi','multi_pr','flow_form','pr') or v.step is null or v.step not in ('bpe','bpe_valid','bpa')
       or d.origin = 'derived_from_standard' then
      raise exception 'invalid_action' using errcode = 'P0001';
    end if;
    v_task := private.document_enqueue(v.id, 'without_field_data');

  -- R-IDX-2 : indice de départ modifiable s'il n'existe qu'une version PREL.
  when 'set_start_index' then
    if (select count(*) from public.document_versions where document_id = d.id) <> 1 or v.state <> 'prel' then
      raise exception 'start_index_locked' using errcode = 'P0001';
    end if;
    if private.document_index_format_of(p ->> 'index') is null then raise exception 'invalid_index' using errcode = 'P0001'; end if;
    update public.document_versions set index_label = p ->> 'index' where id = v.id;
    perform set_config('app.document_sync', 'on', true);
    update public.documents set start_index = p ->> 'index', index_format = private.document_index_format_of(p ->> 'index') where id = d.id;
    perform set_config('app.document_sync', '', true);

  -- ===== Mode « Déverrouiller le suivi » (U1..U11) =====
  when 'new_index_next' then
    v_new := private.document_insert_version(v, private.document_index_next(d.index_format, v_base), false, 'bpo', v_upload, false);
  when 'new_sub_index' then
    v_new := private.document_insert_version(v, private.document_index_sub(v.index_label, v.is_sub_index), true, 'bpa',
      case when v_ext then 'upload_file' else 'diffusion_bpa' end::public.document_step, false);
  when 'new_index_same' then
    v_new := private.document_insert_version(v, v.index_label, v.is_sub_index, 'bpo',
      case when v_ext and v.pdf_path is null then 'upload_file' else 'diffusion' end::public.document_step, v_ext);
  when 'delete_last' then
    if (select count(*) from public.document_versions where document_id = d.id) <= 1 then
      raise exception 'keep_one_index' using errcode = 'P0001';
    end if;
    if d.scope = 'project' and not private.can_write_project(d.project_id, 'expert') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if exists (select 1 from public.block_documents where frozen_version_id = v.id) then
      raise exception 'in_use' using errcode = 'P0001';
    end if;
    delete from public.document_versions where id = v.id;
    update public.document_versions set is_last = true
     where id = (select id from public.document_versions where document_id = d.id order by seq desc limit 1)
     returning id into v_new;
    insert into public.document_version_events (version_id, action, payload, actor_id)
    values (v_new, 'delete_last', jsonb_build_object('index', v.index_label, 'seq', v.seq), v_me);
    update public.documents set updated_at = now(), updated_by = v_me where id = d.id;
    return jsonb_build_object('version_id', v_new);
  when 'edit_diffusion' then
    if v.visa in ('vso','vso_sr','bpe_valid','vso_bpa') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    if nullif(p ->> 'date', '') is null then raise exception 'date_required' using errcode = 'P0001'; end if;
    update public.document_versions set diffusion_date = (p ->> 'date')::timestamptz, diffusion_comment = nullif(p ->> 'comment', ''),
      state = case p ->> 'key'
        when 'prel' then 'prel' when 'bpoAd' then 'bpo' when 'bpoRc' then 'bpo' when 'bpe' then 'bpe' when 'bpeTemp' then 'temp'
        when 'bpeValid' then 'bpe' when 'bpaAd' then 'bpa' when 'bpaRc' then 'bpa' when 'bpa' then 'bpa' when 'bpaRefused' then 'bpa'
        else v.state::text end::public.document_state,
      step = case p ->> 'key'
        when 'prel' then 'diffusion' when 'bpoAd' then 'diffusion' when 'bpoRc' then 'client_res' when 'bpe' then 'bpe'
        when 'bpeTemp' then 'bpe' when 'bpeValid' then 'bpe_valid' when 'bpaAd' then 'diffusion_bpa' when 'bpaRc' then 'client_res_bpa'
        when 'bpa' then 'bpa' when 'bpaRefused' then 'bpa_refused' else v.step::text end::public.document_step
    where id = v.id;
  when 'edit_response' then
    if not f.client_supervision or v.visa is null or v.visa not in ('vso_sr','vao','vao_bpa') then
      raise exception 'invalid_state' using errcode = 'P0001';
    end if;
    update public.document_versions set
      response_date = coalesce(nullif(p ->> 'date', '')::timestamptz, response_date), response_label = nullif(p ->> 'label', ''),
      response_ref = nullif(p ->> 'ref', ''), response_comment = nullif(p ->> 'comment', ''),
      response_file_path = nullif(p ->> 'response_file_path', ''), client_cover_page_path = nullif(p ->> 'cover_page_path', '')
    where id = v.id;
  when 'edit_file' then
    if not v_ext then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    if coalesce(p ->> 'path', '') = '' then raise exception 'file_required' using errcode = 'P0001'; end if;
    update public.document_versions set pdf_path = p ->> 'path', pdf_name = p ->> 'name', pdf_size = v_size,
      step = case when v.step = 'upload_file' then (case when v.state = 'bpa' then 'diffusion_bpa' else 'diffusion' end)::public.document_step else v.step end
    where id = v.id;
    if v.is_last then update public.documents set is_large_file = coalesce(v_size, 0) > 20971520 where id = d.id; end if;
  when 'regenerate', 'refresh_config', 'refresh_last_index' then
    if v_ext then raise exception 'invalid_action' using errcode = 'P0001'; end if;
    v_task := private.document_enqueue(v.id, p_action);
  else
    raise exception 'invalid_action' using errcode = 'P0001';
  end case;

  select * into v_after from public.document_versions where id = v.id;
  insert into public.document_version_events (version_id, action, from_state, to_state, from_step, to_step, payload, actor_id)
  values (v.id, p_action, v.state, v_after.state, v.step, v_after.step, p - 'unlock', v_me);
  update public.documents set updated_at = now(), updated_by = v_me where id = d.id;
  return jsonb_build_object('version_id', coalesce(v_new, v.id), 'task_id', v_task);
end $$;

create or replace function public.document_version_action(p_version_id uuid, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.document_version_action(p_version_id, p_action, p_payload)
$$;

-- ===== IMPORT / MISE À JOUR DEPUIS LA BIBLIOTHÈQUE (§4.10, §5.5) =====================
create or replace function private.document_copy_library_versions(p_lib uuid, p_copy uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare lv public.document_versions;
begin
  update public.document_versions set is_last = false where document_id = p_copy and is_last;
  for lv in select * from public.document_versions where document_id = p_lib order by seq loop
    if exists (select 1 from public.document_versions where document_id = p_copy and seq = lv.seq) then
      update public.document_versions set index_label = lv.index_label, is_sub_index = lv.is_sub_index, state = lv.state,
        step = lv.step, visa = lv.visa, diffusion_date = lv.diffusion_date, diffusion_comment = lv.diffusion_comment,
        response_date = lv.response_date, response_label = lv.response_label, response_ref = lv.response_ref,
        response_comment = lv.response_comment, response_file_path = lv.response_file_path,
        client_cover_page_path = lv.client_cover_page_path, pdf_path = lv.pdf_path, pdf_name = lv.pdf_name, pdf_size = lv.pdf_size
      where document_id = p_copy and seq = lv.seq;
    else
      insert into public.document_versions (document_id, seq, index_label, is_sub_index, state, step, visa, is_last,
        diffusion_date, diffusion_comment, response_date, response_label, response_ref, response_comment,
        response_file_path, client_cover_page_path, pdf_path, pdf_name, pdf_size, created_by)
      values (p_copy, lv.seq, lv.index_label, lv.is_sub_index, lv.state, lv.step, lv.visa, false,
        lv.diffusion_date, lv.diffusion_comment, lv.response_date, lv.response_label, lv.response_ref, lv.response_comment,
        lv.response_file_path, lv.client_cover_page_path, lv.pdf_path, lv.pdf_name, lv.pdf_size, private.current_collaborator_id());
    end if;
  end loop;
  update public.document_versions set is_last = true
   where id = (select id from public.document_versions where document_id = p_copy order by seq desc limit 1);
  delete from public.document_files where document_id = p_copy and version_id is null;
  insert into public.document_files (document_id, storage_path, name, size, position, created_by)
  select p_copy, storage_path, name, size, position, private.current_collaborator_id()
  from public.document_files where document_id = p_lib and version_id is null;
end $$;

create or replace function private.document_import_from_library(p_project_id uuid, p_ids uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare lib public.documents; pr public.projects; v_copy uuid; n int := 0;
begin
  if not private.can_write_project(p_project_id, 'expert') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 10 then raise exception 'too_many' using errcode = 'P0001'; end if;
  select * into pr from public.projects where id = p_project_id;
  for lib in select * from public.documents where id = any (p_ids) loop
    if lib.scope <> 'library' or lib.deleted_at is not null or lib.organization_id <> pr.organization_id
       or not private.document_can_read(lib.id) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.documents c where c.project_id = p_project_id and c.library_source_id = lib.id and c.deleted_at is null) then
      raise exception 'already_imported' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.document_versions where document_id = lib.id and pdf_path is not null)
       and not exists (select 1 from public.document_files where document_id = lib.id) then
      raise exception 'no_file' using errcode = 'P0001';
    end if;
    insert into public.documents (organization_id, account_id, scope, project_id, nature, source, origin, library_source_id,
      name, ref_int, ref_ext, family_id, index_format, start_index, language_1, language_2, content_disabled, actions_disabled,
      is_large_file, created_by, updated_by)
    values (pr.organization_id, pr.account_id, 'project', p_project_id, lib.nature, lib.source, 'imported_from_library', lib.id,
      lib.name, lib.ref_int, lib.ref_ext, lib.family_id, lib.index_format, lib.start_index, lib.language_1, lib.language_2, true, true,
      lib.is_large_file, private.current_collaborator_id(), private.current_collaborator_id())
    returning id into v_copy;
    perform private.document_copy_library_versions(lib.id, v_copy);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.document_import_from_library(p_project_id uuid, p_ids uuid[])
returns int language sql security invoker set search_path = '' as $$
  select private.document_import_from_library(p_project_id, p_ids)
$$;

create or replace function private.document_refresh_from_library(p_document_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.documents;
begin
  select * into c from public.documents where id = p_document_id for update;
  if c.id is null or c.library_source_id is null or c.deleted_at is not null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not private.document_can_write(c.id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select count(*) from public.document_versions where document_id = c.id)
     > (select count(*) from public.document_versions where document_id = c.library_source_id) then
    raise exception 'inconsistent_versions' using errcode = 'P0001';
  end if;
  perform private.document_copy_library_versions(c.library_source_id, c.id);
  perform set_config('app.document_sync', 'on', true);
  update public.documents d set library_update_available = false, is_large_file = l.is_large_file, updated_at = now(),
    updated_by = private.current_collaborator_id()
  from public.documents l where l.id = c.library_source_id and d.id = c.id;
  perform set_config('app.document_sync', '', true);
end $$;

create or replace function public.document_refresh_from_library(p_document_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.document_refresh_from_library(p_document_id)
$$;

-- ===== GEL DES INDICES À LA SIGNATURE (R-DSI-4 / R-GEL-1) ============================
-- Chaque signature fige, sur les blocs Contrôles de l'étape, l'indice des documents avec version liés :
-- indice choisi (pinned) sinon dernière version ayant un fichier (ou diffusée pour un document généré).
create or replace function private.freeze_dsi_documents()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.disabled or new.state not in ('signed','not_possible') then return new; end if;
  update public.block_documents bd
     set frozen_version_id = coalesce(bd.pinned_version_id, (
       select dv.id from public.document_versions dv
       where dv.document_id = bd.document_id
         and (dv.pdf_path is not null or (d.source <> 'extern' and dv.diffusion_date is not null))
       order by dv.seq desc limit 1), bd.frozen_version_id)
    from public.blocks b, public.documents d
   where b.id = bd.block_id and b.step_id = new.step_id and b.type = 'dsi'
     and d.id = bd.document_id and d.nature <> 'pdf_unversioned';
  return new;
end $$;
create trigger freeze_dsi_documents after insert on public.signatures
  for each row execute function private.freeze_dsi_documents();

-- ===== STOCKAGE ==================================================================
-- Bucket privé « documents » : projects/<project_id>/<document_id>/<version_id>/<fichier>
--   (+ projects/<project_id>/attachments/<block_id>/… pour les pièces jointes de bloc),
--   library/<document_id>/<version_id>/<fichier>.
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 2147483648)
on conflict (id) do nothing;

create or replace function private.document_storage_access(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_parts text[] := storage.foldername(p_name); v_id uuid;
begin
  if array_length(v_parts, 1) is null or array_length(v_parts, 1) < 2
     or v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_id := v_parts[2]::uuid;
  if v_parts[1] = 'projects' then
    return case when p_write then private.can_write_project(v_id, 'writer') else private.can_read_project(v_id) end;
  elsif v_parts[1] = 'library' then
    if p_write then return private.document_can_write(v_id); end if;
    return private.document_can_read(v_id) or exists (
      select 1 from public.documents c where c.library_source_id = v_id and c.deleted_at is null and private.can_read_project(c.project_id));
  end if;
  return false;
end $$;

drop policy if exists documents_storage_select on storage.objects;
create policy documents_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and private.document_storage_access(name, false));
drop policy if exists documents_storage_insert on storage.objects;
create policy documents_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and private.document_storage_access(name, true));
drop policy if exists documents_storage_update on storage.objects;
create policy documents_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'documents' and private.document_storage_access(name, true))
  with check (bucket_id = 'documents' and private.document_storage_access(name, true));
drop policy if exists documents_storage_delete on storage.objects;
create policy documents_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and private.document_storage_access(name, true));

-- ===== RLS ======================================================================
do $$
declare t text;
begin
  foreach t in array array['documents','document_selections','document_versions','document_files','document_version_events',
    'document_shares','document_templates','closing_folder_templates','closing_section_templates','closing_sections',
    'closing_section_items','project_lists','project_list_items']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy documents_select on public.documents for select to authenticated
  using (case when scope = 'project' then (select private.can_read_project(project_id))
              else organization_id = (select private.current_org_id())
                   and account_id in (select private.accessible_account_ids())
                   and (select private.current_authority()) in ('siteflow_admin','global_admin','admin','advanced','normal') end);
create policy documents_insert on public.documents for insert to authenticated
  with check (organization_id = (select private.current_org_id())
              and case when scope = 'project' then (select private.can_write_project(project_id, 'writer'))
                       else account_id in (select private.accessible_account_ids()) and (select private.is_admin_or_advanced()) end);
create policy documents_update on public.documents for update to authenticated
  using (case when scope = 'project' then (select private.can_write_project(project_id, 'writer'))
              else organization_id = (select private.current_org_id())
                   and account_id in (select private.accessible_account_ids()) and (select private.is_admin_or_advanced()) end)
  with check (case when scope = 'project' then (select private.can_write_project(project_id, 'writer'))
              else account_id in (select private.accessible_account_ids()) and (select private.is_admin_or_advanced()) end);
create policy documents_delete on public.documents for delete to authenticated
  using (case when scope = 'project' then (select private.can_write_project(project_id, 'expert'))
              else organization_id = (select private.current_org_id())
                   and account_id in (select private.accessible_account_ids()) and (select private.is_admin_or_advanced()) end);

-- Tables rattachées à un document : lecture = lecture du document ; écriture = écriture du document.
create policy document_selections_select on public.document_selections for select to authenticated
  using ((select private.document_can_read(document_id)));
create policy document_selections_insert on public.document_selections for insert to authenticated
  with check ((select private.document_can_write(document_id)));
create policy document_selections_update on public.document_selections for update to authenticated
  using ((select private.document_can_write(document_id))) with check ((select private.document_can_write(document_id)));
create policy document_selections_delete on public.document_selections for delete to authenticated
  using ((select private.document_can_write(document_id)));

-- Versions et historique : lecture seule (mutations via document_version_action).
create policy document_versions_select on public.document_versions for select to authenticated
  using ((select private.document_can_read(document_id)));
create policy document_version_events_select on public.document_version_events for select to authenticated
  using (exists (select 1 from public.document_versions v where v.id = version_id));
revoke insert, update, delete on public.document_versions, public.document_version_events from authenticated;

-- Fichiers des PDF sans version (niveau document) ; les fichiers d'indice passent par les RPC.
create policy document_files_select on public.document_files for select to authenticated
  using ((select private.document_can_read(document_id)));
create policy document_files_insert on public.document_files for insert to authenticated
  with check (version_id is null and (select private.document_can_write(document_id)));
create policy document_files_update on public.document_files for update to authenticated
  using (version_id is null and (select private.document_can_write(document_id)))
  with check (version_id is null and (select private.document_can_write(document_id)));
create policy document_files_delete on public.document_files for delete to authenticated
  using (version_id is null and (select private.document_can_write(document_id)));

create policy document_shares_select on public.document_shares for select to authenticated
  using ((select private.can_read_project(project_id)));
create policy document_shares_insert on public.document_shares for insert to authenticated
  with check ((select private.can_write_project(project_id, 'writer')));
create policy document_shares_update on public.document_shares for update to authenticated
  using ((select private.can_write_project(project_id, 'writer'))) with check ((select private.can_write_project(project_id, 'writer')));
create policy document_shares_delete on public.document_shares for delete to authenticated
  using ((select private.can_write_project(project_id, 'writer')));

create policy document_templates_select on public.document_templates for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy document_templates_insert on public.document_templates for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and (select private.current_authority()) = 'siteflow_admin');
create policy document_templates_update on public.document_templates for update to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.current_authority()) = 'siteflow_admin')
  with check (organization_id = (select private.current_org_id()));
create policy document_templates_delete on public.document_templates for delete to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.current_authority()) = 'siteflow_admin');

create policy closing_folder_templates_select on public.closing_folder_templates for select to authenticated
  using (account_id in (select private.accessible_account_ids()));
create policy closing_folder_templates_insert on public.closing_folder_templates for insert to authenticated
  with check (account_id in (select private.accessible_account_ids()) and (select private.is_admin_or_advanced()));
create policy closing_folder_templates_update on public.closing_folder_templates for update to authenticated
  using (account_id in (select private.accessible_account_ids()) and (select private.is_admin_or_advanced()))
  with check (account_id in (select private.accessible_account_ids()));
create policy closing_folder_templates_delete on public.closing_folder_templates for delete to authenticated
  using (account_id in (select private.accessible_account_ids()) and (select private.is_admin()));

create policy closing_section_templates_select on public.closing_section_templates for select to authenticated
  using (exists (select 1 from public.closing_folder_templates t where t.id = folder_template_id));
create policy closing_section_templates_insert on public.closing_section_templates for insert to authenticated
  with check ((select private.is_admin_or_advanced()) and exists (select 1 from public.closing_folder_templates t where t.id = folder_template_id));
create policy closing_section_templates_update on public.closing_section_templates for update to authenticated
  using ((select private.is_admin_or_advanced()) and exists (select 1 from public.closing_folder_templates t where t.id = folder_template_id))
  with check ((select private.is_admin_or_advanced()));
create policy closing_section_templates_delete on public.closing_section_templates for delete to authenticated
  using ((select private.is_admin_or_advanced()) and exists (select 1 from public.closing_folder_templates t where t.id = folder_template_id));

create policy closing_sections_select on public.closing_sections for select to authenticated
  using ((select private.document_can_read(folder_document_id)));
create policy closing_sections_insert on public.closing_sections for insert to authenticated
  with check ((select private.document_can_write(folder_document_id)));
create policy closing_sections_update on public.closing_sections for update to authenticated
  using ((select private.document_can_write(folder_document_id))) with check ((select private.document_can_write(folder_document_id)));
create policy closing_sections_delete on public.closing_sections for delete to authenticated
  using ((select private.document_can_write(folder_document_id)));

create policy closing_section_items_select on public.closing_section_items for select to authenticated
  using (exists (select 1 from public.closing_sections s where s.id = section_id));
create policy closing_section_items_insert on public.closing_section_items for insert to authenticated
  with check (exists (select 1 from public.closing_sections s where s.id = section_id and private.document_can_write(s.folder_document_id)));
create policy closing_section_items_update on public.closing_section_items for update to authenticated
  using (exists (select 1 from public.closing_sections s where s.id = section_id and private.document_can_write(s.folder_document_id)))
  with check (exists (select 1 from public.closing_sections s where s.id = section_id and private.document_can_write(s.folder_document_id)));
create policy closing_section_items_delete on public.closing_section_items for delete to authenticated
  using (exists (select 1 from public.closing_sections s where s.id = section_id and private.document_can_write(s.folder_document_id)));

create policy project_lists_select on public.project_lists for select to authenticated
  using ((select private.can_read_project(project_id)));
create policy project_lists_insert on public.project_lists for insert to authenticated
  with check ((select private.can_write_project(project_id, 'writer')));
create policy project_lists_update on public.project_lists for update to authenticated
  using ((select private.can_write_project(project_id, 'writer'))) with check ((select private.can_write_project(project_id, 'writer')));
create policy project_lists_delete on public.project_lists for delete to authenticated
  using ((select private.can_write_project(project_id, 'expert')));

create policy project_list_items_select on public.project_list_items for select to authenticated
  using (exists (select 1 from public.project_lists l where l.id = list_id));
create policy project_list_items_insert on public.project_list_items for insert to authenticated
  with check (exists (select 1 from public.project_lists l where l.id = list_id and private.can_write_project(l.project_id, 'writer')));
create policy project_list_items_update on public.project_list_items for update to authenticated
  using (exists (select 1 from public.project_lists l where l.id = list_id and private.can_write_project(l.project_id, 'writer')))
  with check (exists (select 1 from public.project_lists l where l.id = list_id and private.can_write_project(l.project_id, 'writer')));
create policy project_list_items_delete on public.project_list_items for delete to authenticated
  using (exists (select 1 from public.project_lists l where l.id = list_id and private.can_write_project(l.project_id, 'writer')));

-- ===== DROITS D'EXÉCUTION =======================================================
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
revoke execute on function public.document_version_action(uuid, text, jsonb), public.document_enqueue_generation(uuid, text, jsonb),
  public.document_import_from_library(uuid, uuid[]), public.document_refresh_from_library(uuid),
  public.document_complete_generation(uuid, text, bigint, text) from public, anon;
grant execute on function public.document_version_action(uuid, text, jsonb), public.document_enqueue_generation(uuid, text, jsonb),
  public.document_import_from_library(uuid, uuid[]), public.document_refresh_from_library(uuid) to authenticated;
revoke execute on function public.document_complete_generation(uuid, text, bigint, text) from authenticated;
grant execute on function public.document_complete_generation(uuid, text, bigint, text) to service_role;
