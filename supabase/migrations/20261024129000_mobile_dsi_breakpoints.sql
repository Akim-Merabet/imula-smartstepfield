-- App mobile terrain : « Paramètres des signatures » d'un bloc Contrôles (spec 05 §4.8).
-- Ajout de points d'arrêt internes / externes supplémentaires ; « une fois rajoutées, les signatures additionnelles ne
-- pourront plus être supprimées » : la RPC n'active que des points d'arrêt, elle n'en retire jamais.
create or replace function public.mobile_add_dsi_breakpoints(p_block_id uuid, p_natures text[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  c public.block_dsi_configs; b public.blocks; f public.flows; v_err text; v_nature text; v_kind text; v_n int;
  v_me uuid := private.current_collaborator_id(); v_flags boolean[];
begin
  select * into b from public.blocks where id = p_block_id;
  if b.id is null or b.type <> 'dsi' or not b.enabled then raise exception 'NO_DSI' using errcode = 'P0001'; end if;
  if not private.can_sign_flow(b.flow_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_err := private.mobile_step_writable(b.step_id);
  if v_err is not null then raise exception '%', v_err using errcode = 'P0001'; end if;
  select * into c from public.block_dsi_configs where block_id = p_block_id;
  if c.block_id is null or c.signatories_status = 'disabled' then raise exception 'NO_DSI' using errcode = 'P0001'; end if;
  select * into f from public.flows where id = b.flow_id;
  if f.simplified_signature_mode then raise exception 'SIMPLIFIED_MODE' using errcode = 'P0001'; end if;

  foreach v_nature in array coalesce(p_natures, '{}') loop
    if v_nature !~ '^breakpoint_(int|ext)_[123]$' then raise exception 'INVALID_NATURE' using errcode = 'P0001'; end if;
    v_kind := split_part(v_nature, '_', 2);
    v_n := split_part(v_nature, '_', 3)::int;
    -- Surveillant applicable : index déclaré sur le flow, ou index 1 si aucun surveillant n'est défini (mode « mono »).
    v_flags := case when v_kind = 'int'
      then array[f.supervision_intern_1, f.supervision_intern_2, f.supervision_intern_3]
      else array[f.supervision_extern_1, f.supervision_extern_2, f.supervision_extern_3] end;
    if not (v_flags[v_n] or (v_n = 1 and not (v_flags[1] or v_flags[2] or v_flags[3]))) then
      raise exception 'SUPERVISOR_NOT_APPLICABLE' using errcode = 'P0001';
    end if;
    if not coalesce((to_jsonb(c) ->> v_nature)::boolean, false) then
      execute format('update public.block_dsi_configs set %I = true where block_id = $1', v_nature) using p_block_id;
      insert into public.signature_events (block_id, flow_id, action, nature, actor_id, source, reason)
      values (p_block_id, b.flow_id, 'update', v_nature::public.signature_nature, v_me, 'mobile', 'add_breakpoint');
    end if;
  end loop;
end $function$;

revoke all on function public.mobile_add_dsi_breakpoints(uuid, text[]) from public, anon;
grant execute on function public.mobile_add_dsi_breakpoints(uuid, text[]) to authenticated;
