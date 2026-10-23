-- =============================================================================
-- Module Formulaires : réordonnancement transactionnel, sauvegarde de rubrique
-- (valeurs + historique), garde de suppression des formulaires importés,
-- bucket Storage privé « form-files ». Réf. spec 03 §6.5, §6.10, §10.2.
-- =============================================================================

-- ----- Réordonnancement (positions 1..n en une transaction ; unicités différées) -----
create or replace function public.form_reorder(p_table text, p_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_table not in ('form_rubrics','form_questions','form_options','form_signatory_slots','form_response_dynamic_items') then
    raise exception 'invalid_table' using errcode = '22023';
  end if;
  execute format(
    'update public.%I t set position = x.ord from unnest($1) with ordinality as x(id, ord) where t.id = x.id and t.position is distinct from x.ord',
    p_table) using p_ids;
end $$;
revoke execute on function public.form_reorder(text, uuid[]) from public, anon;
grant execute on function public.form_reorder(text, uuid[]) to authenticated;

-- ----- Sauvegarde transactionnelle d'une rubrique de réponse (SECURITY INVOKER : RLS) -----
-- p_values : [{rubric_lineage_id, question_lineage_id, option_lineage_id, option_code, coord, question_type, value_type,
--              value_json, value_text, value_number, value_bool, value_date, value_ts, observation, is_valid, lock,
--              files_added, files_removed}]
-- p_options : {provenance, change_signature, auto_lock, active_redirect, set_redirect, last_rubric_lineage_id}
create or replace function public.save_rubric_values(p_response_id uuid, p_rubric_lineage_id uuid, p_values jsonb, p_options jsonb default '{}'::jsonb)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  v_state public.response_state;
  v_org uuid;
  v_me uuid := private.current_collaborator_id();
  v_prov public.event_source := coalesce(nullif(p_options->>'provenance', ''), 'webapp')::public.event_source;
  v_sig jsonb := nullif(p_options->'change_signature', 'null'::jsonb);
  v_auto boolean := coalesce((p_options->>'auto_lock')::boolean, false);
  v_item jsonb;
  v_old public.form_response_values;
  v_new_json jsonb;
  v_lock boolean;
  v_id uuid;
  v_changed int := 0;
begin
  select r.state, r.organization_id into v_state, v_org
  from public.form_responses r where r.id = p_response_id and r.deleted_at is null
  for update;
  if not found then raise exception 'response_not_found' using errcode = 'P0002'; end if;
  if v_state = 'done' then raise exception 'response_done' using errcode = 'P0001'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_values, '[]'::jsonb))
  loop
    v_new_json := nullif(v_item->'value_json', 'null'::jsonb);
    select * into v_old from public.form_response_values
      where response_id = p_response_id and option_lineage_id = (v_item->>'option_lineage_id')::uuid;

    if found and v_old.locked and v_old.value_json is distinct from v_new_json and v_sig is null then
      raise exception 'locked_value' using errcode = 'P0001';
    end if;

    v_lock := coalesce(v_old.locked, false)
              or (v_new_json is not null and (coalesce((v_item->>'lock')::boolean, false) or v_auto));

    insert into public.form_response_values as v (
      response_id, organization_id, rubric_lineage_id, question_lineage_id, option_lineage_id, option_code, coord,
      question_type, value_type, value_text, value_number, value_bool, value_date, value_ts, value_json, observation,
      is_valid, locked, locked_at, locked_by, updated_at, updated_by, provenance)
    values (
      p_response_id, v_org, (v_item->>'rubric_lineage_id')::uuid, (v_item->>'question_lineage_id')::uuid,
      (v_item->>'option_lineage_id')::uuid, nullif(v_item->>'option_code', ''), v_item->>'coord',
      (v_item->>'question_type')::public.question_type, (v_item->>'value_type')::public.value_type,
      v_item->>'value_text', nullif(v_item->>'value_number', '')::numeric, (v_item->>'value_bool')::boolean,
      nullif(v_item->>'value_date', '')::date, nullif(v_item->>'value_ts', '')::timestamptz, v_new_json,
      nullif(v_item->>'observation', ''), (v_item->>'is_valid')::boolean,
      v_lock, case when v_lock then coalesce(v_old.locked_at, now()) end, case when v_lock then coalesce(v_old.locked_by, v_me) end,
      now(), v_me, v_prov)
    on conflict (response_id, option_lineage_id) do update set
      coord = excluded.coord, option_code = excluded.option_code, question_type = excluded.question_type,
      value_type = excluded.value_type, value_text = excluded.value_text, value_number = excluded.value_number,
      value_bool = excluded.value_bool, value_date = excluded.value_date, value_ts = excluded.value_ts,
      value_json = excluded.value_json, observation = excluded.observation, is_valid = excluded.is_valid,
      locked = excluded.locked, locked_at = excluded.locked_at, locked_by = excluded.locked_by,
      updated_at = case when v.value_json is distinct from excluded.value_json or v.observation is distinct from excluded.observation
                          or v.locked is distinct from excluded.locked then now() else v.updated_at end,
      updated_by = case when v.value_json is distinct from excluded.value_json or v.observation is distinct from excluded.observation
                          then excluded.updated_by else v.updated_by end,
      provenance = excluded.provenance
    returning v.id into v_id;

    -- Historique de TOUTE modification de valeur (spec 03 §6.10, recommandation de reconstruction).
    if (v_old.id is null and v_new_json is not null)
       or (v_old.id is not null and v_old.value_json is distinct from v_new_json) then
      insert into public.form_response_value_history (
        response_id, value_id, option_lineage_id, changed_by, provenance, old_value, new_value,
        files_added, files_removed, change_signature, reason)
      values (
        p_response_id, v_id, (v_item->>'option_lineage_id')::uuid, v_me, v_prov, v_old.value_json, v_new_json,
        nullif(v_item->'files_added', 'null'::jsonb), nullif(v_item->'files_removed', 'null'::jsonb),
        case when coalesce(v_old.locked, false) then v_sig end, nullif(v_item->>'reason', ''));
      v_changed := v_changed + 1;
    end if;
  end loop;

  update public.form_responses set
    updated_by = v_me,
    last_rubric_lineage_id = coalesce(nullif(p_options->>'last_rubric_lineage_id', '')::uuid, p_rubric_lineage_id, last_rubric_lineage_id),
    active_redirect = case when coalesce((p_options->>'set_redirect')::boolean, false)
                           then nullif(p_options->'active_redirect', 'null'::jsonb) else active_redirect end
  where id = p_response_id;

  if v_changed > 0 then
    insert into public.form_response_events (response_id, action, actor_id, provenance, payload)
    values (p_response_id, 'filled', v_me, v_prov, jsonb_build_object('rubric_lineage_id', p_rubric_lineage_id, 'count', v_changed));
  end if;
  return v_changed;
