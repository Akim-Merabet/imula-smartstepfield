-- =============================================================================
-- Flows, contenu (séquences → phases → étapes → blocs) et signatures.
-- Réf. docs/specs/02-flows-contenu-blocs.md
-- =============================================================================

-- ===== ENUMS ====================================================================
create type public.flow_type as enum ('specific','generic','group','flow_form','template',
  'referential','referential_generic','group_referential','referential_intervention','local_referential');
create type public.flow_origin as enum ('local','derived_from_standard');
create type public.sequencing_type as enum ('linear','parallel');
create type public.block_type as enum ('pr','emm','adr','dsi','form','txt','rhp','multi_pr','object');
create type public.block_state as enum ('redaction','verification','approbation','validated');
create type public.block_validation_action as enum ('create','to_verification','to_approbation','to_validated','retry','reject','reset');
create type public.txt_visibility as enum ('mobile_app','document');
create type public.navigation_style as enum ('default','info','warning','error','success');
create type public.dsi_signatories_status as enum ('enabled','disabled','required','optional');
create type public.signature_nature as enum ('realisation','tech_control',
  'breakpoint_int_1','breakpoint_int_2','breakpoint_int_3',
  'convocation_int_1','convocation_int_2','convocation_int_3',
  'breakpoint_ext_1','breakpoint_ext_2','breakpoint_ext_3',
  'convocation_ext_1','convocation_ext_2','convocation_ext_3');
create type public.signature_state as enum ('signed','waiting','free','not_possible');
create type public.contributor_type as enum ('intern','extern','not_listed_intern');
create type public.geometry_kind as enum ('point','polygon','polyline','circle','multi_line_string');
create type public.geometry_icon as enum ('default','without_icon','truck','snowplow','warehouse','archive','hard_hat','toolbox','rocket','caravan');
create type public.flow_event_type as enum ('create','delete','import_content_referential','import_content_template','reset_flow',
  'delete_and_re_import_content','update_library','detach_fbl','activate_phase','activate_step','activate_form',
  'deactivate_phase','deactivate_step','deactivate_form','deactivate_and_link_new_form','detach_and_link_new_form',
  'add_user_hierarchy_in_flow','delete_user_hierarchy_from_flow','deactivate_signature','skip_fill_restriction',
  'validate_step','devalidate_step');
create type public.job_status as enum ('to_do','in_progress','done','failed');

-- ===== FLOW =====================================================================
create table public.flows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  flow_type public.flow_type not null,
  name text not null check (char_length(name) between 1 and 255),
  description text,
  ref_int text,
  ref_ext text,
  family_id uuid references public.label_families(id),
  category_id uuid references public.label_families(id),
  custom_status_id uuid references public.custom_statuses(id),
  location_activated boolean not null default false,
  location_site text, location_area text, location_local text,
  elementary_system text, functional_marker text,
  technical_object_id uuid references public.technical_objects(id) on delete set null,
  technical_object_label text,
  reporter_id uuid references public.collaborators(id) on delete set null,
  tablet_1_id uuid references public.tablets(id) on delete set null,
  tablet_2_id uuid references public.tablets(id) on delete set null,
  tablet_3_id uuid references public.tablets(id) on delete set null,
  start_date timestamptz, finish_date timestamptz,                    -- planifiées
  estimated_start_date timestamptz, estimated_end_date timestamptz,   -- prévues
  achieved_start_date timestamptz, achieved_end_date timestamptz,     -- réalisées
  bar_color text,
  supervision_intern_1 boolean not null default false,
  supervision_intern_2 boolean not null default false,
  supervision_intern_3 boolean not null default false,
  supervision_extern_1 boolean not null default false,
  supervision_extern_2 boolean not null default false,
  supervision_extern_3 boolean not null default false,
  internal_supervisor_name_1 text, internal_supervisor_name_2 text, internal_supervisor_name_3 text,
  external_supervisor_name_1 text, external_supervisor_name_2 text, external_supervisor_name_3 text,
  simplified_signature_mode boolean not null default false,
  origin public.flow_origin not null default 'local',
  sourced_from_flow_id uuid references public.flows(id) on delete set null,
  sourced_from_index text,
  executed_from_flow_id uuid references public.flows(id) on delete set null,
  unlocked boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references public.collaborators(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.collaborators(id) on delete set null,
  content_updated_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.collaborators(id) on delete set null,
  check (start_date is null or finish_date is null or start_date <= finish_date),
  check (estimated_start_date is null or estimated_end_date is null or estimated_start_date <= estimated_end_date),
  check (achieved_start_date is null or achieved_end_date is null or achieved_start_date <= achieved_end_date)
);
create index flows_project_idx on public.flows (project_id) where deleted_at is null;
create index flows_account_idx on public.flows (account_id);
create index flows_family_idx on public.flows (family_id);
create index flows_category_idx on public.flows (category_id);
create index flows_status_idx on public.flows (custom_status_id);
create index flows_sourced_idx on public.flows (sourced_from_flow_id);
create index flows_executed_idx on public.flows (executed_from_flow_id);
create index flows_reporter_idx on public.flows (reporter_id);
create index flows_tablet1_idx on public.flows (tablet_1_id);
create index flows_tablet2_idx on public.flows (tablet_2_id);
create index flows_tablet3_idx on public.flows (tablet_3_id);
create index flows_techobj_idx on public.flows (technical_object_id);
create index flows_created_by_idx on public.flows (created_by);
create index flows_updated_by_idx on public.flows (updated_by);
create index flows_deleted_by_idx on public.flows (deleted_by);

