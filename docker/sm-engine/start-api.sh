#!/usr/bin/env bash

. /sm-engine/start-common.sh

# TODO: wrap this in a python script so that these credentials can be read from a config file.
if [ "$( PGPASSWORD=password psql -U sm -d postgres -h postgres -tAc "SELECT 1 FROM pg_database WHERE datname='sm'" )" != '1' ]; then
  echo "Creating database sm"
  PGPASSWORD=password psql -U sm -d postgres -h postgres -c "CREATE DATABASE sm OWNER sm;"
fi
# This condition uses awkward logic to ensure that errors don't get interpreted as the table
# not existing, which could cause any existing data to be dropped when the script is rerun.
if [ "$( PGPASSWORD=password psql -U sm -h postgres -tAc "SELECT NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename='dataset')" )" = 't' ]; then
  echo "Creating database schema"
  PGPASSWORD=password psql -U sm -h postgres -f ./sm/engine/tests/graphql_schema.sql
fi

curl -I http://elasticsearch:9200/sm 2>/dev/null | head -1 | grep 404 >/dev/null
if [ $? == 0 ]; then
  echo "Creating Elasticsearch index"
  python -m scripts.manage_es_index create
fi

exec python -m sm.rest.api
