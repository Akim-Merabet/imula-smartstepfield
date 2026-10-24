-- App mobile terrain : instructions multiples, statut du flow et déverrouillage du flow (spec 05 §2.4, §4.4, §9.6).

-- Étape saisissable depuis l'appareil : active, pas « WebApp uniquement », non verrouillée par le séquencement.
create or replace function private.mobile_step_writable(p_step_id uuid)
 returns text
 language sql
 stable
 set search_path to ''
as $function$
  select case
    when s.disabled or ph.disabled then 'STEP_DISABLED'
    when s.read_only_on_mobile_app or ph.read_only_on_mobile_app then 'STEP_WEBAPP_ONLY'
    when coalesce(array_length(private.step_sequence_blockers(s.id), 1), 0) > 0 then 'STEP_LOCKED'
  end
  from public.steps s join public.phases ph on ph.id = s.phase_id where s.id = p_step_id
$function$;

-- 1. Instruction multiple : statut et observation d'une sous-instruction (même historique que la WebApp).
create or replace function public.mobile_update_multi_pr_item(p_id uuid, p jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare i public.block_multi_pr_items; b public.blocks; v_me uuid := private.current_collaborator_id(); v_err text;
begin
  select * into i from public.block_multi_pr_items where id = p_id;
  if i.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not private.can_sign_flow(i.flow_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if i.disabled then raise exception 'ITEM_DISABLED' using errcode = 'P0001'; end if;
  select * into b from public.blocks where id = i.block_id;
  v_err := private.mobile_step_writable(b.step_id);
  if v_err is not null then raise exception '%', v_err using errcode = 'P0001'; end if;

  if p ? 'custom_status_id' and nullif(p ->> 'custom_status_id', '') is not null and not exists (
    select 1 from public.custom_statuses s where s.id = (p ->> 'custom_status_id')::uuid and s.nature = 'multi_pr' and s.active
      and s.organization_id = private.current_org_id()
  ) then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p ->> 'observation', '')) > 4000 then raise exception 'TOO_LONG' using errcode = 'P0001'; end if;

  update public.block_multi_pr_items set
    custom_status_id = case when p ? 'custom_status_id' then nullif(p ->> 'custom_status_id', '')::uuid else custom_status_id end,
    observation = case when p ? 'observation' then nullif(trim(p ->> 'observation'), '') else observation end,
    updated_by = v_me, updated_at = now()
  where id = p_id;

  if p ? 'custom_status_id' and nullif(p ->> 'custom_status_id', '')::uuid is distinct from i.custom_status_id then
    insert into public.block_multi_pr_events (block_id, flow_id, item_id, action, from_status_id, to_status_id, comment, actor_id, source)
    values (i.block_id, i.flow_id, p_id, case when i.custom_status_id is null then 'select_status' else 'change_status' end,
            i.custom_status_id, nullif(p ->> 'custom_status_id', '')::uuid, nullif(trim(p ->> 'comment'), ''), v_me, 'mobile');
  end if;
  if p ? 'observation' and nullif(trim(p ->> 'observation'), '') is distinct from i.observation then
    insert into public.block_multi_pr_events (block_id, flow_id, item_id, action, actor_id, source)
    values (i.block_id, i.flow_id, p_id, 'edit_observation', v_me, 'mobile');
  end if;
end $function$;

