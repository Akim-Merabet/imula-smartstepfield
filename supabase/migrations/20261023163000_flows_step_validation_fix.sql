-- Correctif : concaténation text[] dans private.step_missing_mandatory (spec 02 §4.6).
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
        v := array_append(v, 'dsi');
      end if;
    elsif b.type = 'multi_pr' then
      if (b.multi_pr_requires_status and exists (select 1 from public.block_multi_pr_items i
            where i.block_id = b.id and not i.disabled and i.custom_status_id is null))
         or (b.multi_pr_requires_signature and exists (select 1 from public.block_multi_pr_items i
            where i.block_id = b.id and not i.disabled
              and not exists (select 1 from public.block_multi_pr_signatures s where s.item_id = i.id))) then
        v := array_append(v, 'multi_pr');
      end if;
    elsif b.type = 'form' then
      if exists (select 1 from public.form_block_links l where l.block_id = b.id and l.enabled and l.mandatory
                 and not exists (select 1 from public.form_responses r where r.block_link_id = l.id and r.deleted_at is null)) then
        v := array_append(v, 'form');
      end if;
    end if;
  end loop;
  return v;
end $$;

