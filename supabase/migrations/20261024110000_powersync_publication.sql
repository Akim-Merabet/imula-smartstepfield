-- Publication logique lue par le service PowerSync (réplication des tables vers les buckets de sync).
-- Seules les tables référencées dans infra/powersync/config/sync-config.yaml sont effectivement synchronisées.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'powersync') then
    create publication powersync for all tables;
  end if;
end $$;
