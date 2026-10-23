-- =============================================================================
-- Formulaires (bibliothèque + projet), versions figées, liaisons bloc ↔ formulaire,
-- réponses et valeurs. Réf. docs/specs/03-formulaires-reponses.md §10
-- =============================================================================

create type public.form_location    as enum ('library','project');
create type public.form_origin      as enum ('imported','local');
create type public.form_nature      as enum ('model','generic','other','local','archived');
create type public.rubric_type      as enum ('question','table_row','table_column');
create type public.question_type    as enum ('short_answer','long_answer','multiple_answers','unique_choice','multiple_choices',
  'single_choice_list','multiple_choice_list','date','datetime','duration','value_unit','photo','collaborator',
  'location','formula','file','text_editor');
create type public.size_enum        as enum ('xs','s','m','l','xl');
create type public.question_icon    as enum ('question','clock','exclamation_triangle','wrench','flag','info_circle','bell','key',
  'hand_paper','lightbulb','calendar','eye');
create type public.object_attr_link as enum ('disabled','default_family','other_family');
create type public.response_context as enum ('project','flow','share');
create type public.response_state   as enum ('in_progress','done');
create type public.value_type       as enum ('string','text','boolean','string_list','date','datetime','duration','number',
  'value_and_unit','coordinates','file_list','rich_text','signature');
create type public.unique_mode      as enum ('new_or_resume','new_response','resume_response');

-- Valeurs exportables (paramétrables par organisation, cf. spec 03 §3.5.6)
create table public.export_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  label text not null,
  data_type text,
  out_code text,
  unique (organization_id, code)
);

-- ===== FORMULAIRE ===============================================================
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  lineage_id uuid not null,
  location public.form_location not null,
  origin public.form_origin,
  project_id uuid references public.projects(id) on delete cascade,
  sourced_from_form_id uuid references public.forms(id) on delete set null,
  sourced_from_version_id uuid,
  nature public.form_nature not null,
  name text not null check (char_length(name) between 1 and 255),
  description text,
  reference text,
  index_label text,
  family_id uuid references public.label_families(id),
  custom_status_id uuid references public.custom_statuses(id),
  additional_comment text,
  additional_observation text,
  lock_responses boolean not null default false,
  object_attributes_link public.object_attr_link not null default 'disabled',
  object_family_id uuid references public.label_families(id),
  pdf_template jsonb,
  hide_in_exports jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  archived boolean not null default false,
  current_version_id uuid,
  structure_rev int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.collaborators(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.collaborators(id) on delete set null,
  deleted_at timestamptz,
  check ((location = 'library' and project_id is null and origin is null)
      or (location = 'project' and project_id is not null and origin is not null))
);
create index forms_org_location_idx on public.forms (organization_id, location) where deleted_at is null;
create index forms_account_idx on public.forms (account_id);
create index forms_project_idx on public.forms (project_id) where deleted_at is null;
create index forms_lineage_idx on public.forms (lineage_id);
create index forms_sourced_idx on public.forms (sourced_from_form_id);
create index forms_family_idx on public.forms (family_id);
create index forms_status_idx on public.forms (custom_status_id);
create index forms_object_family_idx on public.forms (object_family_id);
create index forms_created_by_idx on public.forms (created_by);
create index forms_updated_by_idx on public.forms (updated_by);
create unique index forms_project_lineage_unique on public.forms (project_id, lineage_id)
  where location = 'project' and origin = 'imported' and deleted_at is null;

