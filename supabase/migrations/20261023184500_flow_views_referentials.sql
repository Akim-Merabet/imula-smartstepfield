-- =============================================================================
-- Vues flows (plan Gantt, carte, diagramme), séquencement et référentiels.
-- Réf. docs/specs/02-flows-contenu-blocs.md §3.3, §3.4, §3.5, §3.6, §4.5, §8
-- Fonctions publiques SECURITY INVOKER (RLS appliquée).
-- =============================================================================

-- ===== PLANS (Gantt, §3.4) ======================================================
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 255),
  description text,
  scale text not null default 'default' check (scale in ('default','temporal','scheduling')),
  created_by uuid references public.collaborators(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id)
);
create index plans_project_idx on public.plans (project_id);
create index plans_created_by_idx on public.plans (created_by);
create trigger set_updated_at before update on public.plans
  for each row execute function private.set_updated_at();

-- Élément de plan : un flow (échelles défaut / temporel) ou une ressource (ordonnancement).
create table public.plan_elements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  project_id uuid not null,
  flow_id uuid references public.flows(id) on delete cascade,
  collaborator_id uuid references public.collaborators(id) on delete cascade,
  tablet_id uuid references public.tablets(id) on delete cascade,
  start_at timestamptz,
  end_at timestamptz,
  color text,
  created_at timestamptz not null default now(),
  foreign key (plan_id, project_id) references public.plans (id, project_id) on delete cascade,
  unique (plan_id, flow_id),
  check (start_at is null or end_at is null or start_at <= end_at)
);
create index plan_elements_plan_idx on public.plan_elements (plan_id, project_id);
create index plan_elements_flow_idx on public.plan_elements (flow_id);
create index plan_elements_collab_idx on public.plan_elements (collaborator_id);
create index plan_elements_tablet_idx on public.plan_elements (tablet_id);

create table public.plan_element_links (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  project_id uuid not null,
  from_element_id uuid not null references public.plan_elements(id) on delete cascade,
  to_element_id uuid not null references public.plan_elements(id) on delete cascade,
  dependency_type text not null check (dependency_type in ('end_start','start_end')),
  created_at timestamptz not null default now(),
  foreign key (plan_id, project_id) references public.plans (id, project_id) on delete cascade,
  unique (from_element_id, to_element_id),
  check (from_element_id <> to_element_id)
);
create index plan_element_links_plan_idx on public.plan_element_links (plan_id, project_id);
create index plan_element_links_to_idx on public.plan_element_links (to_element_id);

create table public.plan_milestones (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  project_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 255),
  date date not null,
  color text not null default '#e11d48',
  description text,
  created_at timestamptz not null default now(),
  foreign key (plan_id, project_id) references public.plans (id, project_id) on delete cascade
);
create index plan_milestones_plan_idx on public.plan_milestones (plan_id, project_id);

-- ===== COUCHES GEOJSON (carte, §3.3) ============================================
create table public.project_geojson_layers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 255),
  file_name text,
  data jsonb not null,
  color text not null default '#2563eb',
  visible boolean not null default true,
  locked boolean not null default false,
  created_by uuid references public.collaborators(id) on delete set null,
  created_at timestamptz not null default now(),
  check (pg_column_size(data) < 10485760)
);
create index project_geojson_layers_project_idx on public.project_geojson_layers (project_id);
create index project_geojson_layers_by_idx on public.project_geojson_layers (created_by);

