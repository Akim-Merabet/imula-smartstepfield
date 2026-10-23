-- =============================================================================
-- Lot 3 — Duplication d'entité (spec 01 §5.6), dossiers référentiels (§5.7),
-- exécution asynchrone des traitements référentiels (spec 02 §3.6).
-- Les traitements sont mis en file dans async_jobs (to_do) par une action serveur,
-- puis exécutés après la réponse (Next `after()`) par public.run_async_job :
-- to_do → in_progress → done | failed. Chaque job est reflété dans background_tasks
-- (cloche des événements, écran « Tâches de fond »).
-- Toutes les fonctions sont SECURITY INVOKER (RLS appliquée) sauf les helpers private
-- explicitement SECURITY DEFINER (adhésion du créateur, miroir des tâches).
-- =============================================================================

-- ===== Table de correspondance (ancien id → nouvel id) pour une copie profonde =====
create or replace function private.dup_map_reset()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if to_regclass('pg_temp.dup_map') is null then
    create temp table dup_map (old_id uuid primary key, new_id uuid not null) on commit drop;
  else
    delete from pg_temp.dup_map;
  end if;
end $$;

-- Correspondance phases / étapes / blocs entre deux flows de même structure (positions identiques).
create or replace function private.dup_map_flow_content(p_src uuid, p_dst uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  insert into pg_temp.dup_map (old_id, new_id)
  select p.id, n.id from public.phases p join public.phases n on n.flow_id = p_dst and n.position = p.position
  where p.flow_id = p_src on conflict do nothing;
  insert into pg_temp.dup_map (old_id, new_id)
  select s.id, n.id from public.steps s
  join pg_temp.dup_map pm on pm.old_id = s.phase_id
  join public.steps n on n.phase_id = pm.new_id and n.position = s.position
  where s.flow_id = p_src on conflict do nothing;
  insert into pg_temp.dup_map (old_id, new_id)
  select b.id, n.id from public.blocks b
  join pg_temp.dup_map sm on sm.old_id = b.step_id
  join public.blocks n on n.step_id = sm.new_id and n.type = b.type
  where b.flow_id = p_src on conflict do nothing;
end $$;

-- Remplace dans un JSON (configuration de diagramme) les identifiants copiés.
create or replace function private.dup_remap_json(p_json jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_txt text := p_json::text; m record;
begin
  for m in select old_id, new_id from pg_temp.dup_map loop
    if position(m.old_id::text in v_txt) > 0 then v_txt := replace(v_txt, m.old_id::text, m.new_id::text); end if;
  end loop;
  return v_txt::jsonb;
end $$;

-- Le créateur d'une entité en devient Responsable (contourne la RLS project_members : l'entité n'a encore aucun membre).
create or replace function private.add_creator_as_responsible(p_project_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.current_collaborator_id();
begin
  if v_me is null or not exists (select 1 from public.projects where id = p_project_id and created_by = v_me) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.project_members where project_id = p_project_id) then return; end if;
  insert into public.project_members (project_id, collaborator_id, role) values (p_project_id, v_me, 'responsible');
end $$;

-- Crée une entité à partir d'une autre (champs copiés + surcharges), auteur Responsable, historique de statut, attributs.
create or replace function private.dup_create_project(p_src public.projects, p_overrides jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_new uuid := gen_random_uuid(); v_me uuid := private.current_collaborator_id(); v_status uuid;
begin
  insert into public.projects
  select (jsonb_populate_record(null::public.projects, to_jsonb(p_src) || jsonb_build_object(
    'id', v_new, 'published', false, 'archived', false, 'is_sub_folder', false, 'folder_id', null, 'project_index', null,
    'created_at', now(), 'updated_at', now(), 'created_by', v_me, 'updated_by', v_me, 'deleted_at', null, 'deleted_by', null)
    || p_overrides)).*;
  perform private.add_creator_as_responsible(v_new);
  select custom_status_id into v_status from public.projects where id = v_new;
  insert into public.project_status_history (project_id, from_status_id, to_status_id, actor_id) values (v_new, null, v_status, v_me);
  insert into public.custom_field_values (custom_field_id, object_id, account_id, business_class, value_text, value_json, updated_by)
  select v.custom_field_id, v_new, v.account_id, v.business_class, v.value_text, v.value_json, v_me
  from public.custom_field_values v where v.object_id = p_src.id;
  return v_new;
end $$;

-- Type de flow dans l'entité de destination (null = flow non repris : un modèle n'accueille que des flows « cœur »).
create or replace function private.dup_flow_type(p_type public.flow_type, p_origin public.flow_origin, p_dest public.project_type)
returns public.flow_type language sql immutable set search_path = '' as $$
  select case
    when p_dest in ('project','pgac') then case
      when p_origin = 'derived_from_standard' then p_type
      when p_type in ('referential','local_referential','template') then 'specific'::public.flow_type
      when p_type = 'referential_generic' then 'generic'
      when p_type = 'group_referential' then 'group'
      when p_type = 'referential_intervention' then 'flow_form'
      else p_type end
    when p_dest in ('referential','folder') then case
      when p_type in ('specific','template','local_referential') then 'referential'::public.flow_type
      when p_type = 'generic' then 'referential_generic'
      when p_type = 'group' then 'group_referential'
      when p_type = 'flow_form' then 'referential_intervention'
      else p_type end
    when p_dest = 'template' then case
      when p_type in ('group','group_referential') then null
      else 'template'::public.flow_type end
  end
$$;

-- ===== DUPLICATION D'ENTITÉ (§5.6) ===============================================
-- Copie : entité, attributs, catégories locales, formulaires d'entité (copie relationnelle),
-- flows et tout leur contenu, documents externes (état bibliothèque conservé) et documents de flow,
-- diagrammes. Validation interne remise à zéro (blocs → Rédaction), validation externe remise à zéro
-- (documents → PREL). Ni signatures, ni réponses, ni collaborateurs (l'auteur devient Responsable).
create or replace function private.duplicate_project_core(p_src uuid, p_type public.project_type, p_name text,
  p_client uuid, p_index text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  s public.projects; v_new uuid; v_me uuid := private.current_collaborator_id(); v_dest public.project_type := p_type;
  v_sub boolean := false; v_folder uuid; f record; v_flow uuid; v_type public.flow_type; d record; v_doc uuid; v_t0 uuid; lv record;
  v_project_like boolean;
begin
  select * into s from public.projects where id = p_src and deleted_at is null;
  if s.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if s.type = 'pgac' or (s.type = 'folder' and not s.is_sub_folder) then raise exception 'not_duplicable' using errcode = 'P0001'; end if;
  if not private.can_write_project(p_src, 'responsible') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 3 then raise exception 'invalid_name' using errcode = '23514'; end if;
  -- Sous-dossier référentiel : la copie reste un sous-dossier du même dossier (ProjectFolderDuplicateModal).
  if s.type = 'folder' then v_dest := 'folder'; v_sub := true; v_folder := s.folder_id;
  elsif v_dest not in ('project','referential','template') then raise exception 'invalid_type' using errcode = 'P0001';
  end if;
  v_project_like := v_dest in ('project','pgac');

  perform private.dup_map_reset();
  v_new := private.dup_create_project(s, jsonb_build_object('type', v_dest, 'designation', btrim(p_name), 'client_id', p_client,
    'project_index', nullif(btrim(coalesce(p_index, '')), ''), 'is_sub_folder', v_sub, 'folder_id', v_folder));

  -- Catégories locales (parents puis enfants).
  insert into pg_temp.dup_map (old_id, new_id)
  select id, gen_random_uuid() from public.label_families where project_id = p_src and deleted_at is null;
  insert into public.label_families
  select (jsonb_populate_record(null::public.label_families, to_jsonb(l) || jsonb_build_object(
    'id', m.new_id, 'project_id', v_new, 'parent_id', coalesce(pm.new_id, l.parent_id), 'created_at', now(), 'updated_at', now()))).*
  from public.label_families l join pg_temp.dup_map m on m.old_id = l.id left join pg_temp.dup_map pm on pm.old_id = l.parent_id
  where l.project_id = p_src and l.deleted_at is null
  order by (l.relative_nature = 'child'), l.priority;

  -- Formulaires d'entité : copie relationnelle (mêmes lineage_id pour les importés et pour les rubriques/questions/options).
  insert into pg_temp.dup_map (old_id, new_id)
  select id, gen_random_uuid() from public.forms where project_id = p_src and location = 'project' and deleted_at is null;
  insert into public.forms
  select (jsonb_populate_record(null::public.forms, to_jsonb(x) || jsonb_build_object(
    'id', m.new_id, 'project_id', v_new, 'account_id', s.account_id,
    'lineage_id', case when x.origin = 'imported' then x.lineage_id else gen_random_uuid() end,
    'family_id', coalesce(fm.new_id, x.family_id), 'current_version_id', null,
    'created_at', now(), 'updated_at', now(), 'created_by', v_me, 'updated_by', v_me))).*
  from public.forms x join pg_temp.dup_map m on m.old_id = x.id left join pg_temp.dup_map fm on fm.old_id = x.family_id;
  insert into public.form_companies (form_id, company_id)
  select m.new_id, c.company_id from public.form_companies c join pg_temp.dup_map m on m.old_id = c.form_id;
  insert into pg_temp.dup_map (old_id, new_id)
  select r.id, gen_random_uuid() from public.form_rubrics r join pg_temp.dup_map m on m.old_id = r.form_id;
  insert into public.form_rubrics
  select (jsonb_populate_record(null::public.form_rubrics, to_jsonb(r) || jsonb_build_object('id', rm.new_id, 'form_id', fm.new_id))).*
  from public.form_rubrics r join pg_temp.dup_map fm on fm.old_id = r.form_id join pg_temp.dup_map rm on rm.old_id = r.id;
  insert into pg_temp.dup_map (old_id, new_id)
  select q.id, gen_random_uuid() from public.form_questions q join pg_temp.dup_map m on m.old_id = q.rubric_id;
  insert into public.form_questions
  select (jsonb_populate_record(null::public.form_questions, to_jsonb(q) || jsonb_build_object(
    'id', qm.new_id, 'form_id', fm.new_id, 'rubric_id', rm.new_id))).*
  from public.form_questions q join pg_temp.dup_map qm on qm.old_id = q.id
  join pg_temp.dup_map rm on rm.old_id = q.rubric_id join pg_temp.dup_map fm on fm.old_id = q.form_id;
  insert into pg_temp.dup_map (old_id, new_id)
  select o.id, gen_random_uuid() from public.form_options o join pg_temp.dup_map m on m.old_id = o.question_id;
  insert into public.form_options
  select (jsonb_populate_record(null::public.form_options, to_jsonb(o) || jsonb_build_object(
    'id', om.new_id, 'form_id', fm.new_id, 'question_id', qm.new_id,
    'redirect_rubric_id', rr.new_id, 'redirect_question_id', rq.new_id))).*
  from public.form_options o join pg_temp.dup_map om on om.old_id = o.id
  join pg_temp.dup_map qm on qm.old_id = o.question_id join pg_temp.dup_map fm on fm.old_id = o.form_id
  left join pg_temp.dup_map rr on rr.old_id = o.redirect_rubric_id left join pg_temp.dup_map rq on rq.old_id = o.redirect_question_id;
  insert into pg_temp.dup_map (old_id, new_id)
  select sl.id, gen_random_uuid() from public.form_signatory_slots sl join pg_temp.dup_map m on m.old_id = sl.question_id;
  insert into public.form_signatory_slots
  select (jsonb_populate_record(null::public.form_signatory_slots, to_jsonb(sl) || jsonb_build_object(
    'id', sm.new_id, 'form_id', fm.new_id, 'question_id', qm.new_id))).*
  from public.form_signatory_slots sl join pg_temp.dup_map sm on sm.old_id = sl.id
  join pg_temp.dup_map qm on qm.old_id = sl.question_id join pg_temp.dup_map fm on fm.old_id = sl.form_id;
  insert into public.form_files
  select (jsonb_populate_record(null::public.form_files, to_jsonb(ff) || jsonb_build_object(
    'id', gen_random_uuid(), 'form_id', fm.new_id, 'owner_id', om.new_id))).*
  from public.form_files ff join pg_temp.dup_map fm on fm.old_id = ff.form_id join pg_temp.dup_map om on om.old_id = ff.owner_id;

  -- Flows et leur contenu (les référentiels importés verrouillés ne sont modifiables que par synchronisation).
  perform set_config('app.referential_sync', 'on', true);
  for f in select * from public.flows where project_id = p_src and deleted_at is null order by created_at loop
    v_type := private.dup_flow_type(f.flow_type, f.origin, v_dest);
    continue when v_type is null;
    v_flow := gen_random_uuid();
    insert into pg_temp.dup_map (old_id, new_id) values (f.id, v_flow);
    insert into public.flows
    select (jsonb_populate_record(null::public.flows, to_jsonb(f) || jsonb_build_object(
      'id', v_flow, 'project_id', v_new, 'account_id', s.account_id, 'flow_type', v_type,
      'category_id', coalesce((select new_id from pg_temp.dup_map where old_id = f.category_id), f.category_id),
      'reporter_id', null, 'tablet_1_id', null, 'tablet_2_id', null, 'tablet_3_id', null,
      'achieved_start_date', null, 'achieved_end_date', null,
      'origin', case when v_project_like and f.origin = 'derived_from_standard' then 'derived_from_standard' else 'local' end,
      'sourced_from_flow_id', case when v_project_like and f.origin = 'derived_from_standard' then f.sourced_from_flow_id end,
      'sourced_from_index', case when v_project_like and f.origin = 'derived_from_standard' then f.sourced_from_index end,
      'unlocked', case when v_project_like and f.origin = 'derived_from_standard' then f.unlocked else false end,
      'executed_from_flow_id', case when v_project_like then f.executed_from_flow_id end,
      'version', 1, 'created_at', now(), 'updated_at', now(), 'content_updated_at', null,
      'created_by', v_me, 'updated_by', v_me, 'deleted_at', null, 'deleted_by', null))).*;
    insert into public.flow_tags (flow_id, tag_id) select v_flow, tag_id from public.flow_tags where flow_id = f.id;
    insert into public.flow_secondary_categories (flow_id, category_id)
    select v_flow, coalesce(m.new_id, c.category_id) from public.flow_secondary_categories c
    left join pg_temp.dup_map m on m.old_id = c.category_id where c.flow_id = f.id;
    insert into public.custom_field_values (custom_field_id, object_id, account_id, business_class, value_text, value_json, updated_by)
    select v.custom_field_id, v_flow, v.account_id, v.business_class, v.value_text, v.value_json, v_me
    from public.custom_field_values v where v.object_id = f.id;
    insert into public.flow_geometries
    select (jsonb_populate_record(null::public.flow_geometries, to_jsonb(g) || jsonb_build_object(
      'id', gen_random_uuid(), 'project_id', v_new, 'flow_id', v_flow, 'created_at', now()))).*
    from public.flow_geometries g where g.flow_id = f.id;
    perform private.copy_flow_content(f.id, v_flow, false, '{}'::public.block_type[], false);
    perform private.dup_map_flow_content(f.id, v_flow);
  end loop;

  -- Flows liés (chapeaux) et liaisons bloc ↔ formulaire, avec correspondance des identifiants.
  update public.steps ns set linked_flow_id = lm.new_id
  from public.steps os, pg_temp.dup_map sm, pg_temp.dup_map lm
  where sm.old_id = os.id and sm.new_id = ns.id and lm.old_id = os.linked_flow_id;
  insert into public.form_block_links
  select (jsonb_populate_record(null::public.form_block_links, to_jsonb(l) || jsonb_build_object(
    'id', gen_random_uuid(), 'block_id', bm.new_id, 'step_id', sm.new_id, 'flow_id', flm.new_id, 'form_id', fm.new_id,
    'pinned_version_id', null, 'created_at', now()))).*
  from public.form_block_links l
  join pg_temp.dup_map bm on bm.old_id = l.block_id join pg_temp.dup_map sm on sm.old_id = l.step_id
  join pg_temp.dup_map flm on flm.old_id = l.flow_id join pg_temp.dup_map fm on fm.old_id = l.form_id;

  -- Documents (absents d'un modèle) : externes et documents de flow ; les autres (listes, formulaires,
  -- dossier de clôture…) ne sont pas repris.
  if v_dest <> 'template' then
    for d in
      select x.* from public.documents x
      where x.project_id = p_src and x.deleted_at is null
        and (x.source = 'extern' or (x.source = 'flow' and exists (select 1 from pg_temp.dup_map m where m.old_id = x.linked_flow_id)))
      order by x.position, x.created_at
    loop
      v_doc := gen_random_uuid();
      insert into pg_temp.dup_map (old_id, new_id) values (d.id, v_doc);
      insert into public.documents
      select (jsonb_populate_record(null::public.documents, to_jsonb(d) || jsonb_build_object(
        'id', v_doc, 'project_id', v_new, 'account_id', s.account_id,
        'origin', case when d.origin = 'imported_from_library' then 'imported_from_library' else 'local' end,
        'library_source_id', case when d.origin = 'imported_from_library' then d.library_source_id end,
        'standard_source_id', null,
        'category_id', coalesce((select new_id from pg_temp.dup_map where old_id = d.category_id), d.category_id),
        'closing_category_id', coalesce((select new_id from pg_temp.dup_map where old_id = d.closing_category_id), d.closing_category_id),
        'linked_flow_id', (select new_id from pg_temp.dup_map where old_id = d.linked_flow_id),
        'linked_form_id', (select new_id from pg_temp.dup_map where old_id = d.linked_form_id),
        'linked_response_id', null, 'linked_diagram_id', null, 'linked_list_id', null,
        'library_update_available', case when d.origin = 'imported_from_library' then d.library_update_available else false end,
        'created_at', now(), 'updated_at', now(), 'created_by', v_me, 'updated_by', v_me, 'deleted_at', null, 'deleted_by', null))).*;
      if d.origin = 'imported_from_library' then
        perform private.document_copy_library_versions(d.library_source_id, v_doc);
      else
        -- T0 (PREL) créé par trigger : on y redépose le fichier du dernier indice d'un document externe.
        if d.source = 'extern' and d.nature = 'pdf_versioned' then
          select pdf_path, pdf_name, pdf_size into lv from public.document_versions
           where document_id = d.id and pdf_path is not null order by seq desc limit 1;
          select id into v_t0 from public.document_versions where document_id = v_doc and is_last;
          if lv.pdf_path is not null and v_t0 is not null then
            perform public.document_version_action(v_t0, 'attach_file',
              jsonb_build_object('path', lv.pdf_path, 'name', lv.pdf_name, 'size', lv.pdf_size));
          end if;
        end if;
        insert into public.document_files (document_id, storage_path, name, size, position, created_by)
        select v_doc, storage_path, name, size, position, v_me from public.document_files where document_id = d.id and version_id is null;
      end if;
    end loop;
    insert into public.document_selections (document_id, kind, ref_id, position)
    select dm.new_id, ds.kind, coalesce(rm.new_id, ds.ref_id), ds.position
    from public.document_selections ds join pg_temp.dup_map dm on dm.old_id = ds.document_id
    left join pg_temp.dup_map rm on rm.old_id = ds.ref_id
    on conflict do nothing;
  end if;

  -- Liens bloc ↔ document : vers les copies (indice choisi conservé s'il existe), sinon retirés.
  update public.block_documents bd set document_id = dm.new_id, frozen_version_id = null,
    pinned_version_id = (select nv.id from public.document_versions ov join public.document_versions nv
                         on nv.document_id = dm.new_id and nv.seq = ov.seq where ov.id = bd.pinned_version_id)
  from pg_temp.dup_map dm, public.flows nf
  where nf.project_id = v_new and bd.flow_id = nf.id and bd.document_id = dm.old_id;
  delete from public.block_documents bd using public.flows nf
  where nf.project_id = v_new and bd.flow_id = nf.id and bd.document_id is not null
    and not exists (select 1 from public.documents x where x.id = bd.document_id and x.project_id = v_new)
    and (not bd.is_attachment or bd.attachment_path is null);
  update public.block_documents bd set document_id = null from public.flows nf
  where nf.project_id = v_new and bd.flow_id = nf.id and bd.document_id is not null
    and not exists (select 1 from public.documents x where x.id = bd.document_id and x.project_id = v_new);
  perform set_config('app.referential_sync', '', true);

  -- Diagrammes (configuration réécrite avec les nouveaux identifiants).
  perform private.dup_copy_diagrams(p_src, v_new, null);
  return v_new;
end $$;

-- Copie des diagrammes d'une entité (p_kind : null = même nature, 'referential' = diagrammes référentiels en lecture seule).
create or replace function private.dup_copy_diagrams(p_src uuid, p_dst uuid, p_kind text)
returns void language plpgsql security invoker set search_path = '' as $$
declare dg record; v_new uuid;
begin
  for dg in select * from public.diagrams where project_id = p_src order by created_at loop
    v_new := gen_random_uuid();
    insert into public.diagrams (id, project_id, kind, name, config, read_only, document_id)
    values (v_new, p_dst, coalesce(p_kind, dg.kind), dg.name, private.dup_remap_json(dg.config),
            case when p_kind = 'referential' then true else dg.read_only end, null);
    insert into public.diagram_flows (diagram_id, flow_id)
    select v_new, m.new_id from public.diagram_flows df join pg_temp.dup_map m on m.old_id = df.flow_id where df.diagram_id = dg.id;
  end loop;
end $$;

-- ===== RÉFÉRENTIELS : cœur des traitements (partagé par les RPC synchrones et les jobs) =====
-- Importe un flow référentiel dans une entité projet (flow DERIVED_FROM_STANDARD verrouillé, sans blocs DSI / FORM).
create or replace function private.referential_import_flow(p_project public.projects, p_src_id uuid, p_src_index text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_src public.flows; v_new uuid; v_me uuid := private.current_collaborator_id();
begin
  select * into v_src from public.flows where id = p_src_id;
  insert into public.flows (organization_id, account_id, project_id, flow_type, name, description, ref_int, ref_ext,
    family_id, location_activated, location_site, location_area, location_local, elementary_system, functional_marker,
    technical_object_id, technical_object_label, bar_color,
    supervision_intern_1, supervision_intern_2, supervision_intern_3, supervision_extern_1, supervision_extern_2, supervision_extern_3,
    internal_supervisor_name_1, internal_supervisor_name_2, internal_supervisor_name_3,
    external_supervisor_name_1, external_supervisor_name_2, external_supervisor_name_3,
    simplified_signature_mode, origin, sourced_from_flow_id, sourced_from_index, created_by, updated_by)
  values (p_project.organization_id, p_project.account_id, p_project.id, v_src.flow_type, v_src.name, v_src.description,
    v_src.ref_int, v_src.ref_ext, v_src.family_id, v_src.location_activated, v_src.location_site, v_src.location_area,
    v_src.location_local, v_src.elementary_system, v_src.functional_marker, v_src.technical_object_id, v_src.technical_object_label,
    v_src.bar_color, v_src.supervision_intern_1, v_src.supervision_intern_2, v_src.supervision_intern_3,
    v_src.supervision_extern_1, v_src.supervision_extern_2, v_src.supervision_extern_3,
    v_src.internal_supervisor_name_1, v_src.internal_supervisor_name_2, v_src.internal_supervisor_name_3,
    v_src.external_supervisor_name_1, v_src.external_supervisor_name_2, v_src.external_supervisor_name_3,
    v_src.simplified_signature_mode, 'derived_from_standard', v_src.id, p_src_index, v_me, v_me)
  returning id into v_new;

  insert into public.flow_tags (flow_id, tag_id) select v_new, tag_id from public.flow_tags where flow_id = v_src.id;
  insert into public.custom_field_values (custom_field_id, object_id, account_id, business_class, value_text, value_json, updated_by)
  select v.custom_field_id, v_new, v.account_id, v.business_class, v.value_text, v.value_json, v_me
  from public.custom_field_values v where v.object_id = v_src.id and v.account_id = p_project.account_id;

  perform set_config('app.referential_sync', 'on', true);
  perform private.copy_flow_content(v_src.id, v_new, false, array['dsi','form']::public.block_type[], false);
  perform set_config('app.referential_sync', '', true);

  insert into public.flow_content_imports (flow_id, source_flow_id, kind, imported_by) values (v_new, v_src.id, 'referential', v_me);
  insert into public.flow_events (flow_id, event_type, actor_id, payload)
  values (v_new, 'import_content_referential', v_me, jsonb_build_object('source_flow_id', v_src.id));
  return v_new;
end $$;

-- Import (≤ 10 flows « en préparation » d'entités référentiel) : renvoie {created, updated, conflicts}.
create or replace function private.referential_import_core(p_project_id uuid, p_flow_ids uuid[], p_update_existing boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_project public.projects; v_src record; v_existing uuid;
  v_created uuid[] := '{}'; v_updated uuid[] := '{}'; v_conflicts uuid[] := '{}';
begin
  select * into v_project from public.projects where id = p_project_id and deleted_at is null;
  if v_project.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.can_write_project(p_project_id, 'writer') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_project.type not in ('project','pgac') then raise exception 'invalid_target' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_flow_ids, 1), 0) = 0 then raise exception 'no_selection' using errcode = 'P0001'; end if;
  if array_length(p_flow_ids, 1) > 10 then raise exception 'size_limit' using errcode = 'P0001'; end if;

  for v_src in
    select f.id, sp.project_index as src_index
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
    v_created := v_created || private.referential_import_flow(v_project, v_src.id, v_src.src_index);
  end loop;
  return jsonb_build_object('created', to_jsonb(v_created), 'updated', to_jsonb(v_updated), 'conflicts', to_jsonb(v_conflicts));
end $$;

-- Exécution d'un référentiel en n copies : renvoie les flows créés.
create or replace function private.referential_execute_core(p_flow_id uuid, p_copies int, p_reset_internal boolean)
returns uuid[] language plpgsql security invoker set search_path = '' as $$
declare
  v_src public.flows; v_new uuid; v_created uuid[] := '{}'; i int; v_me uuid := private.current_collaborator_id();
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
  return v_created;
end $$;

-- RPC synchrones historiques : même contrat (job tracé), délèguent désormais au cœur partagé.
create or replace function public.import_referential_flows(p_project_id uuid, p_flow_ids uuid[], p_update_existing boolean default false)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_me uuid := private.current_collaborator_id(); v_job uuid; v_project public.projects;
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
    update public.async_jobs set status = 'done', finished_at = now(),
      result = private.referential_import_core(p_project_id, p_flow_ids, p_update_existing)
    where id = v_job;
  exception when others then
    update public.async_jobs set status = 'failed', finished_at = now(), error = sqlerrm where id = v_job;
  end;
  return v_job;
end $$;

create or replace function public.execute_referential_flow(p_flow_id uuid, p_copies int default 1, p_reset_internal boolean default true)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_src public.flows; v_job uuid; v_me uuid := private.current_collaborator_id();
begin
  select * into v_src from public.flows where id = p_flow_id and deleted_at is null;
  if v_src.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.can_write_flow(p_flow_id, 'writer') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_src.flow_type not in ('referential','local_referential','referential_generic','group_referential','referential_intervention') then
    raise exception 'not_referential' using errcode = 'P0001';
  end if;
  if p_copies is null or p_copies < 1 or p_copies > 50 then raise exception 'invalid_copies' using errcode = 'P0001'; end if;
  insert into public.async_jobs (account_id, project_id, kind, requested_by, params, status)
  values (v_src.account_id, v_src.project_id, 'execute_referential', v_me,
          jsonb_build_object('flow_id', p_flow_id, 'copies', p_copies, 'reset_internal', p_reset_internal), 'in_progress')
  returning id into v_job;
  begin
    update public.async_jobs set status = 'done', finished_at = now(),
      result = jsonb_build_object('created', to_jsonb(private.referential_execute_core(p_flow_id, p_copies, p_reset_internal)))
    where id = v_job;
  exception when others then
    update public.async_jobs set status = 'failed', finished_at = now(), error = sqlerrm where id = v_job;
  end;
  return v_job;
end $$;

-- ===== DOSSIERS RÉFÉRENTIELS (§5.7) ==============================================
-- « Convertir en dossier » : un référentiel devient un dossier référentiel (ses flows restent attachés).
create or replace function public.convert_referential_to_folder(p_project_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.can_write_project(p_project_id, 'responsible') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.projects set type = 'folder', is_sub_folder = false, updated_by = private.current_collaborator_id()
   where id = p_project_id and type = 'referential' and deleted_at is null;
  if not found then raise exception 'not_convertible' using errcode = 'P0001'; end if;
end $$;

-- « Préparer » un sous-dossier : nouvelle entité Projet dont les flows référentiels du sous-dossier sont importés
-- dans le module Référentiels (flows liés des chapeaux et diagrammes référentiels repris).
create or replace function private.prepare_folder_core(p_sub_id uuid, p_name text, p_client uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare s public.projects; v_new uuid; v_project public.projects; f record; v_flow uuid;
begin
  select * into s from public.projects where id = p_sub_id and deleted_at is null;
  if s.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if s.type <> 'folder' or not s.is_sub_folder then raise exception 'not_sub_folder' using errcode = 'P0001'; end if;
  if not private.can_read_project(p_sub_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 3 then raise exception 'invalid_name' using errcode = '23514'; end if;
  if not exists (select 1 from public.flows where project_id = p_sub_id and deleted_at is null
                 and flow_type in ('referential','referential_generic','group_referential','referential_intervention','local_referential')) then
    raise exception 'no_flows' using errcode = 'P0001';
  end if;

  perform private.dup_map_reset();
  v_new := private.dup_create_project(s, jsonb_build_object('type', 'project', 'designation', btrim(p_name), 'client_id', p_client));
  select * into v_project from public.projects where id = v_new;

  for f in select * from public.flows where project_id = p_sub_id and deleted_at is null
           and flow_type in ('referential','referential_generic','group_referential','referential_intervention','local_referential')
           order by created_at loop
    v_flow := private.referential_import_flow(v_project, f.id, s.project_index);
    insert into pg_temp.dup_map (old_id, new_id) values (f.id, v_flow);
    perform private.dup_map_flow_content(f.id, v_flow);
  end loop;
  perform set_config('app.referential_sync', 'on', true);
  update public.steps ns set linked_flow_id = lm.new_id
  from public.steps os, pg_temp.dup_map sm, pg_temp.dup_map lm
  where sm.old_id = os.id and sm.new_id = ns.id and lm.old_id = os.linked_flow_id;
  perform set_config('app.referential_sync', '', true);
  perform private.dup_copy_diagrams(p_sub_id, v_new, 'referential');
  return v_new;
end $$;

-- ===== EXÉCUTION DES JOBS ========================================================
-- Exécute un job mis en file par l'utilisateur courant (appelé après la réponse HTTP).
create or replace function public.run_async_job(p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  j public.async_jobs; p jsonb; v_res jsonb; v_ids uuid[]; v_id uuid; v_created uuid[] := '{}'; v_updated uuid[] := '{}';
  v_failed jsonb := '[]'; v_new uuid;
begin
  select * into j from public.async_jobs where id = p_job_id and requested_by = private.current_collaborator_id() for update;
  if j.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if j.status not in ('to_do','in_progress') then return j.result; end if;
  update public.async_jobs set status = 'in_progress' where id = j.id and status = 'to_do';
  p := j.params;
  begin
    case j.kind
    when 'duplicate_project' then
      v_new := private.duplicate_project_core((p ->> 'source_id')::uuid, (p ->> 'type')::public.project_type,
        p ->> 'name', (p ->> 'client_id')::uuid, p ->> 'index');
      v_res := jsonb_build_object('project_id', v_new);
    when 'prepare_folder' then
      v_new := private.prepare_folder_core((p ->> 'folder_id')::uuid, p ->> 'name', (p ->> 'client_id')::uuid);
      v_res := jsonb_build_object('project_id', v_new);
    when 'import_referential' then
      select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(p -> 'flow_ids') x;
      v_res := private.referential_import_core(j.project_id, v_ids, coalesce((p ->> 'update_existing')::boolean, false));
    when 'execute_referential' then
      select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(p -> 'flow_ids') x;
      if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'no_selection' using errcode = 'P0001'; end if;
      if array_length(v_ids, 1) > 10 then raise exception 'size_limit' using errcode = 'P0001'; end if;
      foreach v_id in array v_ids loop
        v_created := v_created || private.referential_execute_core(v_id, (p ->> 'copies')::int,
          coalesce((p ->> 'reset_internal')::boolean, true));
      end loop;
      v_res := jsonb_build_object('created', to_jsonb(v_created));
    when 'refresh_referential' then
      select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(p -> 'flow_ids') x;
      foreach v_id in array coalesce(v_ids, '{}') loop
        begin
          if not private.can_write_flow(v_id, 'writer') then raise exception 'forbidden' using errcode = '42501'; end if;
          perform private.refresh_referential(v_id);
          v_updated := v_updated || v_id;
        exception when others then
          v_failed := v_failed || jsonb_build_object('flow_id', v_id, 'error', sqlerrm);
        end;
      end loop;
      if jsonb_array_length(v_failed) > 0 and coalesce(array_length(v_updated, 1), 0) = 0 then
        raise exception '%', v_failed -> 0 ->> 'error' using errcode = 'P0001';
      end if;
      v_res := jsonb_build_object('updated', to_jsonb(v_updated), 'failed', v_failed);
    else
      raise exception 'unknown_job_kind' using errcode = 'P0001';
    end case;
    update public.async_jobs set status = 'done', finished_at = now(), result = v_res, error = null where id = j.id;
  exception when others then
    update public.async_jobs set status = 'failed', finished_at = now(), error = sqlerrm where id = j.id;
    v_res := null;
  end;
  return v_res;
end $$;

-- Miroir des jobs dans background_tasks (cloche des événements + écran Tâches de fond, temps réel).
create or replace function private.async_jobs_mirror()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_href text; v_project uuid := nullif(new.result ->> 'project_id', '')::uuid;
begin
  v_href := case
    when new.status = 'done' and v_project is not null then '/explore/projects/' || v_project || '/dashboard'
    when new.status = 'done' and new.kind in ('import_referential','refresh_referential') and new.project_id is not null
      then '/explore/projects/' || new.project_id || '/dashboard/flow-referential/vue-list'
    when new.status = 'done' and new.kind = 'execute_referential' and new.project_id is not null
      then '/explore/projects/' || new.project_id || '/dashboard/flow-management/vue-list'
  end;
  insert into public.background_tasks (id, account_id, project_id, user_id, kind, name, status, attempts, metadata, error,
    created_at, started_at, finished_at)
  values (new.id, new.account_id, new.project_id, new.requested_by, new.kind, coalesce(new.params ->> 'label', new.kind),
    case new.status when 'to_do' then 'acknowledged' when 'in_progress' then 'in_progress' when 'done' then 'done' else 'error' end::public.bg_task_status,
    case when new.status = 'to_do' then 0 else 1 end,
    jsonb_strip_nulls(jsonb_build_object('async_job', true, 'href', v_href)), new.error,
    new.created_at, case when new.status <> 'to_do' then now() end, new.finished_at)
  on conflict (id) do update set status = excluded.status, attempts = excluded.attempts, metadata = excluded.metadata,
    error = excluded.error, started_at = coalesce(public.background_tasks.started_at, excluded.started_at),
    finished_at = excluded.finished_at;
  return new;
end $$;
drop trigger if exists async_jobs_mirror on public.async_jobs;
create trigger async_jobs_mirror after insert or update of status on public.async_jobs
  for each row execute function private.async_jobs_mirror();

-- ===== Droits d'exécution =========================================================
revoke execute on function private.dup_map_reset(), private.dup_map_flow_content(uuid, uuid), private.dup_remap_json(jsonb),
  private.add_creator_as_responsible(uuid), private.dup_create_project(public.projects, jsonb),
  private.dup_flow_type(public.flow_type, public.flow_origin, public.project_type),
  private.duplicate_project_core(uuid, public.project_type, text, uuid, text), private.dup_copy_diagrams(uuid, uuid, text),
  private.referential_import_flow(public.projects, uuid, text), private.referential_import_core(uuid, uuid[], boolean),
  private.referential_execute_core(uuid, int, boolean), private.prepare_folder_core(uuid, text, uuid),
  private.async_jobs_mirror()
  from public, anon;
grant execute on function private.dup_map_reset(), private.dup_map_flow_content(uuid, uuid), private.dup_remap_json(jsonb),
  private.add_creator_as_responsible(uuid), private.dup_create_project(public.projects, jsonb),
  private.dup_flow_type(public.flow_type, public.flow_origin, public.project_type),
  private.duplicate_project_core(uuid, public.project_type, text, uuid, text), private.dup_copy_diagrams(uuid, uuid, text),
  private.referential_import_flow(public.projects, uuid, text), private.referential_import_core(uuid, uuid[], boolean),
  private.referential_execute_core(uuid, int, boolean), private.prepare_folder_core(uuid, text, uuid)
  to authenticated;
revoke execute on function private.async_jobs_mirror() from authenticated;

revoke execute on function public.convert_referential_to_folder(uuid), public.run_async_job(uuid) from public, anon;
grant execute on function public.convert_referential_to_folder(uuid), public.run_async_job(uuid) to authenticated;
