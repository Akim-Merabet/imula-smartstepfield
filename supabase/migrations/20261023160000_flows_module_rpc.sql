-- =============================================================================
-- Module Flows : fonctions RPC (statut avec commentaire, réordonnancement,
-- duplication profonde, réinitialisation, validation d'étape).
-- Réf. docs/specs/02-flows-contenu-blocs.md §2.4, §2.7, §4.2-4.7, §6.3
-- Les fonctions publiques sont SECURITY INVOKER (RLS appliquée) ; seules les
-- opérations ouvertes aux opérateurs passent par une fonction private SECURITY DEFINER.
-- =============================================================================

-- ===== Présence de signatures (DSI ou instructions multiples) =================
create or replace function private.flow_signature_count(p_flow_id uuid, p_phase_id uuid default null, p_step_id uuid default null)
returns int language sql stable security invoker set search_path = '' as $$
  select (
    select count(*) from public.signatures s
    join public.steps st on st.id = s.step_id
    where s.flow_id = p_flow_id and not s.disabled
      and (p_phase_id is null or st.phase_id = p_phase_id)
      and (p_step_id is null or s.step_id = p_step_id)
  )::int + (
    select count(*) from public.block_multi_pr_signatures ms
    join public.block_multi_pr_items i on i.id = ms.item_id
    join public.blocks b on b.id = i.block_id
    join public.steps st on st.id = b.step_id
    where ms.flow_id = p_flow_id
      and (p_phase_id is null or st.phase_id = p_phase_id)
      and (p_step_id is null or b.step_id = p_step_id)
  )::int
$$;

-- ===== Changement de statut avec commentaire (R-STAT-3/4) =====================
-- Ouvert aux opérateurs (droit editStatus) : contourne la RLS d'écriture des flows
-- (rédacteur+) uniquement pour la colonne de statut, après contrôle du rôle.
create or replace function private.set_flow_status(p_flow_id uuid, p_status_id uuid, p_comment text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_write_flow(p_flow_id, 'operator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.custom_statuses s
                 where s.id = p_status_id and s.nature = 'flow' and s.active
                   and s.organization_id = private.current_org_id()) then
    raise exception 'invalid status' using errcode = '23514';
  end if;
  perform set_config('app.status_comment', coalesce(p_comment, ''), true);
  update public.flows
     set custom_status_id = p_status_id, updated_by = private.current_collaborator_id()
   where id = p_flow_id;
  perform set_config('app.status_comment', '', true);
end $$;

create or replace function public.set_flow_status(p_flow_id uuid, p_status_id uuid, p_comment text default null)
returns void language sql security invoker set search_path = '' as $$
  select private.set_flow_status(p_flow_id, p_status_id, p_comment)
$$;

-- ===== Réordonnancement ======================================================
create or replace function public.reorder_phases(p_flow_id uuid, p_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare i int;
begin
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    update public.phases set position = i where id = p_ids[i] and flow_id = p_flow_id;
  end loop;
end $$;

-- Déplace une étape dans une phase (même flow) à l'index donné (1-based), renumérote source et cible.
create or replace function public.move_step(p_step_id uuid, p_target_phase_id uuid, p_index int)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_src uuid; v_flow uuid; v_ids uuid[]; i int;
begin
  select phase_id, flow_id into v_src, v_flow from public.steps where id = p_step_id;
  if v_src is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.phases where id = p_target_phase_id and flow_id = v_flow) then
    raise exception 'invalid target' using errcode = '23514';
  end if;
  update public.steps set phase_id = p_target_phase_id, position = -1 where id = p_step_id;
  select array_agg(id order by position) into v_ids
    from public.steps where phase_id = p_target_phase_id and id <> p_step_id;
  v_ids := coalesce(v_ids, '{}');
  p_index := greatest(1, least(coalesce(p_index, array_length(v_ids, 1) + 1), coalesce(array_length(v_ids, 1), 0) + 1));
  v_ids := v_ids[1:p_index - 1] || p_step_id || v_ids[p_index:];
  for i in 1 .. array_length(v_ids, 1) loop
    update public.steps set position = i where id = v_ids[i];
  end loop;
  if v_src <> p_target_phase_id then
    select array_agg(id order by position) into v_ids from public.steps where phase_id = v_src;
    for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
      update public.steps set position = i where id = v_ids[i];
    end loop;
  end if;
end $$;

-- ===== Copie profonde ========================================================
-- Copie d'un bloc et de ses éléments, sans signatures ni réponses ; bloc remis en rédaction.
create or replace function private.copy_block(p_src uuid, p_dst_step uuid, p_dst_flow uuid, p_same_project boolean)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_new uuid; v_item record; v_new_item uuid; v_me uuid := private.current_collaborator_id();
begin
  insert into public.blocks (step_id, flow_id, type, enabled, state, ref_int, ref_ext, content_html, content_json,
    txt_visibility, multi_pr_title_hidden, multi_pr_requires_status, multi_pr_requires_signature, created_by, updated_by)
  select p_dst_step, p_dst_flow, b.type, b.enabled, 'redaction', b.ref_int, b.ref_ext, b.content_html, b.content_json,
    b.txt_visibility, b.multi_pr_title_hidden, b.multi_pr_requires_status, b.multi_pr_requires_signature, v_me, v_me
  from public.blocks b where b.id = p_src
  returning id into v_new;

  insert into public.block_state_events (block_id, flow_id, action, from_state, to_state, actor_id)
  values (v_new, p_dst_flow, 'create', null, 'redaction', v_me);

  insert into public.block_dsi_configs (block_id, flow_id, signatories_status, signatory_disabled_comment, technical_control,
    technical_control_step, technical_control_details, aip, document_required, observation, document_reference,
    breakpoint_int_1, breakpoint_int_2, breakpoint_int_3, convocation_int_1, convocation_int_2, convocation_int_3,
    breakpoint_ext_1, breakpoint_ext_2, breakpoint_ext_3, convocation_ext_1, convocation_ext_2, convocation_ext_3)
  select v_new, p_dst_flow, c.signatories_status, c.signatory_disabled_comment, c.technical_control,
    c.technical_control_step, c.technical_control_details, c.aip, c.document_required, c.observation, c.document_reference,
    c.breakpoint_int_1, c.breakpoint_int_2, c.breakpoint_int_3, c.convocation_int_1, c.convocation_int_2, c.convocation_int_3,
    c.breakpoint_ext_1, c.breakpoint_ext_2, c.breakpoint_ext_3, c.convocation_ext_1, c.convocation_ext_2, c.convocation_ext_3
  from public.block_dsi_configs c where c.block_id = p_src;

  insert into public.block_documents (block_id, flow_id, document_id, pinned_version_id, is_attachment, attachment_path, attachment_name, position)
  select v_new, p_dst_flow, d.document_id, d.pinned_version_id, d.is_attachment, d.attachment_path, d.attachment_name, d.position
  from public.block_documents d where d.block_id = p_src;

  insert into public.block_emm_items (block_id, flow_id, library_equipment_id, name, family_id, reference, provider,
    quantity, unit, consumable, comment, display_comment, disabled, position)
  select v_new, p_dst_flow, e.library_equipment_id, e.name, e.family_id, e.reference, e.provider,
    e.quantity, e.unit, e.consumable, e.comment, e.display_comment, e.disabled, e.position
  from public.block_emm_items e where e.block_id = p_src;

  for v_item in select * from public.block_adr_items where block_id = p_src order by position loop
    insert into public.block_adr_items (block_id, flow_id, library_risk_id, major, disabled, position)
    values (v_new, p_dst_flow, v_item.library_risk_id, v_item.major, v_item.disabled, v_item.position)
    returning id into v_new_item;
    insert into public.block_adr_specific_parades (block_adr_item_id, flow_id, name, pictogram, file_path, position)
    select v_new_item, p_dst_flow, p.name, p.pictogram, p.file_path, p.position
    from public.block_adr_specific_parades p where p.block_adr_item_id = v_item.id;
  end loop;

  for v_item in select * from public.block_rhp_items where block_id = p_src order by position loop
    insert into public.block_rhp_items (block_id, flow_id, function_family_id, count, observation, disabled, position)
    values (v_new, p_dst_flow, v_item.function_family_id, v_item.count, v_item.observation, v_item.disabled, v_item.position)
    returning id into v_new_item;
    insert into public.block_rhp_item_skills (item_id, skill_family_id)
    select v_new_item, s.skill_family_id from public.block_rhp_item_skills s where s.item_id = v_item.id;
  end loop;

  -- Instructions multiples : statut, observation et signature sont des données terrain (non reprises).
  insert into public.block_multi_pr_items (block_id, flow_id, position, title, title_auto_filled, content_html, content_json,
    disabled, hide_on_export, updated_by)
  select v_new, p_dst_flow, m.position, m.title, m.title_auto_filled, m.content_html, m.content_json,
    m.disabled, m.hide_on_export, v_me
  from public.block_multi_pr_items m where m.block_id = p_src;

  insert into public.block_object_items (block_id, flow_id, technical_object_id, position)
  select v_new, p_dst_flow, o.technical_object_id, o.position from public.block_object_items o where o.block_id = p_src;

  if p_same_project then
    insert into public.form_block_links (block_id, step_id, flow_id, form_id, pinned_version_id, position, enabled, mandatory,
      unique_response, unique_mode, initial_rubric_lineage_id, fillable_rubric_lineage_ids, technical_object_id, additional_comment)
    select v_new, p_dst_step, p_dst_flow, l.form_id, l.pinned_version_id, l.position, l.enabled, l.mandatory,
      l.unique_response, l.unique_mode, l.initial_rubric_lineage_id, l.fillable_rubric_lineage_ids, l.technical_object_id, l.additional_comment
    from public.form_block_links l where l.block_id = p_src;
  end if;
  return v_new;
end $$;

create or replace function private.copy_step(p_src uuid, p_dst_phase uuid, p_dst_flow uuid, p_position int, p_same_project boolean)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_new uuid; v_block uuid;
begin
  insert into public.steps (phase_id, flow_id, position, custom_number, exclude_numbering, name, description, additional_comment,
    hide_title_pdf, disabled, disabled_comment, read_only_on_mobile_app, linked_flow_id)
  select p_dst_phase, p_dst_flow, p_position, s.custom_number, s.exclude_numbering, s.name, s.description, s.additional_comment,
    s.hide_title_pdf, s.disabled, s.disabled_comment, s.read_only_on_mobile_app,
    case when p_same_project then s.linked_flow_id end
  from public.steps s where s.id = p_src
  returning id into v_new;

  insert into public.step_tags (step_id, tag_id) select v_new, t.tag_id from public.step_tags t where t.step_id = p_src;
  insert into public.custom_field_values (custom_field_id, object_id, account_id, business_class, value_text, value_json, updated_by)
  select v.custom_field_id, v_new, v.account_id, v.business_class, v.value_text, v.value_json, private.current_collaborator_id()
  from public.custom_field_values v where v.object_id = p_src;

  for v_block in select id from public.blocks where step_id = p_src loop
    perform private.copy_block(v_block, v_new, p_dst_flow, p_same_project);
  end loop;
  return v_new;
end $$;

create or replace function private.copy_phase(p_src uuid, p_dst_flow uuid, p_position int, p_same_project boolean, p_sequence uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_new uuid; v_step record;
begin
  insert into public.phases (flow_id, sequence_id, position, custom_number, exclude_numbering, name, description, additional_comment,
    hide_title_pdf, disabled, disabled_comment, read_only_on_mobile_app, sequence_type, mandatory)
  select p_dst_flow, p_sequence, p_position, p.custom_number, p.exclude_numbering, p.name, p.description, p.additional_comment,
    p.hide_title_pdf, p.disabled, p.disabled_comment, p.read_only_on_mobile_app, p.sequence_type, p.mandatory
  from public.phases p where p.id = p_src
  returning id into v_new;

  insert into public.phase_tags (phase_id, tag_id) select v_new, t.tag_id from public.phase_tags t where t.phase_id = p_src;
  insert into public.custom_field_values (custom_field_id, object_id, account_id, business_class, value_text, value_json, updated_by)
  select v.custom_field_id, v_new, v.account_id, v.business_class, v.value_text, v.value_json, private.current_collaborator_id()
  from public.custom_field_values v where v.object_id = p_src;

  for v_step in select id, position from public.steps where phase_id = p_src order by position loop
    perform private.copy_step(v_step.id, v_new, p_dst_flow, v_step.position, p_same_project);
  end loop;
  return v_new;
end $$;

-- Dupliquer une étape vers une phase du même flow, juste avant une étape (null = en dernier).
create or replace function public.duplicate_step(p_step_id uuid, p_target_phase_id uuid, p_before_step_id uuid default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_flow uuid; v_new uuid; v_pos int; v_nav record;
begin
  select flow_id into v_flow from public.steps where id = p_step_id;
  if v_flow is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if p_before_step_id is not null then
    select position into v_pos from public.steps where id = p_before_step_id and phase_id = p_target_phase_id;
  end if;
  if v_pos is null then
    select coalesce(max(position), 0) + 1 into v_pos from public.steps where phase_id = p_target_phase_id;
  else
    update public.steps set position = position + 1 where phase_id = p_target_phase_id and position >= v_pos;
  end if;
  v_new := private.copy_step(p_step_id, p_target_phase_id, v_flow, v_pos, true);
  for v_nav in select * from public.step_navigations where step_id = p_step_id order by position loop
    insert into public.step_navigations (step_id, flow_id, target_phase_id, target_step_id, style, message, position)
    values (v_new, v_flow, v_nav.target_phase_id, v_nav.target_step_id, v_nav.style, v_nav.message, v_nav.position);
  end loop;
  return v_new;
end $$;

-- Dupliquer une phase juste avant une autre phase (null = en dernier).
create or replace function public.duplicate_phase(p_phase_id uuid, p_before_phase_id uuid default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_flow uuid; v_seq uuid; v_new uuid; v_pos int;
begin
  select flow_id, sequence_id into v_flow, v_seq from public.phases where id = p_phase_id;
  if v_flow is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if p_before_phase_id is not null then
    select position into v_pos from public.phases where id = p_before_phase_id and flow_id = v_flow;
  end if;
  if v_pos is null then
    select coalesce(max(position), 0) + 1 into v_pos from public.phases where flow_id = v_flow;
  else
    update public.phases set position = position + 1 where flow_id = v_flow and position >= v_pos;
  end if;
  v_new := private.copy_phase(p_phase_id, v_flow, v_pos, true, v_seq);
  return v_new;
end $$;

-- Dupliquer un flow (copie profonde synchrone). Remet à zéro la validation interne, sans signatures ni réponses.
create or replace function public.duplicate_flow(p_flow_id uuid, p_name text, p_project_id uuid default null, p_ref_int text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_src public.flows; v_new uuid; v_project uuid; v_same boolean; v_me uuid := private.current_collaborator_id();
  v_seq record; v_seq_map jsonb := '{}'; v_phase record; v_new_phase uuid; v_map jsonb := '{}';
  v_step record; v_nav record; v_new_seq uuid;
begin
  select * into v_src from public.flows where id = p_flow_id and deleted_at is null;
  if v_src.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  v_project := coalesce(p_project_id, v_src.project_id);
  v_same := v_project = v_src.project_id;

  insert into public.flows (organization_id, account_id, project_id, flow_type, name, description, ref_int, ref_ext,
    family_id, category_id, location_activated, location_site, location_area, location_local, elementary_system, functional_marker,
    technical_object_id, technical_object_label, reporter_id, tablet_1_id, tablet_2_id, tablet_3_id,
    start_date, finish_date, estimated_start_date, estimated_end_date, bar_color,
    supervision_intern_1, supervision_intern_2, supervision_intern_3, supervision_extern_1, supervision_extern_2, supervision_extern_3,
    internal_supervisor_name_1, internal_supervisor_name_2, internal_supervisor_name_3,
    external_supervisor_name_1, external_supervisor_name_2, external_supervisor_name_3,
    simplified_signature_mode, origin, created_by, updated_by)
  select p.organization_id, p.account_id, v_project, v_src.flow_type, p_name, v_src.description, p_ref_int, v_src.ref_ext,
    v_src.family_id, case when v_same then v_src.category_id end, v_src.location_activated, v_src.location_site, v_src.location_area,
    v_src.location_local, v_src.elementary_system, v_src.functional_marker, v_src.technical_object_id, v_src.technical_object_label,
    case when v_same then v_src.reporter_id end, case when v_same then v_src.tablet_1_id end,
    case when v_same then v_src.tablet_2_id end, case when v_same then v_src.tablet_3_id end,
    v_src.start_date, v_src.finish_date, v_src.estimated_start_date, v_src.estimated_end_date, v_src.bar_color,
    v_src.supervision_intern_1, v_src.supervision_intern_2, v_src.supervision_intern_3,
    v_src.supervision_extern_1, v_src.supervision_extern_2, v_src.supervision_extern_3,
    v_src.internal_supervisor_name_1, v_src.internal_supervisor_name_2, v_src.internal_supervisor_name_3,
    v_src.external_supervisor_name_1, v_src.external_supervisor_name_2, v_src.external_supervisor_name_3,
    v_src.simplified_signature_mode, 'local', v_me, v_me
  from public.projects p where p.id = v_project
  returning id into v_new;
  if v_new is null then raise exception 'forbidden' using errcode = '42501'; end if;

  insert into public.flow_tags (flow_id, tag_id) select v_new, tag_id from public.flow_tags where flow_id = p_flow_id;
  insert into public.custom_field_values (custom_field_id, object_id, account_id, business_class, value_text, value_json, updated_by)
  select v.custom_field_id, v_new, v.account_id, v.business_class, v.value_text, v.value_json, v_me
  from public.custom_field_values v where v.object_id = p_flow_id;
  if v_same then
    insert into public.flow_assignees (flow_id, collaborator_id) select v_new, collaborator_id from public.flow_assignees where flow_id = p_flow_id;
    insert into public.flow_collaborators (flow_id, collaborator_id) select v_new, collaborator_id from public.flow_collaborators where flow_id = p_flow_id;
    insert into public.flow_collaborator_hierarchies (flow_id, collaborator_id, hierarchy_id)
      select v_new, collaborator_id, hierarchy_id from public.flow_collaborator_hierarchies where flow_id = p_flow_id;
  end if;

  for v_seq in select * from public.sequences where flow_id = p_flow_id order by position loop
    insert into public.sequences (flow_id, position, type) values (v_new, v_seq.position, v_seq.type) returning id into v_new_seq;
    v_seq_map := v_seq_map || jsonb_build_object(v_seq.id::text, v_new_seq);
  end loop;

  for v_phase in select id, position, sequence_id from public.phases where flow_id = p_flow_id order by position loop
    v_new_phase := private.copy_phase(v_phase.id, v_new, v_phase.position, v_same,
      case when v_phase.sequence_id is not null then (v_seq_map ->> v_phase.sequence_id::text)::uuid end);
    v_map := v_map || jsonb_build_object(v_phase.id::text, v_new_phase);
  end loop;

  -- Correspondance des étapes (même phase, même position) pour reporter les redirections.
  for v_step in
    select s.id as old_id, n.id as new_id
    from public.steps s
    join public.steps n on n.phase_id = (v_map ->> s.phase_id::text)::uuid and n.position = s.position
    where s.flow_id = p_flow_id
  loop
    v_map := v_map || jsonb_build_object(v_step.old_id::text, v_step.new_id);
  end loop;
  for v_nav in select * from public.step_navigations where flow_id = p_flow_id loop
    insert into public.step_navigations (step_id, flow_id, target_phase_id, target_step_id, style, message, position)
    values ((v_map ->> v_nav.step_id::text)::uuid, v_new,
      (v_map ->> v_nav.target_phase_id::text)::uuid, (v_map ->> v_nav.target_step_id::text)::uuid,
      v_nav.style, v_nav.message, v_nav.position);
  end loop;
  return v_new;
end $$;

-- ===== Réinitialisation du flow (§4.7, R-SIG-8) ===============================
create or replace function public.reset_flow(p_flow_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.can_write_flow(p_flow_id, 'responsible') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if private.flow_signature_count(p_flow_id) > 0 then
    raise exception 'has_signatures' using errcode = 'P0001';
  end if;
  delete from public.step_navigations where flow_id = p_flow_id;
  delete from public.form_block_links where flow_id = p_flow_id;
  update public.steps set linked_flow_id = null where flow_id = p_flow_id;
  delete from public.phases where flow_id = p_flow_id;
  delete from public.sequences where flow_id = p_flow_id;
  insert into public.flow_events (flow_id, event_type, actor_id) values (p_flow_id, 'reset_flow', private.current_collaborator_id());
end $$;

-- ===== Validation d'étape (§4.6) =============================================
-- Natures de signature attendues d'un bloc Contrôle (§5.7, R-DSI-3).
create or replace function private.dsi_expected_natures(p_block_id uuid)
returns public.signature_nature[] language plpgsql stable security invoker set search_path = '' as $$
declare
  c public.block_dsi_configs; f public.flows; v public.signature_nature[] := array['realisation']::public.signature_nature[];
  n int; any_int boolean; any_ext boolean;
begin
  select * into c from public.block_dsi_configs where block_id = p_block_id;
  if c.block_id is null or c.signatories_status = 'disabled' then return '{}'; end if;
  select fl.* into f from public.flows fl join public.blocks b on b.flow_id = fl.id where b.id = p_block_id;
  if c.technical_control then v := v || 'tech_control'::public.signature_nature; end if;
  if f.simplified_signature_mode then return v; end if;
  any_int := f.supervision_intern_1 or f.supervision_intern_2 or f.supervision_intern_3;
  any_ext := f.supervision_extern_1 or f.supervision_extern_2 or f.supervision_extern_3;
  for n in 1..3 loop
    if (n = 1 and not any_int) or (n = 1 and f.supervision_intern_1) or (n = 2 and f.supervision_intern_2) or (n = 3 and f.supervision_intern_3) then
      if (to_jsonb(c) ->> ('breakpoint_int_' || n))::boolean then v := v || ('breakpoint_int_' || n)::public.signature_nature; end if;
      if (to_jsonb(c) ->> ('convocation_int_' || n))::boolean then v := v || ('convocation_int_' || n)::public.signature_nature; end if;
    end if;
    if (n = 1 and not any_ext) or (n = 1 and f.supervision_extern_1) or (n = 2 and f.supervision_extern_2) or (n = 3 and f.supervision_extern_3) then
      if (to_jsonb(c) ->> ('breakpoint_ext_' || n))::boolean then v := v || ('breakpoint_ext_' || n)::public.signature_nature; end if;
      if (to_jsonb(c) ->> ('convocation_ext_' || n))::boolean then v := v || ('convocation_ext_' || n)::public.signature_nature; end if;
    end if;
  end loop;
  return v;
end $$;

-- Éléments obligatoires manquants d'une étape : 'dsi' | 'multi_pr' | 'form' (tableau vide = complet).
create or replace function private.step_missing_mandatory(p_step_id uuid)
returns text[] language plpgsql stable security invoker set search_path = '' as $$
declare v text[] := '{}'; b record;
begin
  for b in select * from public.blocks where step_id = p_step_id and enabled loop
    if b.type = 'dsi' and exists (select 1 from public.block_dsi_configs c where c.block_id = b.id and c.signatories_status = 'required') then
      if exists (select 1 from unnest(private.dsi_expected_natures(b.id)) n(nature)
                 where not exists (select 1 from public.signatures s
                                   where s.block_id = b.id and s.nature = n.nature and not s.disabled
                                     and s.state in ('signed','not_possible'))) then
        v := v || 'dsi';
      end if;
    elsif b.type = 'multi_pr' then
      if (b.multi_pr_requires_status and exists (select 1 from public.block_multi_pr_items i
            where i.block_id = b.id and not i.disabled and i.custom_status_id is null))
         or (b.multi_pr_requires_signature and exists (select 1 from public.block_multi_pr_items i
            where i.block_id = b.id and not i.disabled
              and not exists (select 1 from public.block_multi_pr_signatures s where s.item_id = i.id))) then
        v := v || 'multi_pr';
      end if;
    elsif b.type = 'form' then
      if exists (select 1 from public.form_block_links l where l.block_id = b.id and l.enabled and l.mandatory
                 and not exists (select 1 from public.form_responses r where r.block_link_id = l.id and r.deleted_at is null)) then
        v := v || 'form';
      end if;
    end if;
  end loop;
  return v;
end $$;

-- Valider / dévalider une étape (opérateur+ pour valider, rédacteur+ pour dévalider).
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

create or replace function public.set_step_validation(p_step_id uuid, p_validate boolean)
returns text[] language sql security invoker set search_path = '' as $$
  select private.set_step_validation(p_step_id, p_validate)
$$;

-- Première ouverture d'une étape (pastille gris → bleu), ouverte aux lecteurs opérateurs+.
create or replace function private.mark_step_opened(p_step_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.steps set first_opened_at = now()
   where id = p_step_id and first_opened_at is null and private.can_write_flow(flow_id, 'operator');
end $$;

create or replace function public.mark_step_opened(p_step_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.mark_step_opened(p_step_id)
$$;

-- ===== Droits d'exécution =====================================================
revoke execute on function private.flow_signature_count(uuid, uuid, uuid), private.set_flow_status(uuid, uuid, text),
  private.copy_block(uuid, uuid, uuid, boolean), private.copy_step(uuid, uuid, uuid, int, boolean),
  private.copy_phase(uuid, uuid, int, boolean, uuid), private.dsi_expected_natures(uuid),
  private.step_missing_mandatory(uuid), private.set_step_validation(uuid, boolean), private.mark_step_opened(uuid)
  from public, anon;
grant execute on function private.flow_signature_count(uuid, uuid, uuid), private.set_flow_status(uuid, uuid, text),
  private.copy_block(uuid, uuid, uuid, boolean), private.copy_step(uuid, uuid, uuid, int, boolean),
  private.copy_phase(uuid, uuid, int, boolean, uuid), private.dsi_expected_natures(uuid),
  private.step_missing_mandatory(uuid), private.set_step_validation(uuid, boolean), private.mark_step_opened(uuid)
  to authenticated;

revoke execute on function public.set_flow_status(uuid, uuid, text), public.reorder_phases(uuid, uuid[]),
  public.move_step(uuid, uuid, int), public.duplicate_step(uuid, uuid, uuid), public.duplicate_phase(uuid, uuid),
  public.duplicate_flow(uuid, text, uuid, text), public.reset_flow(uuid), public.set_step_validation(uuid, boolean),
  public.mark_step_opened(uuid)
  from public, anon;
grant execute on function public.set_flow_status(uuid, uuid, text), public.reorder_phases(uuid, uuid[]),
  public.move_step(uuid, uuid, int), public.duplicate_step(uuid, uuid, uuid), public.duplicate_phase(uuid, uuid),
  public.duplicate_flow(uuid, text, uuid, text), public.reset_flow(uuid), public.set_step_validation(uuid, boolean),
  public.mark_step_opened(uuid)
  to authenticated;
