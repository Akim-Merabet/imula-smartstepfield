-- =============================================================================
-- Rôle service (worker de génération PDF, actions d'administration) : droits de table.
-- Les privilèges par défaut du rôle postgres n'accordaient à service_role que D/x/t/m
-- (aucun SELECT / INSERT / UPDATE) : le client service ne pouvait rien lire.
-- service_role contourne la RLS (BYPASSRLS) ; il n'est utilisé que côté serveur.
-- =============================================================================
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- Cloche des événements (spec 00 §5.5) : suivi en temps réel des tâches de fond.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'background_tasks') then
    alter publication supabase_realtime add table public.background_tasks;
  end if;
end $$;