create table public.flow_assignees (            -- responsables (multiples, R2.1)
  flow_id uuid not null references public.flows(id) on delete cascade,
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  primary key (flow_id, collaborator_id)
);
create index flow_assignees_collab_idx on public.flow_assignees (collaborator_id);

create table public.flow_collaborators (        -- collaborateurs restreints au flow
  flow_id uuid not null references public.flows(id) on delete cascade,
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  primary key (flow_id, collaborator_id)
);
create index flow_collaborators_collab_idx on public.flow_collaborators (collaborator_id);

create table public.flow_collaborator_hierarchies (
  flow_id uuid not null,
  collaborator_id uuid not null,
  hierarchy_id uuid not null references public.label_families(id) on delete cascade,
  primary key (flow_id, collaborator_id, hierarchy_id),
  foreign key (flow_id, collaborator_id) references public.flow_collaborators (flow_id, collaborator_id) on delete cascade
);
create index flow_collab_hier_h_idx on public.flow_collaborator_hierarchies (hierarchy_id);

create table public.flow_tags (
  flow_id uuid not null references public.flows(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (flow_id, tag_id)
);
create index flow_tags_tag_idx on public.flow_tags (tag_id);

create table public.flow_secondary_categories (
  flow_id uuid not null references public.flows(id) on delete cascade,
  category_id uuid not null references public.label_families(id) on delete cascade,
  primary key (flow_id, category_id)
);
create index flow_secondary_categories_cat_idx on public.flow_secondary_categories (category_id);

create table public.flow_content_imports (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.flows(id) on delete cascade,
  source_flow_id uuid references public.flows(id) on delete set null,
  kind text not null check (kind in ('referential','template')),
  after_phase_id uuid,
  imported_at timestamptz not null default now(),
  imported_by uuid references public.collaborators(id) on delete set null
);
create index flow_content_imports_flow_idx on public.flow_content_imports (flow_id);
create index flow_content_imports_source_idx on public.flow_content_imports (source_flow_id);
create index flow_content_imports_by_idx on public.flow_content_imports (imported_by);

create table public.flow_status_history (
  id bigint generated always as identity primary key,
  flow_id uuid not null references public.flows(id) on delete cascade,
  from_status_id uuid references public.custom_statuses(id) on delete set null,
  to_status_id uuid references public.custom_statuses(id) on delete set null,
  comment text,
  actor_id uuid references public.collaborators(id) on delete set null,
  source public.event_source not null default 'webapp',
  occurred_at timestamptz not null default now()
);
create index flow_status_history_flow_idx on public.flow_status_history (flow_id, occurred_at desc);
create index flow_status_history_from_idx on public.flow_status_history (from_status_id);
create index flow_status_history_to_idx on public.flow_status_history (to_status_id);
create index flow_status_history_actor_idx on public.flow_status_history (actor_id);

create table public.flow_events (
  id bigint generated always as identity primary key,
  flow_id uuid not null references public.flows(id) on delete cascade,
  event_type public.flow_event_type not null,
  actor_id uuid references public.collaborators(id) on delete set null,
  source public.event_source not null default 'webapp',
  phase_id uuid,
  step_id uuid,
  comment text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index flow_events_flow_idx on public.flow_events (flow_id, occurred_at desc);
create index flow_events_actor_idx on public.flow_events (actor_id);

create table public.flow_geometries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  flow_id uuid references public.flows(id) on delete cascade,
  kind public.geometry_kind not null,
  label text,
  icon public.geometry_icon not null default 'default',
  geojson jsonb not null,
  altitude numeric,
  radius_m numeric,
  color text,
  created_at timestamptz not null default now()
);
create index flow_geometries_project_idx on public.flow_geometries (project_id);
create index flow_geometries_flow_idx on public.flow_geometries (flow_id);

-- ===== CONTENU ==================================================================
create table public.sequences (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.flows(id) on delete cascade,
  position int not null,
  type public.sequencing_type not null default 'linear',
  unique (flow_id, position) deferrable initially deferred
);

create table public.phases (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.flows(id) on delete cascade,
  sequence_id uuid references public.sequences(id) on delete set null,
  position int not null,
  custom_number text,
  exclude_numbering boolean not null default false,
  name text not null check (char_length(name) between 1 and 255),
  description text,
  additional_comment text,
  hide_title_pdf boolean not null default false,
  disabled boolean not null default false,
  disabled_comment text,
  read_only_on_mobile_app boolean not null default false,
  sequence_type public.sequencing_type not null default 'linear',
  mandatory boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flow_id, position) deferrable initially deferred
);
create index phases_sequence_idx on public.phases (sequence_id);