-- 2. Signature d'une sous-instruction (une seule par sous-instruction) ; identifiant client, rejouable.
create or replace function public.mobile_sign_multi_pr(p jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare i public.block_multi_pr_items; b public.blocks; v_me uuid := private.current_collaborator_id(); v_err text;
  v_id uuid := (p ->> 'id')::uuid; v_signed timestamptz := (p ->> 'signed_at')::timestamptz;
begin
  if v_id is null then raise exception 'INVALID' using errcode = 'P0001'; end if;
  if exists (select 1 from public.block_multi_pr_signatures where id = v_id) then return; end if;
  select * into i from public.block_multi_pr_items where id = (p ->> 'item_id')::uuid;
  if i.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not private.can_sign_flow(i.flow_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if i.disabled then raise exception 'ITEM_DISABLED' using errcode = 'P0001'; end if;
  select * into b from public.blocks where id = i.block_id;
  v_err := private.mobile_step_writable(b.step_id);
  if v_err is not null then raise exception '%', v_err using errcode = 'P0001'; end if;
  if nullif(p ->> 'signature_path', '') is null then raise exception 'SIGNATURE_REQUIRED' using errcode = 'P0001'; end if;
  if v_signed is null or v_signed > now() + interval '5 minutes' then raise exception 'INVALID_DATE' using errcode = 'P0001'; end if;
  if exists (select 1 from public.block_multi_pr_signatures where item_id = i.id) then raise exception 'ALREADY_SIGNED' using errcode = 'P0001'; end if;

  insert into public.block_multi_pr_signatures (id, item_id, flow_id, signatory_id, signed_at, signature_path, source)
  values (v_id, i.id, i.flow_id, v_me, v_signed, p ->> 'signature_path', 'mobile');
  insert into public.block_multi_pr_events (block_id, flow_id, item_id, action, actor_id, source)
  values (i.block_id, i.flow_id, i.id, 'sign', v_me, 'mobile');
end $function$;

-- 3. Statut du flow depuis l'appareil : même contrôle que set_flow_status, historique avec la source « mobile ».
create or replace function private.flows_status_history()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.flow_status_history (flow_id, from_status_id, to_status_id, actor_id)
    values (new.id, null, new.custom_status_id, new.created_by);
    insert into public.flow_events (flow_id, event_type, actor_id) values (new.id, 'create', new.created_by);
  elsif new.custom_status_id is distinct from old.custom_status_id then
    insert into public.flow_status_history (flow_id, from_status_id, to_status_id, actor_id, comment, source)
    values (new.id, old.custom_status_id, new.custom_status_id, new.updated_by,
            nullif(current_setting('app.status_comment', true), ''),
            coalesce(nullif(current_setting('app.status_source', true), ''), 'webapp')::public.event_source);
  end if;
  return new;
end $function$;

create or replace function public.mobile_set_flow_status(p_flow_id uuid, p_status_id uuid, p_comment text default null)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not private.can_write_flow(p_flow_id, 'operator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.custom_statuses s where s.id = p_status_id and s.nature = 'flow' and s.active
                   and s.organization_id = private.current_org_id()) then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
  perform set_config('app.status_comment', coalesce(p_comment, ''), true);
  perform set_config('app.status_source', 'mobile', true);
  update public.flows set custom_status_id = p_status_id, updated_by = private.current_collaborator_id() where id = p_flow_id;
  perform set_config('app.status_comment', '', true);
  perform set_config('app.status_source', '', true);
end $function$;

-- 4. Déverrouillage du flow entier (« chef de chantier », R-SEQ-4) : signé, commentaire obligatoire, irréversible.
create or replace function public.mobile_unlock_flow(p jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_id uuid := (p ->> 'id')::uuid; v_flow uuid := (p ->> 'flow_id')::uuid; v_me uuid := private.current_collaborator_id();
  v_qr boolean := coalesce((p ->> 'sign_with_qr_code')::boolean, false); v_signed timestamptz := (p ->> 'signed_at')::timestamptz;
begin
  if v_id is null or v_flow is null then raise exception 'INVALID' using errcode = 'P0001'; end if;
  if exists (select 1 from public.flow_fill_unlocks where id = v_id) then return; end if;
  if not private.can_sign_flow(v_flow) then raise exception 'forbidden' using errcode = '42501'; end if;
  if nullif(trim(p ->> 'comment'), '') is null then raise exception 'COMMENT_REQUIRED' using errcode = 'P0001'; end if;
  if not v_qr and nullif(p ->> 'signature_path', '') is null then raise exception 'SIGNATURE_REQUIRED' using errcode = 'P0001'; end if;
  if v_signed is null or v_signed > now() + interval '5 minutes' then raise exception 'INVALID_DATE' using errcode = 'P0001'; end if;

  insert into public.flow_fill_unlocks (id, flow_id, unlocked_by, signature_path, comment, sign_with_qr_code, signed_at, source)
  values (v_id, v_flow, coalesce(nullif(p ->> 'unlocked_by', '')::uuid, v_me), nullif(p ->> 'signature_path', ''),
          trim(p ->> 'comment'), v_qr, v_signed, 'mobile');
  insert into public.flow_events (flow_id, event_type, actor_id) values (v_flow, 'skip_fill_restriction', v_me);
end $function$;

revoke all on function public.mobile_update_multi_pr_item(uuid, jsonb) from public, anon;
revoke all on function public.mobile_sign_multi_pr(jsonb) from public, anon;
revoke all on function public.mobile_set_flow_status(uuid, uuid, text) from public, anon;
revoke all on function public.mobile_unlock_flow(jsonb) from public, anon;
grant execute on function public.mobile_update_multi_pr_item(uuid, jsonb) to authenticated;
grant execute on function public.mobile_sign_multi_pr(jsonb) to authenticated;
grant execute on function public.mobile_set_flow_status(uuid, uuid, text) to authenticated;
grant execute on function public.mobile_unlock_flow(jsonb) to authenticated;
