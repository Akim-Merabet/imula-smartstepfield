-- App mobile terrain : réponses de formulaire créées et modifiées hors ligne (spec 05 §4.7, §9.6).
-- Les valeurs passent par save_rubric_values (provenance « mobile ») ; ces RPC portent la réponse elle-même.
-- Identifiant généré par l'appareil : création rejouable sans doublon.

create or replace function public.mobile_create_form_response(p jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_form public.forms;
  v_link public.form_block_links;
  v_version uuid := (p ->> 'form_version_id')::uuid;
  v_step public.steps;
  v_me uuid := private.current_collaborator_id();
  v_reference text := trim(coalesce(p ->> 'reference', ''));
  v_created timestamptz := least(coalesce(nullif(p ->> 'created_at', '')::timestamptz, now()), now());
begin
  if v_id is null then raise exception 'INVALID' using errcode = 'P0001'; end if;
  if exists (select 1 from public.form_responses where id = v_id) then return; end if;

  select * into v_form from public.forms where id = (p ->> 'form_id')::uuid;
  if v_form.id is null or v_form.deleted_at is not null then raise exception 'FORM_NOT_FOUND' using errcode = 'P0001'; end if;
  if not private.can_write_project(v_form.project_id, 'operator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not v_form.enabled then raise exception 'FORM_DISABLED' using errcode = 'P0001'; end if;
  if char_length(v_reference) not between 3 and 255 then raise exception 'INVALID_REFERENCE' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.form_versions where id = v_version and form_id = v_form.id) then
    raise exception 'VERSION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if nullif(p ->> 'block_link_id', '') is not null then
    select * into v_link from public.form_block_links where id = (p ->> 'block_link_id')::uuid;
    if v_link.id is null or v_link.form_id <> v_form.id then raise exception 'FORM_NOT_FOUND' using errcode = 'P0001'; end if;
    if not v_link.enabled then raise exception 'FORM_DISABLED' using errcode = 'P0001'; end if;
    -- Réponse unique, ou mode « reprise uniquement » : pas de seconde réponse (spec 05 §4.7.2).
    if (v_link.unique_response or v_link.unique_mode = 'resume_response')
       and exists (select 1 from public.form_responses r where r.block_link_id = v_link.id and r.deleted_at is null) then
      raise exception 'UNIQUE_RESPONSE_EXISTS' using errcode = 'P0001';
    end if;
    select * into v_step from public.steps where id = v_link.step_id;
  end if;

  insert into public.form_responses (
    id, organization_id, account_id, project_id, form_id, form_version_id, form_lineage_id, form_index_label, form_reference,
    context, block_link_id, flow_id, phase_id, step_id, reference, provenance, dynamic_context, created_at, created_by, updated_by
  ) values (
    v_id, v_form.organization_id, v_form.account_id, v_form.project_id, v_form.id, v_version, v_form.lineage_id,
    v_form.index_label, v_form.reference,
    case when v_link.id is null then 'project' else 'flow' end::public.response_context,
    v_link.id, v_link.flow_id, v_step.phase_id, v_link.step_id, v_reference, 'mobile',
    coalesce(p -> 'dynamic_context', '{}'::jsonb), v_created, v_me, v_me
  );
  insert into public.form_response_events (response_id, action, actor_id, provenance, payload)
  values (v_id, 'created', v_me, 'mobile', jsonb_build_object('reference', v_reference));
end $function$;

-- Modifications de la réponse depuis l'appareil : état (terminer / repasser en cours), référence, rubrique courante,
-- redirection active. Les clés absentes de p ne sont pas modifiées.
create or replace function public.mobile_update_form_response(p_id uuid, p jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare r public.form_responses; v_me uuid := private.current_collaborator_id(); v_ref text;
begin
  select * into r from public.form_responses where id = p_id for update;
  if r.id is null or r.deleted_at is not null then raise exception 'RESPONSE_NOT_FOUND' using errcode = 'P0001'; end if;
  if not private.can_write_project(r.project_id, 'operator') then raise exception 'forbidden' using errcode = '42501'; end if;

  if p ? 'reference' then
    v_ref := trim(coalesce(p ->> 'reference', ''));
    if char_length(v_ref) not between 3 and 255 then raise exception 'INVALID_REFERENCE' using errcode = 'P0001'; end if;
    if v_ref is distinct from r.reference then
      update public.form_responses set reference = v_ref, updated_by = v_me where id = p_id;
      insert into public.form_response_events (response_id, action, actor_id, provenance, payload)
      values (p_id, 'updated', v_me, 'mobile', jsonb_build_object('reference', v_ref));
    end if;
  end if;

  if p ? 'last_rubric_lineage_id' or p ? 'active_redirect' then
    update public.form_responses set
      last_rubric_lineage_id = case when p ? 'last_rubric_lineage_id' then nullif(p ->> 'last_rubric_lineage_id', '')::uuid else last_rubric_lineage_id end,
      active_redirect = case when p ? 'active_redirect' then nullif(p -> 'active_redirect', 'null'::jsonb) else active_redirect end
    where id = p_id and state = 'in_progress';
  end if;

  if p ? 'state' and (p ->> 'state') is distinct from r.state::text then
    if p ->> 'state' = 'done' then
      update public.form_responses
         set state = 'done', done_at = least(coalesce(nullif(p ->> 'done_at', '')::timestamptz, now()), now()), done_by = v_me,
             updated_by = v_me, active_redirect = null
       where id = p_id;
    elsif p ->> 'state' = 'in_progress' then
      -- Réglage de l'organisation : une réponse terminée n'est plus modifiable (spec 05 §4.7.4).
      if exists (select 1 from public.organizations o where o.id = r.organization_id and o.block_form_response_edition) then
        raise exception 'RESPONSE_EDITION_BLOCKED' using errcode = 'P0001';
      end if;
      update public.form_responses set state = 'in_progress', done_at = null, done_by = null, updated_by = v_me where id = p_id;
    else
      raise exception 'INVALID' using errcode = 'P0001';
    end if;
    insert into public.form_response_events (response_id, action, actor_id, provenance, payload)
    values (p_id, 'state_changed', v_me, 'mobile', jsonb_build_object('state', p ->> 'state'));
  end if;
end $function$;

revoke all on function public.mobile_create_form_response(jsonb) from public, anon;
revoke all on function public.mobile_update_form_response(uuid, jsonb) from public, anon;
grant execute on function public.mobile_create_form_response(jsonb) to authenticated;
grant execute on function public.mobile_update_form_response(uuid, jsonb) to authenticated;
