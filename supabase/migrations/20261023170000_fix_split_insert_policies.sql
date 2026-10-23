-- La scission des politiques « FOR ALL » (20261023130352) a donné aux INSERT le seul WITH CHECK d'origine,
-- sans la condition de droits portée par USING. Chaque politique *_ins reprend la condition complète
-- (USING ∧ WITH CHECK) de sa jumelle *_upd.
do $$
declare p record;
begin
  for p in
    select i.tablename, i.policyname, u.qual, u.with_check
    from pg_policies i
    join pg_policies u on u.schemaname = i.schemaname and u.tablename = i.tablename
      and u.policyname = regexp_replace(i.policyname, '_ins$', '_upd') and u.cmd = 'UPDATE'
    where i.schemaname = 'public' and i.cmd = 'INSERT' and i.policyname like '%\_ins'
  loop
    execute format('alter policy %I on public.%I with check ((%s) and (%s))',
      p.policyname, p.tablename, p.qual, coalesce(p.with_check, 'true'));
  end loop;
end $$;
