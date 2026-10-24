-- App mobile terrain : signatures du bloc Contrôles envoyées depuis la file hors ligne (spec 05 §4.8, §7, §9.6).
-- Mêmes règles que la WebApp (block-actions.ts createSignature : R-SIG-1..3), plus celles du terrain :
-- étape verrouillée par le séquencement, étape « WebApp uniquement », « Signer plus tard » (état waiting).
-- L'identifiant de la signature est généré par l'appareil : l'appel est rejouable sans doublon.

-- Le figement des versions de documents s'applique aussi quand une signature en attente est complétée.
drop trigger if exists freeze_dsi_documents on public.signatures;
create trigger freeze_dsi_documents after insert or update of state on public.signatures
  for each row execute function private.freeze_dsi_documents();

create or replace function public.mobile_sign(p jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_block public.blocks;
  v_step public.steps;
  v_phase public.phases;
  v_me uuid := private.current_collaborator_id();
  v_nature public.signature_nature := (p ->> 'nature')::public.signature_nature;
  v_state public.signature_state := coalesce(p ->> 'state', 'signed')::public.signature_state;
  v_contributor public.contributor_type := coalesce(p ->> 'contributor_type', 'intern')::public.contributor_type;
  v_proxied boolean := coalesce((p ->> 'proxied')::boolean, false);
  v_qr boolean := coalesce((p ->> 'sign_with_qr_code')::boolean, false);
  v_signed_at timestamptz := (p ->> 'signed_at')::timestamptz;
  v_signatory uuid := nullif(p ->> 'signatory_id', '')::uuid;
  v_principal text := nullif(trim(concat_ws(' ', p ->> 'proxy_principal_first_name', p ->> 'proxy_principal_last_name')), '');
  v_proxy_date timestamptz := nullif(p ->> 'proxy_date', '')::timestamptz;
begin
  if v_id is null then raise exception 'INVALID' using errcode = 'P0001'; end if;
  -- Rejeu après un envoi déjà accepté.
  if exists (select 1 from public.signatures where id = v_id) then return; end if;

  select * into v_block from public.blocks where id = (p ->> 'block_id')::uuid;
  if v_block.id is null or v_block.type <> 'dsi' or not v_block.enabled then raise exception 'NO_DSI' using errcode = 'P0001'; end if;
  if not private.can_sign_flow(v_block.flow_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_step from public.steps where id = v_block.step_id;
  select * into v_phase from public.phases where id = v_step.phase_id;
  -- R-SIG-1 et règles du terrain : étape active, saisissable sur l'application, non verrouillée.
  if v_step.disabled or v_phase.disabled then raise exception 'STEP_DISABLED' using errcode = 'P0001'; end if;
  if v_step.read_only_on_mobile_app or v_phase.read_only_on_mobile_app then raise exception 'STEP_WEBAPP_ONLY' using errcode = 'P0001'; end if;
  if coalesce(array_length(private.step_sequence_blockers(v_step.id), 1), 0) > 0 then raise exception 'STEP_LOCKED' using errcode = 'P0001'; end if;
  if exists (select 1 from public.flows f where f.id = v_block.flow_id and f.flow_type = 'generic') then
    raise exception 'NO_DSI' using errcode = 'P0001';
  end if;

  if not (v_nature = any (private.dsi_expected_natures(v_block.id))) then raise exception 'NATURE_NOT_AVAILABLE' using errcode = 'P0001'; end if;
  if exists (select 1 from public.signatures s where s.block_id = v_block.id and s.nature = v_nature and not s.disabled) then
    raise exception 'ALREADY_SIGNED' using errcode = 'P0001';
  end if;
  if v_signed_at is null or v_signed_at > now() + interval '5 minutes' then raise exception 'INVALID_DATE' using errcode = 'P0001'; end if;

  if v_proxied then
    -- Procuration : le mandataire est le profil connecté ; la date de procuration précède la signature.
    if v_principal is null or v_proxy_date is null then raise exception 'INVALID' using errcode = 'P0001'; end if;
    if v_proxy_date > v_signed_at then raise exception 'PROXY_DATE_AFTER' using errcode = 'P0001'; end if;
    v_signatory := v_me;
    v_contributor := 'intern';
  elsif v_contributor = 'intern' then
    v_signatory := coalesce(v_signatory, v_me);
    -- R-SIG-3 : liste restreinte du flow (+ responsables) si elle existe.
    if exists (select 1 from public.flow_collaborators where flow_id = v_block.flow_id)
       and not exists (select 1 from public.flow_collaborators where flow_id = v_block.flow_id and collaborator_id = v_signatory)
       and not exists (select 1 from public.flow_assignees where flow_id = v_block.flow_id and collaborator_id = v_signatory) then
      raise exception 'NOT_IN_RESTRICTED_LIST' using errcode = 'P0001';
    end if;
  else
    v_signatory := null;
    if nullif(trim(p ->> 'first_name'), '') is null or nullif(trim(p ->> 'last_name'), '') is null then
      raise exception 'INVALID' using errcode = 'P0001';
    end if;
  end if;

  -- R-SIG-2 : une signature par collaborateur et par étape.
  if v_signatory is not null and exists (
    select 1 from public.signatures s where s.step_id = v_step.id and s.signatory_id = v_signatory and not s.disabled
  ) then
    raise exception 'SIGN_TWICE' using errcode = 'P0001';
  end if;
  if v_state = 'signed' and not v_qr and nullif(p ->> 'signature_path', '') is null then
    raise exception 'SIGNATURE_REQUIRED' using errcode = 'P0001';
  end if;
  if v_state = 'not_possible' and nullif(trim(p ->> 'comment'), '') is null then raise exception 'COMMENT_REQUIRED' using errcode = 'P0001'; end if;
  if v_state not in ('signed', 'waiting', 'not_possible') then raise exception 'INVALID' using errcode = 'P0001'; end if;

  insert into public.signatures (
    id, block_id, step_id, flow_id, nature, state, contributor_type, signatory_id,
    first_name, last_name, email, company_name, profession, signature_path, signed_at, comment, sign_with_qr_code,
    proxied, proxy_principal_name, proxy_principal_first_name, proxy_principal_last_name, proxy_holder_name, proxy_date,
    source, created_by, local_created_at, device_id, connection_mode, latitude, longitude
  ) values (
    v_id, v_block.id, v_step.id, v_block.flow_id, v_nature, v_state, v_contributor, v_signatory,
    case when v_contributor = 'intern' then null else p ->> 'first_name' end,
    case when v_contributor = 'intern' then null else p ->> 'last_name' end,
    case when v_contributor = 'intern' then null else nullif(p ->> 'email', '') end,
    nullif(p ->> 'company_name', ''), nullif(p ->> 'profession', ''),
    case when v_state = 'signed' then nullif(p ->> 'signature_path', '') end,
    v_signed_at, nullif(trim(p ->> 'comment'), ''), v_qr,
    v_proxied, case when v_proxied then v_principal end,
    case when v_proxied then p ->> 'proxy_principal_first_name' end, case when v_proxied then p ->> 'proxy_principal_last_name' end,
    case when v_proxied then nullif(p ->> 'proxy_holder_name', '') end, case when v_proxied then v_proxy_date end,
    'mobile', v_me, nullif(p ->> 'local_created_at', '')::timestamptz, nullif(p ->> 'device_id', ''),
    nullif(p ->> 'connection_mode', ''), nullif(p ->> 'latitude', '')::double precision, nullif(p ->> 'longitude', '')::double precision
  );
  insert into public.signature_events (block_id, flow_id, signature_id, action, nature, actor_id, source, occurred_at,
                                       event_sequence, from_state, to_state, reason)
  values (v_block.id, v_block.flow_id, v_id, 'create', v_nature, v_me, 'mobile', now(), 0, null, v_state, nullif(trim(p ->> 'comment'), ''));
end $function$;

-- « Reprendre » une signature en attente : waiting → signed (dessin, date déclarée, commentaire).
create or replace function public.mobile_complete_signature(p_id uuid, p_signature_path text, p_signed_at timestamptz, p_comment text default null)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare s public.signatures; v_me uuid := private.current_collaborator_id(); v_seq int;
begin
  select * into s from public.signatures where id = p_id;
  if s.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not private.can_sign_flow(s.flow_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if s.state = 'signed' then return; end if;
  if s.state <> 'waiting' or s.disabled then raise exception 'NOT_WAITING' using errcode = 'P0001'; end if;
  if nullif(p_signature_path, '') is null and not s.sign_with_qr_code then raise exception 'SIGNATURE_REQUIRED' using errcode = 'P0001'; end if;
  if p_signed_at is null or p_signed_at > now() + interval '5 minutes' or (s.proxied and p_signed_at < s.proxy_date) then
    raise exception 'INVALID_DATE' using errcode = 'P0001';
  end if;
  update public.signatures
     set state = 'signed', signature_path = nullif(p_signature_path, ''), signed_at = p_signed_at,
         comment = coalesce(nullif(trim(p_comment), ''), comment)
   where id = p_id;
  select coalesce(max(event_sequence), -1) + 1 into v_seq from public.signature_events where signature_id = p_id;
  insert into public.signature_events (block_id, flow_id, signature_id, action, nature, actor_id, source, occurred_at,
                                       event_sequence, from_state, to_state, reason)
  values (s.block_id, s.flow_id, p_id, 'update', s.nature, v_me, 'mobile', p_signed_at, v_seq, 'waiting', 'signed', nullif(trim(p_comment), ''));
end $function$;

revoke all on function public.mobile_sign(jsonb) from public, anon;
revoke all on function public.mobile_complete_signature(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.mobile_sign(jsonb) to authenticated;
grant execute on function public.mobile_complete_signature(uuid, text, timestamptz, text) to authenticated;
