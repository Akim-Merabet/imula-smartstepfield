-- App mobile terrain : validation et ouverture d'étape envoyées depuis la file hors ligne (spec 05 §4.3, §9.6).

-- 1. Un flow déverrouillé (« chef de chantier », flows.fill_restrictions_skipped) n'a plus d'étape bloquée par le séquencement.
create or replace function private.step_sequence_blockers(p_step_id uuid)
 returns uuid[]
 language plpgsql
 stable
 set search_path to ''
as $function$
declare s public.steps; v_default public.sequencing_type; v_out uuid[];
begin
  select * into s from public.steps where id = p_step_id;
  if s.id is null then return '{}'; end if;
  if exists (select 1 from public.step_fill_unlocks u where u.step_id = p_step_id) then return '{}'; end if;
  if exists (select 1 from public.flows f where f.id = s.flow_id and f.fill_restrictions_skipped) then return '{}'; end if;
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
end $function$;

-- 2. Validation d'étape venant de l'appareil : mêmes contrôles que la WebApp (re-vérifiés à l'envoi), date de
--    validation locale (bornée à maintenant), source « mobile ». Rejouable : une étape déjà validée est acceptée.
--    Retour : liste vide si validée, sinon les éléments manquants ('sequence', 'dsi', 'form', 'multi_pr').
create or replace function public.mobile_validate_step(p_step_id uuid, p_validated_at timestamptz default null)
 returns text[]
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare s public.steps; v_missing text[]; v_me uuid := private.current_collaborator_id();
begin
  select * into s from public.steps where id = p_step_id;
  if s.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.can_write_flow(s.flow_id, 'operator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if s.validated_at is not null then return '{}'; end if;
  if s.disabled then return array['step_disabled']; end if;
  if coalesce(array_length(private.step_sequence_blockers(p_step_id), 1), 0) > 0 then return array['sequence']; end if;
  v_missing := private.step_missing_mandatory(p_step_id);
  if array_length(v_missing, 1) > 0 then return v_missing; end if;
  update public.steps
     set validated_at = least(coalesce(p_validated_at, now()), now()), validated_by = v_me, validation_source = 'mobile'
   where id = p_step_id;
  insert into public.flow_events (flow_id, event_type, actor_id, phase_id, step_id)
  values (s.flow_id, 'validate_step', v_me, s.phase_id, s.id);
  return '{}';
end $function$;

-- 3. Première ouverture d'une étape sur l'appareil (pastille grise → bleue, décision du 2026-10-24).
create or replace function public.mobile_mark_step_opened(p_step_id uuid, p_opened_at timestamptz default null)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not exists (select 1 from public.steps where id = p_step_id) then raise exception 'not found' using errcode = 'P0002'; end if;
  update public.steps set first_opened_at = least(coalesce(p_opened_at, now()), now())
   where id = p_step_id and first_opened_at is null and private.can_write_flow(flow_id, 'operator');
end $function$;

revoke all on function public.mobile_validate_step(uuid, timestamptz) from public, anon;
revoke all on function public.mobile_mark_step_opened(uuid, timestamptz) from public, anon;
grant execute on function public.mobile_validate_step(uuid, timestamptz) to authenticated;
grant execute on function public.mobile_mark_step_opened(uuid, timestamptz) to authenticated;
