#!/usr/bin/env bash

. /sm-engine/start-common.sh

# TODO: wrap this in a python script so that these credentials can be read from a config file.
if [ "$( PGPASSWORD=password psql -U sm -d postgres -h postgres -tAc "SELECT 1 FROM pg_database WHERE datname='sm'" )" != '1' ]; then
  echo "Creating database sm"
  PGPASSWORD=password psql -U sm -d postgres -h postgres -c "CREATE DATABASE sm OWNER sm;"
fi

# graphql owns the schema (its TypeORM migrations run when it starts). On a fresh clone that
# is minutes after this container starts, so don't serve requests until the tables exist
schema_exists() {
  [ "$( PGPASSWORD=password psql -U sm -d sm -h postgres -tAc "SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'dataset')" 2>/dev/null )" = 't' ]
}
wait_for schema_exists "Database schema (created by graphql)"

curl -I http://elasticsearch:9200/sm 2>/dev/null | head -1 | grep 404 >/dev/null
if [ $? == 0 ]; then
  echo "Creating Elasticsearch index"
  python -m scripts.manage_es_index create
fi

exec python -m sm.rest.api
