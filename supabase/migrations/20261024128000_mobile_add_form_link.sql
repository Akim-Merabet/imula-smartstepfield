-- App mobile terrain : « Ajouter un formulaire » / « Déclarer un aléa » (spec 05 §4.7.8).
-- Lie un formulaire générique actif de l'entité à l'étape (bloc Formulaires créé s'il n'existe pas), pour y répondre
-- aussitôt, hors ligne compris. Identifiants du lien et du bloc générés par l'appareil : rejouable.
create or replace function public.mobile_add_form_link(p jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_step public.steps;
  v_form public.forms;
  v_block public.blocks;
  v_block_id uuid := nullif(p ->> 'block_id', '')::uuid;
  v_project uuid;
  v_err text;
  v_me uuid := private.current_collaborator_id();
begin
  if v_id is null then raise exception 'INVALID' using errcode = 'P0001'; end if;
  if exists (select 1 from public.form_block_links where id = v_id) then return; end if;

  select * into v_step from public.steps where id = (p ->> 'step_id')::uuid;
  if v_step.id is null then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if not private.can_sign_flow(v_step.flow_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_err := private.mobile_step_writable(v_step.id);
  if v_err is not null then raise exception '%', v_err using errcode = 'P0001'; end if;
  select f.project_id into v_project from public.flows f where f.id = v_step.flow_id;

  -- Formulaire générique (remontée d'informations / aléa) actif de la même entité.
  select * into v_form from public.forms where id = (p ->> 'form_id')::uuid;
  if v_form.id is null or v_form.project_id is distinct from v_project or v_form.nature <> 'generic'
     or not v_form.enabled or v_form.archived or v_form.deleted_at is not null then
    raise exception 'FORM_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- Une remontée terrain n'est pas une modification de contenu : autorisée aussi sur un flow issu d'un référentiel.
  perform set_config('app.referential_sync', 'on', true);
  select * into v_block from public.blocks where step_id = v_step.id and type = 'form';
  if v_block.id is null then
    insert into public.blocks (id, step_id, flow_id, type, enabled, state, created_by, updated_by)
    values (coalesce(v_block_id, gen_random_uuid()), v_step.id, v_step.flow_id, 'form', true, 'validated', v_me, v_me)
    returning * into v_block;
  elsif not v_block.enabled then
    perform set_config('app.referential_sync', '', true);
    raise exception 'BLOCK_DISABLED' using errcode = 'P0001';
  end if;

  -- L'appareil réutilise un lien existant pour le même formulaire ; s'il en crée un (lien ajouté entre-temps sur la
  -- WebApp), on le garde pour que les réponses déjà rattachées à cet identifiant restent valides.
  insert into public.form_block_links (id, block_id, step_id, flow_id, form_id, position)
  values (v_id, v_block.id, v_step.id, v_step.flow_id, v_form.id,
          coalesce((select max(position) from public.form_block_links where block_id = v_block.id), 0) + 1);
  perform set_config('app.referential_sync', '', true);
end $function$;

revoke all on function public.mobile_add_form_link(jsonb) from public, anon;
grant execute on function public.mobile_add_form_link(jsonb) to authenticated;