create table public.form_companies (
  form_id uuid not null references public.forms(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary key (form_id, company_id)
);
create index form_companies_company_idx on public.form_companies (company_id);

create table public.form_rubrics (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  lineage_id uuid not null,
  position int not null,
  type public.rubric_type not null,
  name text not null,
  description varchar(255),
  additional_comment text,
  additional_observation text,
  hidden_in_mobile boolean not null default false,
  hide_in_pdf boolean not null default false,
  pdf_landscape boolean not null default false,
  export_images_in_appendix boolean not null default false,
  attachment_width public.size_enum,
  attachment_height public.size_enum,
  allow_add_row boolean not null default false,
  allow_add_column boolean not null default false,
  first_column_hidden boolean not null default false,
  import_xlsx_enabled boolean not null default false,
  unique (form_id, position) deferrable initially deferred
);
create index form_rubrics_lineage_idx on public.form_rubrics (lineage_id);

create table public.form_questions (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references public.form_rubrics(id) on delete cascade,
  form_id uuid not null references public.forms(id) on delete cascade,
  lineage_id uuid not null,
  position int not null,
  type public.question_type not null default 'short_answer',
  name text not null,
  description text,
  additional_comment text,
  additional_observation text,
  mandatory boolean not null default false,
  with_observation boolean not null default false,
  lockable boolean not null default false,
  allow_backdating boolean not null default false,
  shared boolean not null default false,
  hide_in_pdf boolean not null default false,
  hide_images_below_table boolean not null default false,
  unify_cells boolean not null default false,
  photo_size public.size_enum default 's',
  background_color text check (background_color is null or background_color ~ '^#[0-9A-Fa-f]{6}$'),
  icon public.question_icon,
  object_attribute_id uuid references public.custom_fields(id) on delete set null,
  unique (rubric_id, position) deferrable initially deferred
);
create index form_questions_form_idx on public.form_questions (form_id);
create index form_questions_lineage_idx on public.form_questions (lineage_id);
create index form_questions_attr_idx on public.form_questions (object_attribute_id);

create table public.form_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.form_questions(id) on delete cascade,
  form_id uuid not null references public.forms(id) on delete cascade,
  lineage_id uuid not null,
  position int not null,
  code text,
  name text,
  option_name text,
  description text,
  placeholder text,
  choices text[] not null default '{}',
  unit varchar(20),
  value_hint text,
  formula text,
  formula_refs uuid[] not null default '{}',
  frozen boolean not null default false,
  prefill jsonb,       -- {mode:'static'|'dynamic', value, variable}
  validation jsonb,    -- {op, min, max, message, block}
  alert jsonb,         -- {type, text}
  redirect_rubric_id uuid references public.form_rubrics(id) on delete set null,
  redirect_question_id uuid references public.form_questions(id) on delete set null,
  export_key text,
  pdf_field_name text,
  xls_export boolean not null default false,
  xls_label text,
  photo_size public.size_enum,
  unique (question_id, position) deferrable initially deferred,
  check (validation is null or validation ? 'op'),
  check (alert is null or (alert ? 'type' and alert ? 'text'))
);
create index form_options_form_idx on public.form_options (form_id);
create index form_options_lineage_idx on public.form_options (lineage_id);
create index form_options_redirect_r_idx on public.form_options (redirect_rubric_id);
create index form_options_redirect_q_idx on public.form_options (redirect_question_id);
create unique index form_options_code_unique on public.form_options (form_id, lower(code)) where code is not null;
create unique index form_options_pdf_unique on public.form_options (form_id, pdf_field_name) where pdf_field_name is not null;
create unique index form_options_export_unique on public.form_options (form_id, export_key) where export_key is not null;

create table public.form_signatory_slots (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.form_questions(id) on delete cascade,
  form_id uuid not null references public.forms(id) on delete cascade,
  lineage_id uuid not null,
  position int not null,
  name text,
  description text,
  disable_signature boolean not null default false,
  pdf_field_name text,
  xls_export boolean not null default false,
  xls_label text,
  unique (question_id, position) deferrable initially deferred
);
create index form_signatory_slots_form_idx on public.form_signatory_slots (form_id);

create table public.form_files (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  owner_kind text not null check (owner_kind in ('rubric','question','option')),
  owner_id uuid not null,
  storage_path text not null,
  name text,
  position int not null default 0
);
create index form_files_form_idx on public.form_files (form_id);
create index form_files_owner_idx on public.form_files (owner_id);

create table public.form_versions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  version_no int not null,
  structure_rev int not null,
  index_label text,
  reference text,
  library_form_id uuid,
  structure jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.collaborators(id) on delete set null,
  unique (form_id, version_no)
);
create index form_versions_created_by_idx on public.form_versions (created_by);
alter table public.forms
  add constraint forms_current_version_fkey foreign key (current_version_id) references public.form_versions(id) on delete set null;
create index forms_current_version_idx on public.forms (current_version_id);

