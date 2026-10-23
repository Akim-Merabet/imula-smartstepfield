#!/usr/bin/env bash
# Rejoue toutes les migrations + le seed dans une base jetable « migcheck » (même conteneur Postgres local),
# puis compare son schéma à la base de développement. Ne modifie pas la base « postgres ».
set -uo pipefail
cd "$(dirname "$0")/.."
CONTAINER=${CONTAINER:-supabase_db_siteflow}
TMP=$(mktemp -d)
ADMIN="docker exec -i $CONTAINER psql -U supabase_admin -q"

docker exec $CONTAINER pg_dump -U postgres -d postgres --schema-only -n auth -n storage -n extensions -n realtime > "$TMP/base.sql"
$ADMIN -d postgres -c "drop database if exists migcheck" -c "create database migcheck owner postgres"
$ADMIN -d migcheck < "$TMP/base.sql" > /dev/null 2>&1   # les politiques storage de nos migrations échouent ici, c'est attendu
$ADMIN -d migcheck -c "alter schema public owner to postgres; grant all on schema public to postgres, anon, authenticated, service_role;"

status=0
for f in supabase/migrations/*.sql supabase/seed.sql; do
  if out=$(docker exec -i $CONTAINER psql -U postgres -d migcheck -v ON_ERROR_STOP=1 -q < "$f" 2>&1); then
    echo "ok    $(basename "$f")"
  else
    echo "FAIL  $(basename "$f")"; echo "$out" | grep -v NOTICE | head -5; status=1; break
  fi
done

Q="select 'table '||table_name from information_schema.tables where table_schema='public'
 union all select 'col '||table_name||'.'||column_name||':'||data_type from information_schema.columns where table_schema='public'
 union all select 'policy '||tablename||'.'||policyname||':'||cmd from pg_policies where schemaname in ('public','storage')
 union all select 'func '||n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
 union all select 'trigger '||event_object_table||'.'||trigger_name from information_schema.triggers where trigger_schema='public'
 union all select 'index '||indexname from pg_indexes where schemaname='public' order by 1"
for db in postgres migcheck; do docker exec $CONTAINER psql -U postgres -d $db -Atc "$Q" > "$TMP/$db.txt"; done
if diff "$TMP/postgres.txt" "$TMP/migcheck.txt" > "$TMP/diff.txt"; then
  echo "Schéma identique à la base de développement ($(wc -l < "$TMP/postgres.txt") objets)."
else
  echo "Dérive entre la base de développement (<) et les migrations (>) :"; head -40 "$TMP/diff.txt"; status=1
fi
rm -rf "$TMP"
exit $status