end $$;
revoke execute on function public.save_rubric_values(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_rubric_values(uuid, uuid, jsonb, jsonb) to authenticated;

-- ----- Suppression d'un formulaire bibliothèque refusée s'il est importé (spec 03 §2.5) -----
-- Trigger SECURITY DEFINER : voit les imports dans toutes les entités (y compris non lisibles par l'utilisateur).
create or replace function private.forms_guard_imported()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.location = 'library'
     and (tg_op = 'DELETE' or (old.deleted_at is null and new.deleted_at is not null))
     and exists (select 1 from public.forms p
                 where p.sourced_from_form_id = old.id and p.location = 'project' and p.deleted_at is null) then
    raise exception 'form_imported' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists forms_guard_imported_upd on public.forms;
create trigger forms_guard_imported_upd before update of deleted_at on public.forms
  for each row execute function private.forms_guard_imported();
drop trigger if exists forms_guard_imported_del on public.forms;
create trigger forms_guard_imported_del before delete on public.forms
  for each row execute function private.forms_guard_imported();
revoke execute on function private.forms_guard_imported() from public, anon;

-- ----- Stockage des fichiers (photos, PDF, signatures, images du builder) -----
-- Chemins : forms/<form_id>/<fichier> (builder) · responses/<response_id>/<fichier> (réponses)
insert into storage.buckets (id, name, public, file_size_limit)
values ('form-files', 'form-files', false, 41943040)
on conflict (id) do nothing;

create or replace function private.form_file_access(p_name text, p_write boolean)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_id uuid;
begin
  if array_length(v_parts, 1) is null or array_length(v_parts, 1) < 2
     or v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_id := v_parts[2]::uuid;
  if v_parts[1] = 'forms' then
    return case when p_write then private.can_write_form(v_id) else private.can_read_form(v_id) end;
  elsif v_parts[1] = 'responses' then
    return case when p_write then private.can_write_response(v_id) else private.can_read_response(v_id) end;
  end if;
  return false;
end $$;
revoke execute on function private.form_file_access(text, boolean) from public, anon;
grant execute on function private.form_file_access(text, boolean) to authenticated;

drop policy if exists form_files_storage_select on storage.objects;
create policy form_files_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'form-files' and private.form_file_access(name, false));
drop policy if exists form_files_storage_insert on storage.objects;
create policy form_files_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'form-files' and private.form_file_access(name, true));
drop policy if exists form_files_storage_update on storage.objects;
create policy form_files_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'form-files' and private.form_file_access(name, true))
  with check (bucket_id = 'form-files' and private.form_file_access(name, true));
drop policy if exists form_files_storage_delete on storage.objects;
create policy form_files_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'form-files' and private.form_file_access(name, true));