-- ===== LIAISON BLOC ↔ FORMULAIRE ================================================
create table public.form_block_links (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.blocks(id) on delete restrict,
  step_id uuid not null references public.steps(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  form_id uuid not null references public.forms(id) on delete restrict,
  pinned_version_id uuid references public.form_versions(id) on delete set null,
  position int not null default 0,
  enabled boolean not null default true,
  mandatory boolean not null default false,
  unique_response boolean not null default false,
  unique_mode public.unique_mode not null default 'new_or_resume',
  initial_rubric_lineage_id uuid,
  fillable_rubric_lineage_ids uuid[],          -- null = toutes
  technical_object_id uuid references public.technical_objects(id) on delete set null,
  additional_comment text,
  created_at timestamptz not null default now()
);
create index form_block_links_block_idx on public.form_block_links (block_id);
create index form_block_links_step_idx on public.form_block_links (step_id);
create index form_block_links_flow_idx on public.form_block_links (flow_id);
create index form_block_links_form_idx on public.form_block_links (form_id);
create index form_block_links_version_idx on public.form_block_links (pinned_version_id);
create index form_block_links_obj_idx on public.form_block_links (technical_object_id);

-- ===== RÉPONSES =================================================================
create table public.form_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  form_id uuid not null references public.forms(id) on delete restrict,
  form_version_id uuid not null references public.form_versions(id) on delete restrict,
  form_lineage_id uuid not null,
  form_index_label text,
  form_reference text,
  context public.response_context not null,
  block_link_id uuid references public.form_block_links(id) on delete set null,
  flow_id uuid references public.flows(id) on delete set null,
  phase_id uuid references public.phases(id) on delete set null,
  step_id uuid references public.steps(id) on delete set null,
  reference text not null check (char_length(reference) >= 3),
  state public.response_state not null default 'in_progress',
  custom_status_id uuid references public.custom_statuses(id) on delete set null,
  provenance public.event_source not null default 'webapp',
  dynamic_context jsonb not null default '{}'::jsonb,
  active_redirect jsonb,
  last_rubric_lineage_id uuid,
  done_at timestamptz,
  done_by uuid references public.collaborators(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.collaborators(id) on delete set null,
  created_by_external jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.collaborators(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.collaborators(id) on delete set null
);
create index form_responses_project_idx on public.form_responses (project_id, form_lineage_id, state) where deleted_at is null;
create index form_responses_account_idx on public.form_responses (account_id);
create index form_responses_form_idx on public.form_responses (form_id);
create index form_responses_version_idx on public.form_responses (form_version_id);
create index form_responses_block_link_idx on public.form_responses (block_link_id);
create index form_responses_flow_idx on public.form_responses (flow_id);
create index form_responses_phase_idx on public.form_responses (phase_id);
create index form_responses_step_idx on public.form_responses (step_id);
create index form_responses_status_idx on public.form_responses (custom_status_id);
create index form_responses_done_by_idx on public.form_responses (done_by);
create index form_responses_created_by_idx on public.form_responses (created_by);
create index form_responses_updated_by_idx on public.form_responses (updated_by);
create index form_responses_deleted_by_idx on public.form_responses (deleted_by);

-- Lignes / colonnes / options ajoutées sur le terrain (propres à la réponse)
create table public.form_response_dynamic_items (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.form_responses(id) on delete cascade,
  rubric_lineage_id uuid not null,
  kind text not null check (kind in ('question','option')),
  parent_lineage_id uuid,
  template_lineage_id uuid not null,
  lineage_id uuid not null default gen_random_uuid(),
  position int not null,
  name text
);
create index form_response_dynamic_items_resp_idx on public.form_response_dynamic_items (response_id);

create table public.form_response_values (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.form_responses(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rubric_lineage_id uuid not null,
  question_lineage_id uuid not null,
  option_lineage_id uuid not null,
  option_code text,
  coord text not null,
  question_type public.question_type not null,
  value_type public.value_type not null,
  value_text text,
  value_number numeric,
  value_bool boolean,
  value_date date,
  value_ts timestamptz,
  value_json jsonb,
  observation text,
  is_valid boolean,
  locked boolean not null default false,
  locked_at timestamptz,
  locked_by uuid references public.collaborators(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.collaborators(id) on delete set null,
  provenance public.event_source not null default 'webapp',
  unique (response_id, option_lineage_id)
);
create index form_response_values_code_idx on public.form_response_values (organization_id, option_code) where option_code is not null;
create index form_response_values_option_idx on public.form_response_values (option_lineage_id);
create index form_response_values_json_idx on public.form_response_values using gin (value_json jsonb_path_ops);
create index form_response_values_locked_by_idx on public.form_response_values (locked_by);
create index form_response_values_updated_by_idx on public.form_response_values (updated_by);

create table public.form_response_value_history (
  id bigint generated always as identity primary key,
  response_id uuid not null references public.form_responses(id) on delete cascade,
  value_id uuid references public.form_response_values(id) on delete set null,
  option_lineage_id uuid not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.collaborators(id) on delete set null,
  provenance public.event_source not null default 'webapp',
  old_value jsonb,
  new_value jsonb,
  files_added jsonb,
  files_removed jsonb,
  change_signature jsonb,
  reason text
);
create index form_response_value_history_resp_idx on public.form_response_value_history (response_id, option_lineage_id, changed_at desc);
create index form_response_value_history_value_idx on public.form_response_value_history (value_id);
create index form_response_value_history_by_idx on public.form_response_value_history (changed_by);

create table public.form_response_events (
  id bigint generated always as identity primary key,
  response_id uuid not null references public.form_responses(id) on delete cascade,
  action text not null,
  actor_id uuid references public.collaborators(id) on delete set null,
  provenance public.event_source not null default 'webapp',
  at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);
create index form_response_events_resp_idx on public.form_response_events (response_id, at desc);
create index form_response_events_actor_idx on public.form_response_events (actor_id);

create table public.form_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  form_id uuid references public.forms(id) on delete cascade,
  response_id uuid references public.form_responses(id) on delete cascade,
  email text not null,
  language public.ui_language not null default 'fr',
  comment text,
  token_hash text not null,
  code_hash text,
  code_expires_at timestamptz,
  expires_at timestamptz not null,
  sent_at timestamptz,
  sent_by uuid references public.collaborators(id) on delete set null,
  blocked boolean not null default false,
  responded_at timestamptz,
  revoked_at timestamptz,
  contributor jsonb,
  created_at timestamptz not null default now(),
  check (form_id is not null or response_id is not null)
);
create unique index form_shares_active_unique on public.form_shares (lower(email), coalesce(response_id, form_id)) where revoked_at is null;
create index form_shares_project_idx on public.form_shares (project_id);
create index form_shares_form_idx on public.form_shares (form_id);
create index form_shares_response_idx on public.form_shares (response_id);
create index form_shares_sent_by_idx on public.form_shares (sent_by);

-- ===== TRIGGERS =================================================================
do $$
declare t text;
begin
  foreach t in array array['forms','form_responses']
  loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function private.set_updated_at()', t);
  end loop;
end $$;

-- Toute modification de structure incrémente forms.structure_rev (publication de version à la demande).
create or replace function private.bump_form_structure()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.forms set structure_rev = structure_rev + 1 where id = coalesce(new.form_id, old.form_id);
  return coalesce(new, old);
end $$;
do $$
declare t text;
begin
  foreach t in array array['form_rubrics','form_questions','form_options','form_signatory_slots','form_files']
  loop
    execute format('create trigger bump_form_structure after insert or update or delete on public.%I
                    for each row execute function private.bump_form_structure()', t);
  end loop;
end $$;

-- Statut par défaut (nature form / form_response).
create or replace function private.default_custom_status(p_org uuid, p_account uuid, p_nature public.business_class)
returns uuid language sql stable security definer set search_path = '' as $$
  select s.id from public.custom_statuses s
  where s.organization_id = p_org and (s.account_id is null or s.account_id = p_account)
    and s.nature = p_nature and s.is_default and s.active
  order by s.account_id nulls last limit 1
$$;

create or replace function private.forms_default_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.custom_status_id is null then
    new.custom_status_id := private.default_custom_status(new.organization_id, new.account_id, 'form');
  end if;
  return new;
end $$;
create trigger forms_default_status before insert on public.forms
  for each row execute function private.forms_default_status();

create or replace function private.responses_default_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.custom_status_id is null then
    new.custom_status_id := private.default_custom_status(new.organization_id, new.account_id, 'form_response');
  end if;
  return new;
end $$;
create trigger responses_default_status before insert on public.form_responses
  for each row execute function private.responses_default_status();

-- ===== AUTORISATIONS ============================================================
create or replace function private.has_additional_right(p_right public.additional_right)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_right = any((private.current_collaborator()).additional_rights), false)
$$;

create or replace function private.can_read_form(p_form_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.forms f
    where f.id = p_form_id
      and f.organization_id = private.current_org_id()
      and (f.location = 'library' or private.can_read_project(f.project_id))
  )
$$;

-- Bibliothèque : admin / avancé avec droit complémentaire ; projet : rédacteur+ (copies locales).
create or replace function private.can_write_form(p_form_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.forms f
    where f.id = p_form_id
      and f.organization_id = private.current_org_id()
      and case when f.location = 'library'
               then f.account_id in (select private.accessible_account_ids())
                    and (private.is_admin()
                         or (f.nature = 'generic' and private.has_additional_right('generic_form'))
                         or (f.nature = 'model' and private.has_additional_right('model_form')))
               else private.can_write_project(f.project_id, 'writer') end
  )
$$;

grant execute on all functions in schema private to authenticated;
revoke execute on all functions in schema private from public, anon;

-- ===== RLS ======================================================================
do $$
declare t text;
begin
  foreach t in array array['export_keys','forms','form_companies','form_rubrics','form_questions','form_options',
    'form_signatory_slots','form_files','form_versions','form_block_links','form_responses',
    'form_response_dynamic_items','form_response_values','form_response_value_history','form_response_events','form_shares']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy export_keys_select on public.export_keys for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy export_keys_write on public.export_keys for all to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.current_authority()) = 'siteflow_admin')
  with check (organization_id = (select private.current_org_id()));

create policy forms_select on public.forms for select to authenticated
  using (organization_id = (select private.current_org_id())
         and (location = 'library' or (select private.can_read_project(project_id))));
create policy forms_insert on public.forms for insert to authenticated
  with check (organization_id = (select private.current_org_id())
              and account_id in (select private.accessible_account_ids())
              and case when location = 'library'
                       then (select private.is_admin())
                            or (nature = 'generic' and (select private.has_additional_right('generic_form')))
                            or (nature = 'model' and (select private.has_additional_right('model_form')))
                       else (select private.can_write_project(project_id, 'writer')) end);
create policy forms_update on public.forms for update to authenticated
  using ((select private.can_write_form(id)))
  with check (organization_id = (select private.current_org_id()));
create policy forms_delete on public.forms for delete to authenticated
  using ((select private.can_write_form(id)));

do $$
declare t text;
begin
  foreach t in array array['form_companies','form_rubrics','form_questions','form_options','form_signatory_slots',
    'form_files','form_versions']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
                    using ((select private.can_read_form(form_id)))', t);
    execute format('create policy %1$s_write on public.%1$I for all to authenticated
                    using ((select private.can_write_form(form_id)))
                    with check ((select private.can_write_form(form_id)))', t);
  end loop;
end $$;

-- Les versions sont aussi créées à la première réponse par un opérateur : insertion autorisée à la lecture.
create policy form_versions_insert_on_read on public.form_versions for insert to authenticated
  with check ((select private.can_read_form(form_id)));

create policy fbl_select on public.form_block_links for select to authenticated
  using ((select private.can_read_flow(flow_id)));
create policy fbl_write on public.form_block_links for all to authenticated
  using ((select private.can_write_flow(flow_id, 'writer')))
  with check ((select private.can_write_flow(flow_id, 'writer')));

create policy responses_select on public.form_responses for select to authenticated
  using ((select private.can_read_project(project_id)));
create policy responses_insert on public.form_responses for insert to authenticated
  with check ((select private.can_write_project(project_id, 'operator')));
create policy responses_update on public.form_responses for update to authenticated
  using ((select private.can_write_project(project_id, 'operator')))
  with check ((select private.can_write_project(project_id, 'operator')));
create policy responses_delete on public.form_responses for delete to authenticated
  using ((select private.can_write_project(project_id, 'writer')));

create or replace function private.can_read_response(p_response_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.form_responses r
                 where r.id = p_response_id and private.can_read_project(r.project_id))
$$;
create or replace function private.can_write_response(p_response_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.form_responses r
                 where r.id = p_response_id and private.can_write_project(r.project_id, 'operator'))
$$;
grant execute on function private.can_read_response(uuid), private.can_write_response(uuid) to authenticated;
revoke execute on function private.can_read_response(uuid), private.can_write_response(uuid) from public, anon;

do $$
declare t text;
begin
  foreach t in array array['form_response_dynamic_items','form_response_values']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
                    using ((select private.can_read_response(response_id)))', t);
    execute format('create policy %1$s_write on public.%1$I for all to authenticated
                    using ((select private.can_write_response(response_id)))
                    with check ((select private.can_write_response(response_id)))', t);
  end loop;
  foreach t in array array['form_response_value_history','form_response_events']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
                    using ((select private.can_read_response(response_id)))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated
                    with check ((select private.can_write_response(response_id)))', t);
  end loop;
end $$;

create policy form_shares_select on public.form_shares for select to authenticated
  using ((select private.can_read_project(project_id)));
create policy form_shares_write on public.form_shares for all to authenticated
  using ((select private.can_write_project(project_id, 'writer')))
  with check ((select private.can_write_project(project_id, 'writer')));
