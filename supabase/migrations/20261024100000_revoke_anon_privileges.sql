-- Défense en profondeur : « anon » n'accède à aucune table/séquence du schéma public
-- (le partage externe passe par des routes serveur avec le rôle service).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
