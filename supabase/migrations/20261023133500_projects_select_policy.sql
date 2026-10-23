-- La politique SELECT est évaluée sur le RETURNING d'un INSERT : une fonction STABLE qui relit
-- public.projects ne voit pas encore la nouvelle ligne. On évalue donc les colonnes de la ligne.
create or replace function private.is_project_member(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_members pm
                 where pm.project_id = p_project_id and pm.collaborator_id = private.current_collaborator_id())
$$;
revoke execute on function private.is_project_member(uuid) from public, anon;
grant execute on function private.is_project_member(uuid) to authenticated;

drop policy projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (account_id in (select private.accessible_account_ids())
         or (published and organization_id = (select private.current_org_id()))
         or (select private.is_project_member(id)));