-- ===== RLS des nouvelles tables (lecture = lecteur de l'entité, écriture = rédacteur+) ==
do $$
declare t text;
begin
  foreach t in array array['plans','plan_elements','plan_element_links','plan_milestones','project_geojson_layers']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
                    using ((select private.can_read_project(project_id)))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated
                    with check ((select private.can_write_project(project_id, ''writer'')))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated
                    using ((select private.can_write_project(project_id, ''writer'')))
                    with check ((select private.can_write_project(project_id, ''writer'')))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated
                    using ((select private.can_write_project(project_id, ''writer'')))', t);
  end loop;
end $$;

-- ===== Jobs (traçage des traitements référentiels) ==============================
create policy async_jobs_insert on public.async_jobs for insert to authenticated
  with check (requested_by = (select private.current_collaborator_id())
              and account_id in (select private.accessible_account_ids()));
create policy async_jobs_update on public.async_jobs for update to authenticated
  using (requested_by = (select private.current_collaborator_id()))
  with check (requested_by = (select private.current_collaborator_id()));

-- Déverrouillage du séquencement : réservé expert / responsable (R-SEQ-3).
drop policy if exists step_fill_unlocks_insert on public.step_fill_unlocks;
create policy step_fill_unlocks_insert on public.step_fill_unlocks for insert to authenticated
  with check ((select private.can_write_flow(flow_id, 'expert')));

-- ===== Verrouillage des référentiels importés (§2.6, guard_flow_locked) =========
-- Un flow DERIVED_FROM_STANDARD non débloqué n'est modifiable que par la synchronisation.
create or replace function private.guard_locked_flow()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_flow uuid; v_locked boolean;
begin
  if coalesce(current_setting('app.referential_sync', true), '') = 'on' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then v_flow := old.flow_id; else v_flow := new.flow_id; end if;
  if tg_table_name = 'steps' and tg_op = 'UPDATE'
     and (to_jsonb(new) - array['validated_at','validated_by','validation_source','first_opened_at','updated_at'])
       = (to_jsonb(old) - array['validated_at','validated_by','validation_source','first_opened_at','updated_at']) then
    return new;
  end if;
  select f.origin = 'derived_from_standard' and not f.unlocked into v_locked from public.flows f where f.id = v_flow;
  if coalesce(v_locked, false) then
    raise exception 'flow_locked' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['sequences','phases','steps','blocks']
  loop
    execute format('create trigger guard_locked_flow before insert or update or delete on public.%I
                    for each row execute function private.guard_locked_flow()', t);
  end loop;
end $$;

-- ===== SÉQUENCEMENT (§4.5) ======================================================
create or replace function private.default_sequence_type(p_flow_id uuid)
returns public.sequencing_type language sql stable security invoker set search_path = '' as $$
  select coalesce((select a.default_sequence_type::public.sequencing_type
                   from public.flows f join public.accounts a on a.id = f.account_id where f.id = p_flow_id), 'linear')
$$;

-- Rend les séquences contiguës : chaque phase appartient à la séquence courante ou suivante.
create or replace function private.normalize_sequences(p_flow_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare r record; v_cur uuid; v_cur_pos int := 0; i int := 0;
begin
  if not exists (select 1 from public.sequences where flow_id = p_flow_id) then
    if not exists (select 1 from public.phases where flow_id = p_flow_id) then return; end if;
    insert into public.sequences (flow_id, position, type)
    values (p_flow_id, 1, private.default_sequence_type(p_flow_id)) returning id into v_cur;
    update public.phases set sequence_id = v_cur where flow_id = p_flow_id;
    return;
  end if;
  for r in select p.id, p.sequence_id, sq.position as sp
           from public.phases p left join public.sequences sq on sq.id = p.sequence_id
           where p.flow_id = p_flow_id order by p.position loop
    if r.sp is not null and r.sp >= v_cur_pos then
      v_cur := r.sequence_id; v_cur_pos := r.sp;
    else
      if v_cur is null then
        select id, position into v_cur, v_cur_pos from public.sequences where flow_id = p_flow_id order by position limit 1;
      end if;
      if r.sequence_id is distinct from v_cur then
        update public.phases set sequence_id = v_cur where id = r.id;
      end if;
    end if;
  end loop;
  delete from public.sequences sq where sq.flow_id = p_flow_id
    and not exists (select 1 from public.phases p where p.sequence_id = sq.id);
  for r in select id, position from public.sequences where flow_id = p_flow_id order by position loop
    i := i + 1;
    if r.position <> i then update public.sequences set position = i where id = r.id; end if;
  end loop;
end $$;

-- « Créer une nouvelle séquence à partir d'ici » : coupe la séquence de la phase.
create or replace function public.split_sequence(p_phase_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_flow uuid; v_seq uuid; v_ppos int; v_spos int; v_type public.sequencing_type; v_new uuid;
begin
  select flow_id into v_flow from public.phases where id = p_phase_id;
  if v_flow is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.can_write_flow(v_flow, 'writer') then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.normalize_sequences(v_flow);
  select p.sequence_id, p.position, sq.position, sq.type into v_seq, v_ppos, v_spos, v_type
    from public.phases p join public.sequences sq on sq.id = p.sequence_id where p.id = p_phase_id;
  if not exists (select 1 from public.phases where sequence_id = v_seq and position < v_ppos) then
    raise exception 'sequence_first_phase' using errcode = 'P0001';
  end if;
  update public.sequences set position = position + 1 where flow_id = v_flow and position > v_spos;
  insert into public.sequences (flow_id, position, type) values (v_flow, v_spos + 1, v_type) returning id into v_new;
  update public.phases set sequence_id = v_new where sequence_id = v_seq and position >= v_ppos;
  return v_new;
end $$;

-- Fusionne une séquence avec la précédente.
create or replace function public.merge_sequence(p_sequence_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_flow uuid; v_pos int; v_prev uuid;
begin
  select flow_id into v_flow from public.sequences where id = p_sequence_id;
  if v_flow is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.can_write_flow(v_flow, 'writer') then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.normalize_sequences(v_flow);
  select position into v_pos from public.sequences where id = p_sequence_id;
  if v_pos is null then return; end if;
  if v_pos = 1 then raise exception 'sequence_first' using errcode = 'P0001'; end if;
  select id into v_prev from public.sequences where flow_id = v_flow and position = v_pos - 1;
  update public.phases set sequence_id = v_prev where sequence_id = p_sequence_id;
  delete from public.sequences where id = p_sequence_id;
  update public.sequences set position = position - 1 where flow_id = v_flow and position > v_pos;
end $$;

-- Initialise la séquence unique si besoin (avant modification d'un type de séquence).
create or replace function public.ensure_sequences(p_flow_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.can_write_flow(p_flow_id, 'writer') then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.normalize_sequences(p_flow_id);
end $$;

-- R-SEQ-1 : étapes précédentes requises par le séquencement dont les éléments obligatoires manquent.
-- Séquences antérieures : toutes les phases obligatoires ; même séquence linéaire : phases obligatoires
-- précédentes ; même phase linéaire : étapes précédentes. Phases optionnelles non bloquantes (R-SEQ-4),
-- phases / étapes désactivées ignorées. Un déverrouillage tracé lève la restriction (R-SEQ-3).
create or replace function private.step_sequence_blockers(p_step_id uuid)
returns uuid[] language plpgsql stable security invoker set search_path = '' as $$
declare s public.steps; v_default public.sequencing_type; v_out uuid[];
begin
  select * into s from public.steps where id = p_step_id;
  if s.id is null then return '{}'; end if;
  if exists (select 1 from public.step_fill_unlocks u where u.step_id = p_step_id) then return '{}'; end if;
  v_default := private.default_sequence_type(s.flow_id);
  with ph as (
    select p.id, p.position, p.mandatory, p.disabled, p.sequence_type,
           coalesce(max(sq.position) over (order by p.position rows between unbounded preceding and current row), 0) as eff
    from public.phases p left join public.sequences sq on sq.id = p.sequence_id
    where p.flow_id = s.flow_id
  ), cur as (
    select ph.*, coalesce((select q.type from public.sequences q where q.flow_id = s.flow_id and q.position = ph.eff), v_default) as seq_type
    from ph where ph.id = s.phase_id
  )
  select array_agg(st.id order by ph.position, st.position) into v_out
  from public.steps st join ph on ph.id = st.phase_id cross join cur
  where st.id <> s.id and not st.disabled and not ph.disabled
    and (
      (ph.eff < cur.eff and ph.mandatory)
      or (ph.eff = cur.eff and ph.id <> cur.id and cur.seq_type = 'linear' and ph.position < cur.position and ph.mandatory)
      or (ph.id = cur.id and cur.sequence_type = 'linear' and st.position < s.position)
    )
    and coalesce(array_length(private.step_missing_mandatory(st.id), 1), 0) > 0;
  return coalesce(v_out, '{}');
end $$;

create or replace function public.step_sequence_blockers(p_step_id uuid)
returns uuid[] language sql stable security invoker set search_path = '' as $$
  select private.step_sequence_blockers(p_step_id)
$$;

-- Valider / dévalider une étape (§4.6) + règle de séquencement R-SEQ-1.
create or replace function private.set_step_validation(p_step_id uuid, p_validate boolean)
returns text[] language plpgsql security definer set search_path = '' as $$
declare s public.steps; v_missing text[]; v_me uuid := private.current_collaborator_id();
begin
  select * into s from public.steps where id = p_step_id;
  if s.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.can_write_flow(s.flow_id, case when p_validate then 'operator'::public.team_role else 'writer'::public.team_role end) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_validate then
    if s.disabled then raise exception 'step_disabled' using errcode = 'P0001'; end if;
    if coalesce(array_length(private.step_sequence_blockers(p_step_id), 1), 0) > 0 then
      return array['sequence'];
    end if;
    v_missing := private.step_missing_mandatory(p_step_id);
    if array_length(v_missing, 1) > 0 then return v_missing; end if;
    update public.steps set validated_at = now(), validated_by = v_me, validation_source = 'webapp' where id = p_step_id;
    insert into public.flow_events (flow_id, event_type, actor_id, phase_id, step_id)
    values (s.flow_id, 'validate_step', v_me, s.phase_id, s.id);
  else
    update public.steps set validated_at = null, validated_by = null, validation_source = null where id = p_step_id;
    insert into public.flow_events (flow_id, event_type, actor_id, phase_id, step_id)
    values (s.flow_id, 'devalidate_step', v_me, s.phase_id, s.id);
  end if;
  return '{}';
end $$;

-- Déverrouiller une étape bloquée par le séquencement (tracé, expert / responsable).
create or replace function public.unlock_step_fill(p_step_id uuid, p_reason text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare s public.steps; v_me uuid := private.current_collaborator_id();
begin
  select * into s from public.steps where id = p_step_id;
  if s.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.can_write_flow(s.flow_id, 'expert') then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.step_fill_unlocks (step_id, flow_id, unlocked_by, reason, source)
  values (s.id, s.flow_id, v_me, nullif(btrim(p_reason), ''), 'webapp');
  insert into public.flow_events (flow_id, event_type, actor_id, phase_id, step_id, comment)
  values (s.flow_id, 'skip_fill_restriction', v_me, s.phase_id, s.id, nullif(btrim(p_reason), ''));
end $$;

-- ===== RÉFÉRENTIELS (§3.6, §2.6) ================================================
-- Copie profonde du contenu d'un flow vers un autre (séquences, phases, étapes, blocs, redirections),
-- en excluant certains types de blocs (R-TYPE-5 : ni DSI ni FORM depuis un référentiel).
create or replace function private.copy_flow_content(p_src uuid, p_dst uuid, p_same_project boolean,
  p_skip public.block_type[], p_keep_state boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_me uuid := private.current_collaborator_id();
  v_seq record; v_seq_map jsonb := '{}'; v_new_seq uuid; v_phase record; v_new_phase uuid;
  v_step record; v_new_step uuid; v_block record; v_new_block uuid; v_map jsonb := '{}'; v_nav record;
begin
  for v_seq in select * from public.sequences where flow_id = p_src order by position loop
    insert into public.sequences (flow_id, position, type) values (p_dst, v_seq.position, v_seq.type) returning id into v_new_seq;
    v_seq_map := v_seq_map || jsonb_build_object(v_seq.id::text, v_new_seq);
  end loop;

  for v_phase in select * from public.phases where flow_id = p_src order by position loop
    insert into public.phases (flow_id, sequence_id, position, custom_number, exclude_numbering, name, description, additional_comment,
      hide_title_pdf, disabled, disabled_comment, read_only_on_mobile_app, sequence_type, mandatory)
    values (p_dst, case when v_phase.sequence_id is not null then (v_seq_map ->> v_phase.sequence_id::text)::uuid end,
      v_phase.position, v_phase.custom_number, v_phase.exclude_numbering, v_phase.name, v_phase.description, v_phase.additional_comment,
      v_phase.hide_title_pdf, v_phase.disabled, v_phase.disabled_comment, v_phase.read_only_on_mobile_app, v_phase.sequence_type, v_phase.mandatory)
    returning id into v_new_phase;
    v_map := v_map || jsonb_build_object(v_phase.id::text, v_new_phase);
    insert into public.phase_tags (phase_id, tag_id) select v_new_phase, t.tag_id from public.phase_tags t where t.phase_id = v_phase.id;
    insert into public.custom_field_values (custom_field_id, object_id, account_id, business_class, value_text, value_json, updated_by)
    select v.custom_field_id, v_new_phase, v.account_id, v.business_class, v.value_text, v.value_json, v_me
    from public.custom_field_values v where v.object_id = v_phase.id;

    for v_step in select * from public.steps where phase_id = v_phase.id order by position loop
      insert into public.steps (phase_id, flow_id, position, custom_number, exclude_numbering, name, description, additional_comment,
        hide_title_pdf, disabled, disabled_comment, read_only_on_mobile_app, linked_flow_id)
      values (v_new_phase, p_dst, v_step.position, v_step.custom_number, v_step.exclude_numbering, v_step.name, v_step.description,
        v_step.additional_comment, v_step.hide_title_pdf, v_step.disabled, v_step.disabled_comment, v_step.read_only_on_mobile_app,
        case when p_same_project then v_step.linked_flow_id end)
      returning id into v_new_step;
      v_map := v_map || jsonb_build_object(v_step.id::text, v_new_step);
      insert into public.step_tags (step_id, tag_id) select v_new_step, t.tag_id from public.step_tags t where t.step_id = v_step.id;
      insert into public.custom_field_values (custom_field_id, object_id, account_id, business_class, value_text, value_json, updated_by)
      select v.custom_field_id, v_new_step, v.account_id, v.business_class, v.value_text, v.value_json, v_me
      from public.custom_field_values v where v.object_id = v_step.id;

      for v_block in select * from public.blocks where step_id = v_step.id and not (type = any (coalesce(p_skip, '{}'))) loop
        v_new_block := private.copy_block(v_block.id, v_new_step, p_dst, p_same_project);
        if p_keep_state and v_block.state <> 'redaction' then
          update public.blocks set state = v_block.state,
            redactor_id = v_block.redactor_id, redacted_at = v_block.redacted_at,
            verifier_id = v_block.verifier_id, verified_at = v_block.verified_at,
            approver_id = v_block.approver_id, approved_at = v_block.approved_at,
            validator_id = v_block.validator_id, validated_at = v_block.validated_at
          where id = v_new_block;
        end if;
      end loop;
    end loop;
  end loop;

  for v_nav in select * from public.step_navigations where flow_id = p_src order by position loop
    if v_map ? v_nav.step_id::text then
      insert into public.step_navigations (step_id, flow_id, target_phase_id, target_step_id, style, message, position)
      values ((v_map ->> v_nav.step_id::text)::uuid, p_dst,
        case when v_nav.target_phase_id is not null then (v_map ->> v_nav.target_phase_id::text)::uuid end,
        case when v_nav.target_step_id is not null then (v_map ->> v_nav.target_step_id::text)::uuid end,
        v_nav.style, v_nav.message, v_nav.position);
    end if;
  end loop;
end $$;

-- Supprime le contenu d'un flow (comme reset_flow, sans contrôle de rôle ni événement).
create or replace function private.clear_flow_content(p_flow_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.step_navigations where flow_id = p_flow_id;
  delete from public.form_block_links where flow_id = p_flow_id;
  update public.steps set linked_flow_id = null where flow_id = p_flow_id and linked_flow_id is not null;
  delete from public.phases where flow_id = p_flow_id;
  delete from public.sequences where flow_id = p_flow_id;
end $$;

-- Met à jour un référentiel importé depuis sa source (contenu écrasé).
create or replace function private.refresh_referential(p_flow_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_flow public.flows; v_src public.flows; v_index text; v_me uuid := private.current_collaborator_id();
begin
  select * into v_flow from public.flows where id = p_flow_id and deleted_at is null;
  if v_flow.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if v_flow.origin <> 'derived_from_standard' or v_flow.unlocked then raise exception 'not_refreshable' using errcode = 'P0001'; end if;
  select * into v_src from public.flows where id = v_flow.sourced_from_flow_id and deleted_at is null;
  if v_src.id is null then raise exception 'source_missing' using errcode = 'P0001'; end if;
  if private.flow_signature_count(p_flow_id) > 0
     or exists (select 1 from public.form_responses r where r.flow_id = p_flow_id and r.deleted_at is null) then
    raise exception 'has_signatures_or_responses' using errcode = 'P0001';
  end if;
  select project_index into v_index from public.projects where id = v_src.project_id;
  perform set_config('app.referential_sync', 'on', true);
  perform private.clear_flow_content(p_flow_id);
  perform private.copy_flow_content(v_src.id, p_flow_id, false, array['dsi','form']::public.block_type[], false);
  perform set_config('app.referential_sync', '', true);
  update public.flows set name = v_src.name, description = v_src.description, family_id = v_src.family_id,
    ref_ext = v_src.ref_ext, sourced_from_index = v_index, updated_by = v_me
  where id = p_flow_id;
  insert into public.flow_content_imports (flow_id, source_flow_id, kind, imported_by) values (p_flow_id, v_src.id, 'referential', v_me);
  insert into public.flow_events (flow_id, event_type, actor_id, payload)
  values (p_flow_id, 'import_content_referential', v_me, jsonb_build_object('source_flow_id', v_src.id, 'refresh', true));
end $$;

-- Importer depuis un référentiel (≤ 10 flows « en préparation ») — traité de façon synchrone, tracé par un job.
create or replace function public.import_referential_flows(p_project_id uuid, p_flow_ids uuid[], p_update_existing boolean default false)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_me uuid := private.current_collaborator_id(); v_job uuid; v_project public.projects; v_src record; v_new uuid;
  v_existing uuid; v_created uuid[] := '{}'; v_updated uuid[] := '{}'; v_conflicts uuid[] := '{}';
begin
  select * into v_project from public.projects where id = p_project_id and deleted_at is null;
  if v_project.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.can_write_project(p_project_id, 'writer') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_project.type not in ('project','pgac') then raise exception 'invalid_target' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_flow_ids, 1), 0) = 0 then raise exception 'no_selection' using errcode = 'P0001'; end if;
  if array_length(p_flow_ids, 1) > 10 then raise exception 'size_limit' using errcode = 'P0001'; end if;

  insert into public.async_jobs (account_id, project_id, kind, requested_by, params, status)
  values (v_project.account_id, p_project_id, 'import_referential', v_me,
          jsonb_build_object('flow_ids', to_jsonb(p_flow_ids), 'update_existing', p_update_existing), 'in_progress')
  returning id into v_job;

  begin
    for v_src in
      select f.*, sp.project_index as src_index
      from public.flows f
      join public.projects sp on sp.id = f.project_id
      join public.custom_statuses cs on cs.id = f.custom_status_id
      where f.id = any (p_flow_ids) and f.deleted_at is null and sp.type = 'referential' and sp.deleted_at is null
        and cs.category = 'in_preparation'
        and f.flow_type in ('referential','referential_generic','group_referential','referential_intervention')
    loop
      select id into v_existing from public.flows
       where project_id = p_project_id and sourced_from_flow_id = v_src.id and deleted_at is null limit 1;
      if v_existing is not null then
        if p_update_existing then
          perform private.refresh_referential(v_existing);
          v_updated := v_updated || v_existing;
        else
          v_conflicts := v_conflicts || v_src.id;
        end if;
        continue;
      end if;

      insert into public.flows (organization_id, account_id, project_id, flow_type, name, description, ref_int, ref_ext,
        family_id, location_activated, location_site, location_area, location_local, elementary_system, functional_marker,
        technical_object_id, technical_object_label, bar_color,
        supervision_intern_1, supervision_intern_2, supervision_intern_3, supervision_extern_1, supervision_extern_2, supervision_extern_3,
        internal_supervisor_name_1, internal_supervisor_name_2, internal_supervisor_name_3,
        external_supervisor_name_1, external_supervisor_name_2, external_supervisor_name_3,
        simplified_signature_mode, origin, sourced_from_flow_id, sourced_from_index, created_by, updated_by)
      values (v_project.organization_id, v_project.account_id, p_project_id, v_src.flow_type, v_src.name, v_src.description,
        v_src.ref_int, v_src.ref_ext, v_src.family_id, v_src.location_activated, v_src.location_site, v_src.location_area,
        v_src.location_local, v_src.elementary_system, v_src.functional_marker, v_src.technical_object_id, v_src.technical_object_label,
        v_src.bar_color, v_src.supervision_intern_1, v_src.supervision_intern_2, v_src.supervision_intern_3,
        v_src.supervision_extern_1, v_src.supervision_extern_2, v_src.supervision_extern_3,
        v_src.internal_supervisor_name_1, v_src.internal_supervisor_name_2, v_src.internal_supervisor_name_3,
        v_src.external_supervisor_name_1, v_src.external_supervisor_name_2, v_src.external_supervisor_name_3,
        v_src.simplified_signature_mode, 'derived_from_standard', v_src.id, v_src.src_index, v_me, v_me)
      returning id into v_new;

      insert into public.flow_tags (flow_id, tag_id) select v_new, tag_id from public.flow_tags where flow_id = v_src.id;
      insert into public.custom_field_values (custom_field_id, object_id, account_id, business_class, value_text, value_json, updated_by)
      select v.custom_field_id, v_new, v.account_id, v.business_class, v.value_text, v.value_json, v_me
      from public.custom_field_values v where v.object_id = v_src.id and v.account_id = v_project.account_id;

      perform set_config('app.referential_sync', 'on', true);
      perform private.copy_flow_content(v_src.id, v_new, false, array['dsi','form']::public.block_type[], false);
      perform set_config('app.referential_sync', '', true);

      insert into public.flow_content_imports (flow_id, source_flow_id, kind, imported_by) values (v_new, v_src.id, 'referential', v_me);
      insert into public.flow_events (flow_id, event_type, actor_id, payload)
      values (v_new, 'import_content_referential', v_me, jsonb_build_object('source_flow_id', v_src.id));
      v_created := v_created || v_new;
    end loop;

    update public.async_jobs set status = 'done', finished_at = now(),
      result = jsonb_build_object('created', to_jsonb(v_created), 'updated', to_jsonb(v_updated), 'conflicts', to_jsonb(v_conflicts))
    where id = v_job;
  exception when others then
    update public.async_jobs set status = 'failed', finished_at = now(), error = sqlerrm where id = v_job;
  end;
  return v_job;
end $$;

-- Mettre à jour un référentiel importé (job tracé).
create or replace function public.refresh_referential_flow(p_flow_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_job uuid; v_flow public.flows; v_me uuid := private.current_collaborator_id();
begin
  select * into v_flow from public.flows where id = p_flow_id and deleted_at is null;
  if v_flow.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.can_write_flow(p_flow_id, 'writer') then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.async_jobs (account_id, project_id, kind, requested_by, params, status)
  values (v_flow.account_id, v_flow.project_id, 'refresh_referential', v_me, jsonb_build_object('flow_id', p_flow_id), 'in_progress')
  returning id into v_job;
  begin
    perform private.refresh_referential(p_flow_id);
    update public.async_jobs set status = 'done', finished_at = now(), result = jsonb_build_object('updated', jsonb_build_array(p_flow_id))
    where id = v_job;
  exception when others then
    update public.async_jobs set status = 'failed', finished_at = now(), error = sqlerrm where id = v_job;
  end;
  return v_job;
end $$;

-- Débloquer un référentiel importé : plus aucune mise à jour possible, contenu éditable.
create or replace function public.unlock_referential_flow(p_flow_id uuid, p_reset_internal boolean default false)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_me uuid := private.current_collaborator_id();
begin
  if not private.can_write_flow(p_flow_id, 'expert') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.flows set unlocked = true, updated_by = v_me
   where id = p_flow_id and origin = 'derived_from_standard' and not unlocked and deleted_at is null;
  if not found then raise exception 'not_lockable' using errcode = 'P0001'; end if;
  if p_reset_internal then
    insert into public.block_state_events (block_id, flow_id, action, from_state, to_state, actor_id, comment)
    select b.id, b.flow_id, 'reset', b.state, 'redaction', v_me, null
    from public.blocks b where b.flow_id = p_flow_id and b.state <> 'redaction';
    update public.blocks set state = 'redaction', redactor_id = null, redacted_at = null, verifier_id = null, verified_at = null,
      approver_id = null, approved_at = null, validator_id = null, validated_at = null, updated_by = v_me
    where flow_id = p_flow_id and state <> 'redaction';
  end if;
end $$;

-- Exécuter un référentiel : n copies utilisables (Spécifique, Générique, Chapeau ou Intervention).
create or replace function public.execute_referential_flow(p_flow_id uuid, p_copies int default 1, p_reset_internal boolean default true)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_src public.flows; v_job uuid; v_new uuid; v_created uuid[] := '{}'; i int; v_me uuid := private.current_collaborator_id();
  v_type public.flow_type;
begin
  select * into v_src from public.flows where id = p_flow_id and deleted_at is null;
  if v_src.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.can_write_flow(p_flow_id, 'writer') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_type := case v_src.flow_type
    when 'referential' then 'specific' when 'local_referential' then 'specific'
    when 'referential_generic' then 'generic' when 'group_referential' then 'group'
    when 'referential_intervention' then 'flow_form' end;
  if v_type is null then raise exception 'not_referential' using errcode = 'P0001'; end if;
  if p_copies is null or p_copies < 1 or p_copies > 50 then raise exception 'invalid_copies' using errcode = 'P0001'; end if;

  insert into public.async_jobs (account_id, project_id, kind, requested_by, params, status)
  values (v_src.account_id, v_src.project_id, 'execute_referential', v_me,
          jsonb_build_object('flow_id', p_flow_id, 'copies', p_copies, 'reset_internal', p_reset_internal), 'in_progress')
  returning id into v_job;
  begin
    for i in 1 .. p_copies loop
      insert into public.flows (organization_id, account_id, project_id, flow_type, name, description, ref_ext,
        family_id, category_id, location_activated, location_site, location_area, location_local, elementary_system, functional_marker,
        technical_object_id, technical_object_label, reporter_id, tablet_1_id, tablet_2_id, tablet_3_id,
        start_date, finish_date, estimated_start_date, estimated_end_date, bar_color,
        supervision_intern_1, supervision_intern_2, supervision_intern_3, supervision_extern_1, supervision_extern_2, supervision_extern_3,
        internal_supervisor_name_1, internal_supervisor_name_2, internal_supervisor_name_3,
        external_supervisor_name_1, external_supervisor_name_2, external_supervisor_name_3,
        simplified_signature_mode, origin, executed_from_flow_id, created_by, updated_by)
      values (v_src.organization_id, v_src.account_id, v_src.project_id, v_type, v_src.name, v_src.description, v_src.ref_ext,
        v_src.family_id, v_src.category_id, v_src.location_activated, v_src.location_site, v_src.location_area, v_src.location_local,
        v_src.elementary_system, v_src.functional_marker, v_src.technical_object_id, v_src.technical_object_label,
        v_src.reporter_id, v_src.tablet_1_id, v_src.tablet_2_id, v_src.tablet_3_id,
        v_src.start_date, v_src.finish_date, v_src.estimated_start_date, v_src.estimated_end_date, v_src.bar_color,
        v_src.supervision_intern_1, v_src.supervision_intern_2, v_src.supervision_intern_3,
        v_src.supervision_extern_1, v_src.supervision_extern_2, v_src.supervision_extern_3,
        v_src.internal_supervisor_name_1, v_src.internal_supervisor_name_2, v_src.internal_supervisor_name_3,
        v_src.external_supervisor_name_1, v_src.external_supervisor_name_2, v_src.external_supervisor_name_3,
        v_src.simplified_signature_mode, 'local', v_src.id, v_me, v_me)
      returning id into v_new;
      insert into public.flow_tags (flow_id, tag_id) select v_new, tag_id from public.flow_tags where flow_id = p_flow_id;
      insert into public.flow_assignees (flow_id, collaborator_id) select v_new, collaborator_id from public.flow_assignees where flow_id = p_flow_id;
      insert into public.custom_field_values (custom_field_id, object_id, account_id, business_class, value_text, value_json, updated_by)
      select v.custom_field_id, v_new, v.account_id, v.business_class, v.value_text, v.value_json, v_me
      from public.custom_field_values v where v.object_id = p_flow_id;
      perform private.copy_flow_content(p_flow_id, v_new, true, '{}'::public.block_type[], not p_reset_internal);
      insert into public.flow_content_imports (flow_id, source_flow_id, kind, imported_by) values (v_new, p_flow_id, 'referential', v_me);
      insert into public.flow_events (flow_id, event_type, actor_id, payload)
      values (v_new, 'import_content_referential', v_me, jsonb_build_object('executed_from_flow_id', p_flow_id));
      v_created := v_created || v_new;
    end loop;
    update public.async_jobs set status = 'done', finished_at = now(), result = jsonb_build_object('created', to_jsonb(v_created))
    where id = v_job;
  exception when others then
    update public.async_jobs set status = 'failed', finished_at = now(), error = sqlerrm where id = v_job;
  end;
  return v_job;
end $$;

-- ===== Droits d'exécution =========================================================
revoke execute on function private.guard_locked_flow(), private.default_sequence_type(uuid), private.normalize_sequences(uuid),
  private.step_sequence_blockers(uuid), private.copy_flow_content(uuid, uuid, boolean, public.block_type[], boolean),
  private.clear_flow_content(uuid), private.refresh_referential(uuid)
  from public, anon;
grant execute on function private.default_sequence_type(uuid), private.normalize_sequences(uuid),
  private.step_sequence_blockers(uuid), private.copy_flow_content(uuid, uuid, boolean, public.block_type[], boolean),
  private.clear_flow_content(uuid), private.refresh_referential(uuid)
  to authenticated;

revoke execute on function public.split_sequence(uuid), public.merge_sequence(uuid), public.ensure_sequences(uuid),
  public.step_sequence_blockers(uuid), public.unlock_step_fill(uuid, text),
  public.import_referential_flows(uuid, uuid[], boolean), public.refresh_referential_flow(uuid),
  public.unlock_referential_flow(uuid, boolean), public.execute_referential_flow(uuid, int, boolean)
  from public, anon;
grant execute on function public.split_sequence(uuid), public.merge_sequence(uuid), public.ensure_sequences(uuid),
  public.step_sequence_blockers(uuid), public.unlock_step_fill(uuid, text),
  public.import_referential_flows(uuid, uuid[], boolean), public.refresh_referential_flow(uuid),
  public.unlock_referential_flow(uuid, boolean), public.execute_referential_flow(uuid, int, boolean)
  to authenticated;
