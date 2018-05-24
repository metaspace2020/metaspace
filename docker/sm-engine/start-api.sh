#!/usr/bin/env bash

. /start-common.sh

# TODO: wrap this in a python script so that these credentials can be read from a config file.
# This condition uses awkward logic to ensure that errors don't get interpreted as the table
# not existing, which could cause any existing data to be dropped when the script is rerun.
if [ "$( PGPASSWORD=password psql -U sm -h postgres -tAc "SELECT NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename='dataset')" )" = 't' ]; then
  echo "Creating database schema"
  PGPASSWORD=password psql -U sm -h postgres -f ./scripts/create_schema.sql
fi

curl -I http://elasticsearch:9200/sm 2>/dev/null | head -1 | grep 404 >/dev/null
if [ $? == 0 ]; then
  echo "Creating Elasticsearch index"
  python -m scripts.create_es_index
fi

exec python -m sm.rest.api