create table public.steps (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.phases(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  position int not null,
  custom_number text,
  revision_number text,
  exclude_numbering boolean not null default false,
  name text not null check (char_length(name) between 1 and 255),
  description text,
  additional_comment text,
  hide_title_pdf boolean not null default false,
  disabled boolean not null default false,
  disabled_comment text,
  read_only_on_mobile_app boolean not null default false,
  linked_flow_id uuid references public.flows(id) on delete restrict,
  validated_at timestamptz,
  validated_by uuid references public.collaborators(id) on delete set null,
  validation_source public.event_source,
  first_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phase_id, position) deferrable initially deferred
);
create index steps_flow_idx on public.steps (flow_id);
create index steps_linked_flow_idx on public.steps (linked_flow_id);
create index steps_validated_by_idx on public.steps (validated_by);

create table public.phase_tags (
  phase_id uuid not null references public.phases(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (phase_id, tag_id)
);
create index phase_tags_tag_idx on public.phase_tags (tag_id);
create table public.step_tags (
  step_id uuid not null references public.steps(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (step_id, tag_id)
);
create index step_tags_tag_idx on public.step_tags (tag_id);

create table public.step_navigations (          -- redirections d'étape
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.steps(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  target_phase_id uuid references public.phases(id) on delete restrict,
  target_step_id uuid references public.steps(id) on delete restrict,
  style public.navigation_style not null default 'default',
  message text,
  position int not null default 0
);
create index step_navigations_step_idx on public.step_navigations (step_id);
create index step_navigations_flow_idx on public.step_navigations (flow_id);
create index step_navigations_tphase_idx on public.step_navigations (target_phase_id);
create index step_navigations_tstep_idx on public.step_navigations (target_step_id);

create table public.step_fill_unlocks (         -- déverrouillage du séquencement (tracé)
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.steps(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  unlocked_by uuid references public.collaborators(id) on delete set null,
  reason text,
  source public.event_source not null default 'webapp',
  occurred_at timestamptz not null default now()
);
create index step_fill_unlocks_step_idx on public.step_fill_unlocks (step_id);
create index step_fill_unlocks_flow_idx on public.step_fill_unlocks (flow_id);
create index step_fill_unlocks_by_idx on public.step_fill_unlocks (unlocked_by);

-- ===== BLOCS ====================================================================
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.steps(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  type public.block_type not null,
  enabled boolean not null default true,          -- coché sur l'étape (désactivation logique)
  state public.block_state not null default 'redaction',
  revision int,
  redactor_id uuid references public.collaborators(id) on delete set null,
  redacted_at timestamptz,
  verifier_id uuid references public.collaborators(id) on delete set null,
  verified_at timestamptz,
  approver_id uuid references public.collaborators(id) on delete set null,
  approved_at timestamptz,
  validator_id uuid references public.collaborators(id) on delete set null,
  validated_at timestamptz,
  ref_int text,
  ref_ext text,
  content_html text,                              -- PR / TXT
  content_json jsonb,
  txt_visibility public.txt_visibility,           -- TXT
  multi_pr_title_hidden boolean not null default false,
  multi_pr_requires_status boolean not null default false,
  multi_pr_requires_signature boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.collaborators(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.collaborators(id) on delete set null,
  unique (step_id, type),
  check (not multi_pr_requires_signature or multi_pr_requires_status)
);
create index blocks_flow_idx on public.blocks (flow_id);
create index blocks_redactor_idx on public.blocks (redactor_id);
create index blocks_verifier_idx on public.blocks (verifier_id);
create index blocks_approver_idx on public.blocks (approver_id);
create index blocks_validator_idx on public.blocks (validator_id);
create index blocks_created_by_idx on public.blocks (created_by);
create index blocks_updated_by_idx on public.blocks (updated_by);

create table public.block_state_events (
  id bigint generated always as identity primary key,
  block_id uuid not null references public.blocks(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  action public.block_validation_action not null,
  from_state public.block_state,
  to_state public.block_state not null,
  actor_id uuid references public.collaborators(id) on delete set null,
  comment text,
  source public.event_source not null default 'webapp',
  occurred_at timestamptz not null default now()
);
create index block_state_events_block_idx on public.block_state_events (block_id, occurred_at desc);
create index block_state_events_flow_idx on public.block_state_events (flow_id);
create index block_state_events_actor_idx on public.block_state_events (actor_id);

-- Documents liés (sous-section PR / TXT / DSI / MULTI_PR). FK documents ajoutée avec le module Documents.
create table public.block_documents (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.blocks(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  document_id uuid,
  pinned_version_id uuid,
  frozen_version_id uuid,
  is_attachment boolean not null default false,
  attachment_path text,
  attachment_name text,
  position int not null default 0,
  check (document_id is not null or attachment_path is not null)
);
create index block_documents_block_idx on public.block_documents (block_id);
create index block_documents_flow_idx on public.block_documents (flow_id);
create index block_documents_document_idx on public.block_documents (document_id);

create table public.block_emm_items (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.blocks(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  library_equipment_id uuid references public.library_equipments(id) on delete set null,
  name text not null,
  family_id uuid references public.label_families(id) on delete set null,
  reference text,
  provider text,
  quantity numeric,
  unit text,
  consumable boolean not null default false,
  comment text,
  display_comment boolean not null default false,
  disabled boolean not null default false,
  position int not null default 0
);
create index block_emm_items_block_idx on public.block_emm_items (block_id);
create index block_emm_items_flow_idx on public.block_emm_items (flow_id);
create index block_emm_items_lib_idx on public.block_emm_items (library_equipment_id);
create index block_emm_items_family_idx on public.block_emm_items (family_id);

create table public.block_adr_items (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.blocks(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  library_risk_id uuid not null references public.library_risks(id) on delete restrict,
  major boolean not null default false,
  disabled boolean not null default false,
  position int not null default 0
);
create index block_adr_items_block_idx on public.block_adr_items (block_id);
create index block_adr_items_flow_idx on public.block_adr_items (flow_id);
create index block_adr_items_risk_idx on public.block_adr_items (library_risk_id);

create table public.block_adr_specific_parades (
  id uuid primary key default gen_random_uuid(),
  block_adr_item_id uuid not null references public.block_adr_items(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  name text not null,
  pictogram smallint check (pictogram between 1 and 240),
  file_path text,
  position int not null default 0
);
create index block_adr_parades_item_idx on public.block_adr_specific_parades (block_adr_item_id);
create index block_adr_parades_flow_idx on public.block_adr_specific_parades (flow_id);

create table public.block_rhp_items (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.blocks(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  function_family_id uuid not null references public.label_families(id),
  count int not null check (count >= 1),
  observation text,
  disabled boolean not null default false,
  position int not null default 0
);
create index block_rhp_items_block_idx on public.block_rhp_items (block_id);
create index block_rhp_items_flow_idx on public.block_rhp_items (flow_id);
create index block_rhp_items_function_idx on public.block_rhp_items (function_family_id);

create table public.block_rhp_item_skills (
  item_id uuid not null references public.block_rhp_items(id) on delete cascade,
  skill_family_id uuid not null references public.label_families(id) on delete cascade,
  primary key (item_id, skill_family_id)
);
create index block_rhp_item_skills_skill_idx on public.block_rhp_item_skills (skill_family_id);

create table public.block_dsi_configs (
  block_id uuid primary key references public.blocks(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  signatories_status public.dsi_signatories_status not null default 'required',
  signatory_disabled_comment text,
  technical_control boolean not null default false,
  technical_control_step boolean not null default false,
  technical_control_details text,
  aip boolean not null default false,
  document_required boolean not null default false,
  observation text,
  document_reference text,
  breakpoint_int_1 boolean not null default false,
  breakpoint_int_2 boolean not null default false,
  breakpoint_int_3 boolean not null default false,
  convocation_int_1 boolean not null default false,
  convocation_int_2 boolean not null default false,
  convocation_int_3 boolean not null default false,
  breakpoint_ext_1 boolean not null default false,
  breakpoint_ext_2 boolean not null default false,
  breakpoint_ext_3 boolean not null default false,
  convocation_ext_1 boolean not null default false,
  convocation_ext_2 boolean not null default false,
  convocation_ext_3 boolean not null default false
);
create index block_dsi_configs_flow_idx on public.block_dsi_configs (flow_id);

-- Signatures du bloc Contrôles : FK RESTRICT ⇒ suppression d'étape/bloc impossible si signé (R2.18).
create table public.signatures (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.blocks(id) on delete restrict,
  step_id uuid not null references public.steps(id) on delete restrict,
  flow_id uuid not null references public.flows(id) on delete cascade,
  nature public.signature_nature not null,
  state public.signature_state not null default 'signed',
  contributor_type public.contributor_type not null,
  signatory_id uuid references public.collaborators(id) on delete set null,
  first_name text, last_name text, email text, company_name text, profession text,
  signature_path text,
  signed_at timestamptz not null default now(),
  comment text,
  sign_with_qr_code boolean not null default false,
  proxied boolean not null default false,
  proxy_principal_name text,
  proxy_date timestamptz,
  source public.event_source not null default 'webapp',
  hash text,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.collaborators(id) on delete set null,
  check (not proxied or (proxy_date is not null and proxy_date <= signed_at and proxy_principal_name is not null)),
  check (contributor_type <> 'intern' or signatory_id is not null or state <> 'signed')
);
create index signatures_block_idx on public.signatures (block_id);
create index signatures_step_idx on public.signatures (step_id);
create index signatures_flow_idx on public.signatures (flow_id);
create index signatures_signatory_idx on public.signatures (signatory_id);
create index signatures_created_by_idx on public.signatures (created_by);
create unique index signatures_one_user_per_step on public.signatures (step_id, signatory_id)
  where signatory_id is not null and not disabled;

create table public.signature_events (
  id bigint generated always as identity primary key,
  block_id uuid not null references public.blocks(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  signature_id uuid,
  action text not null check (action in ('create','update','delete','deactivate_nature')),
  nature public.signature_nature,
  supervisor_name text,
  actor_id uuid references public.collaborators(id) on delete set null,
  source public.event_source not null default 'webapp',
  occurred_at timestamptz not null default now()
);
create index signature_events_block_idx on public.signature_events (block_id, occurred_at desc);
create index signature_events_flow_idx on public.signature_events (flow_id);
create index signature_events_actor_idx on public.signature_events (actor_id);

create table public.block_multi_pr_items (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.blocks(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  position int not null,
  title text,
  title_auto_filled boolean not null default true,
  content_html text,
  content_json jsonb,
  custom_status_id uuid references public.custom_statuses(id) on delete set null,
  observation text check (observation is null or char_length(observation) <= 4000),
  disabled boolean not null default false,
  hide_on_export boolean not null default false,
  updated_by uuid references public.collaborators(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index block_multi_pr_items_block_idx on public.block_multi_pr_items (block_id, position);
create index block_multi_pr_items_flow_idx on public.block_multi_pr_items (flow_id);
create index block_multi_pr_items_status_idx on public.block_multi_pr_items (custom_status_id);
create index block_multi_pr_items_updated_by_idx on public.block_multi_pr_items (updated_by);

create table public.block_multi_pr_signatures (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.block_multi_pr_items(id) on delete restrict,
  flow_id uuid not null references public.flows(id) on delete cascade,
  signatory_id uuid references public.collaborators(id) on delete set null,
  signed_at timestamptz not null default now(),
  signature_path text,
  source public.event_source not null default 'webapp',
  unique (item_id)
);
create index block_multi_pr_signatures_flow_idx on public.block_multi_pr_signatures (flow_id);
create index block_multi_pr_signatures_signatory_idx on public.block_multi_pr_signatures (signatory_id);

create table public.block_multi_pr_events (
  id bigint generated always as identity primary key,
  block_id uuid not null references public.blocks(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  item_id uuid,
  action text not null,
  from_status_id uuid,
  to_status_id uuid,
  comment text,
  actor_id uuid references public.collaborators(id) on delete set null,
  source public.event_source not null default 'webapp',
  occurred_at timestamptz not null default now()
);
create index block_multi_pr_events_block_idx on public.block_multi_pr_events (block_id, occurred_at desc);
create index block_multi_pr_events_flow_idx on public.block_multi_pr_events (flow_id);
create index block_multi_pr_events_actor_idx on public.block_multi_pr_events (actor_id);

create table public.block_object_items (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.blocks(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete cascade,
  technical_object_id uuid not null references public.technical_objects(id) on delete restrict,
  position int not null default 0,
  unique (block_id, technical_object_id)
);
create index block_object_items_flow_idx on public.block_object_items (flow_id);
create index block_object_items_obj_idx on public.block_object_items (technical_object_id);

-- ===== RÉVISIONS / DIAGRAMMES / JOBS ===========================================
create table public.flow_revisions (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.flows(id) on delete cascade,
  reference text not null,
  comment text,
  is_open boolean not null default true,
  enabled boolean not null default true,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid references public.collaborators(id) on delete set null
);
create unique index flow_revisions_one_open on public.flow_revisions (flow_id) where is_open;
create index flow_revisions_flow_idx on public.flow_revisions (flow_id);
create index flow_revisions_created_by_idx on public.flow_revisions (created_by);

create table public.diagrams (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null default 'local' check (kind in ('local','referential')),
  name text not null,
  config jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  read_only boolean not null default false,
  document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index diagrams_project_idx on public.diagrams (project_id);

create table public.diagram_flows (            -- un flow présent dans un diagramme ne peut être supprimé (RN97)
  diagram_id uuid not null references public.diagrams(id) on delete cascade,
  flow_id uuid not null references public.flows(id) on delete restrict,
  primary key (diagram_id, flow_id)
);
create index diagram_flows_flow_idx on public.diagram_flows (flow_id);

create table public.async_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  kind text not null,
  requested_by uuid references public.collaborators(id) on delete set null,
  params jsonb not null default '{}'::jsonb,
  status public.job_status not null default 'to_do',
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index async_jobs_account_idx on public.async_jobs (account_id, created_at desc);
create index async_jobs_project_idx on public.async_jobs (project_id);
create index async_jobs_requested_idx on public.async_jobs (requested_by);

-- ===== TRIGGERS =================================================================
do $$
declare t text;
begin
  foreach t in array array['flows','phases','steps','blocks','diagrams']
  loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function private.set_updated_at()', t);
  end loop;
end $$;

-- Statut par défaut (nature flow) à la création.
create or replace function private.flows_default_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.custom_status_id is null then
    select s.id into new.custom_status_id
    from public.custom_statuses s
    where s.organization_id = new.organization_id
      and (s.account_id is null or s.account_id = new.account_id)
      and s.nature = 'flow' and s.is_default and s.active
    order by s.account_id nulls last
    limit 1;
  end if;
  return new;
end $$;
create trigger flows_default_status before insert on public.flows
  for each row execute function private.flows_default_status();

-- Historique des changements de statut.
create or replace function private.flows_status_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.flow_status_history (flow_id, from_status_id, to_status_id, actor_id)
    values (new.id, null, new.custom_status_id, new.created_by);
    insert into public.flow_events (flow_id, event_type, actor_id) values (new.id, 'create', new.created_by);
  elsif new.custom_status_id is distinct from old.custom_status_id then
    insert into public.flow_status_history (flow_id, from_status_id, to_status_id, actor_id, comment)
    values (new.id, old.custom_status_id, new.custom_status_id, new.updated_by,
            nullif(current_setting('app.status_comment', true), ''));
  end if;
  return new;
end $$;
create trigger flows_status_history after insert or update of custom_status_id on public.flows
  for each row execute function private.flows_status_history();

-- Toute écriture dans le contenu met à jour flows.content_updated_at (RN97).
create or replace function private.touch_flow_content()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_flow uuid;
begin
  v_flow := coalesce(new.flow_id, old.flow_id);
  update public.flows set content_updated_at = now() where id = v_flow;
  return coalesce(new, old);
end $$;
do $$
declare t text;
begin
  foreach t in array array['phases','steps','blocks','block_emm_items','block_adr_items','block_rhp_items',
    'block_multi_pr_items','block_object_items','block_documents','sequences','step_navigations']
  loop
    execute format('create trigger touch_flow_content after insert or update or delete on public.%I
                    for each row execute function private.touch_flow_content()', t);
  end loop;
end $$;

-- ===== FONCTIONS D'AUTORISATION =================================================
create or replace function private.flow_project_id(p_flow_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select f.project_id from public.flows f where f.id = p_flow_id
$$;

create or replace function private.can_read_flow(p_flow_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_read_project(private.flow_project_id(p_flow_id))
$$;

create or replace function private.can_write_flow(p_flow_id uuid, p_min_role public.team_role default 'writer')
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_write_project(private.flow_project_id(p_flow_id), p_min_role)
$$;

-- Signer : opérateur (rôle operator) ou plus, ou admin.
create or replace function private.can_sign_flow(p_flow_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_write_project(private.flow_project_id(p_flow_id), 'operator')
$$;

grant execute on all functions in schema private to authenticated;
revoke execute on all functions in schema private from public, anon;

-- ===== RLS ======================================================================
do $$
declare t text;
begin
  foreach t in array array['flows','flow_assignees','flow_collaborators','flow_collaborator_hierarchies','flow_tags',
    'flow_secondary_categories','flow_content_imports','flow_status_history','flow_events','flow_geometries',
    'sequences','phases','steps','phase_tags','step_tags','step_navigations','step_fill_unlocks','blocks',
    'block_state_events','block_documents','block_emm_items','block_adr_items','block_adr_specific_parades',
    'block_rhp_items','block_rhp_item_skills','block_dsi_configs','signatures','signature_events',
    'block_multi_pr_items','block_multi_pr_signatures','block_multi_pr_events','block_object_items',
    'flow_revisions','diagrams','diagram_flows','async_jobs']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy flows_select on public.flows for select to authenticated
  using ((select private.can_read_project(project_id)));
create policy flows_insert on public.flows for insert to authenticated
  with check ((select private.can_write_project(project_id, 'writer')));
create policy flows_update on public.flows for update to authenticated
  using ((select private.can_write_project(project_id, 'writer')))
  with check ((select private.can_write_project(project_id, 'writer')));
create policy flows_delete on public.flows for delete to authenticated
  using ((select private.can_write_project(project_id, 'responsible')));

-- Tables portant flow_id : lecture = lecture du flow ; écriture = rédacteur+.
do $$
declare t text;
begin
  foreach t in array array['flow_assignees','flow_collaborators','flow_tags','flow_secondary_categories',
    'flow_content_imports','sequences','phases','steps','step_navigations','blocks',
    'block_documents','block_emm_items','block_adr_items','block_adr_specific_parades','block_rhp_items',
    'block_dsi_configs','block_multi_pr_items','block_object_items','flow_revisions']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
                    using ((select private.can_read_flow(flow_id)))', t);
    execute format('create policy %1$s_write on public.%1$I for all to authenticated
                    using ((select private.can_write_flow(flow_id, ''writer'')))
                    with check ((select private.can_write_flow(flow_id, ''writer'')))', t);
  end loop;
end $$;

-- Journaux : lecture + insertion (pas de modification).
do $$
declare t text;
begin
  foreach t in array array['flow_status_history','flow_events','block_state_events','signature_events',
    'block_multi_pr_events','step_fill_unlocks']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
                    using ((select private.can_read_flow(flow_id)))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated
                    with check ((select private.can_sign_flow(flow_id)))', t);
  end loop;
end $$;

-- Signatures : les opérateurs signent aussi.
create policy signatures_select on public.signatures for select to authenticated
  using ((select private.can_read_flow(flow_id)));
create policy signatures_write on public.signatures for all to authenticated
  using ((select private.can_sign_flow(flow_id)))
  with check ((select private.can_sign_flow(flow_id)));
create policy multi_pr_signatures_select on public.block_multi_pr_signatures for select to authenticated
  using ((select private.can_read_flow(flow_id)));
create policy multi_pr_signatures_write on public.block_multi_pr_signatures for all to authenticated
  using ((select private.can_sign_flow(flow_id)))
  with check ((select private.can_sign_flow(flow_id)));

create policy flow_collab_hier_select on public.flow_collaborator_hierarchies for select to authenticated
  using ((select private.can_read_flow(flow_id)));
create policy flow_collab_hier_write on public.flow_collaborator_hierarchies for all to authenticated
  using ((select private.can_write_flow(flow_id, 'writer')))
  with check ((select private.can_write_flow(flow_id, 'writer')));

create policy phase_tags_select on public.phase_tags for select to authenticated
  using (exists (select 1 from public.phases p where p.id = phase_id and (select private.can_read_flow(p.flow_id))));
create policy phase_tags_write on public.phase_tags for all to authenticated
  using (exists (select 1 from public.phases p where p.id = phase_id and (select private.can_write_flow(p.flow_id, 'writer'))))
  with check (exists (select 1 from public.phases p where p.id = phase_id and (select private.can_write_flow(p.flow_id, 'writer'))));
create policy step_tags_select on public.step_tags for select to authenticated
  using (exists (select 1 from public.steps s where s.id = step_id and (select private.can_read_flow(s.flow_id))));
create policy step_tags_write on public.step_tags for all to authenticated
  using (exists (select 1 from public.steps s where s.id = step_id and (select private.can_write_flow(s.flow_id, 'writer'))))
  with check (exists (select 1 from public.steps s where s.id = step_id and (select private.can_write_flow(s.flow_id, 'writer'))));
create policy rhp_skills_select on public.block_rhp_item_skills for select to authenticated
  using (exists (select 1 from public.block_rhp_items i where i.id = item_id and (select private.can_read_flow(i.flow_id))));
create policy rhp_skills_write on public.block_rhp_item_skills for all to authenticated
  using (exists (select 1 from public.block_rhp_items i where i.id = item_id and (select private.can_write_flow(i.flow_id, 'writer'))))
  with check (exists (select 1 from public.block_rhp_items i where i.id = item_id and (select private.can_write_flow(i.flow_id, 'writer'))));

create policy flow_geometries_select on public.flow_geometries for select to authenticated
  using ((select private.can_read_project(project_id)));
create policy flow_geometries_write on public.flow_geometries for all to authenticated
  using ((select private.can_write_project(project_id, 'writer')))
  with check ((select private.can_write_project(project_id, 'writer')));

create policy diagrams_select on public.diagrams for select to authenticated
  using ((select private.can_read_project(project_id)));
create policy diagrams_write on public.diagrams for all to authenticated
  using ((select private.can_write_project(project_id, 'writer')))
  with check ((select private.can_write_project(project_id, 'writer')));
create policy diagram_flows_select on public.diagram_flows for select to authenticated
  using ((select private.can_read_flow(flow_id)));
create policy diagram_flows_write on public.diagram_flows for all to authenticated
  using ((select private.can_write_flow(flow_id, 'writer')))
  with check ((select private.can_write_flow(flow_id, 'writer')));

create policy async_jobs_select on public.async_jobs for select to authenticated
  using (requested_by = (select private.current_collaborator_id())
         or (project_id is not null and (select private.can_read_project(project_id))));
