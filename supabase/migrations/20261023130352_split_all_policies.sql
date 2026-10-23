-- 1) Exposition à la Data API : droits de table pour « authenticated » uniquement (RLS active partout).
--    « anon » n'a aucun accès direct (le partage externe passe par des routes serveur).
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
revoke all on all tables in schema public from anon;

-- 2) Scinde les politiques « FOR ALL » en INSERT / UPDATE / DELETE pour éviter les politiques
--    permissives multiples sur SELECT (lint 0006). La lecture reste couverte par les politiques *_select.
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname, roles, qual, with_check
    from pg_policies
    where schemaname = 'public' and cmd = 'ALL'
  loop
    execute format('create policy %I on %I.%I for insert to %s with check (%s)',
      p.policyname || '_ins', p.schemaname, p.tablename, array_to_string(p.roles, ','),
      coalesce(p.with_check, p.qual));
    execute format('create policy %I on %I.%I for update to %s using (%s) with check (%s)',
      p.policyname || '_upd', p.schemaname, p.tablename, array_to_string(p.roles, ','),
      p.qual, coalesce(p.with_check, p.qual));
    execute format('create policy %I on %I.%I for delete to %s using (%s)',
      p.policyname || '_del', p.schemaname, p.tablename, array_to_string(p.roles, ','), p.qual);
    if not exists (select 1 from pg_policies s
                   where s.schemaname = p.schemaname and s.tablename = p.tablename and s.cmd = 'SELECT') then
      execute format('create policy %I on %I.%I for select to %s using (%s)',
        p.policyname || '_sel', p.schemaname, p.tablename, array_to_string(p.roles, ','), p.qual);
    end if;
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;
