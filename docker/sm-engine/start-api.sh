#!/usr/bin/env bash

source activate sm

echo "Waiting for Postgres to start"
until $(nc -z postgres 5432); do
    printf '.'
    sleep 5
done
echo "Postgres is up"

echo "Waiting for RabbitMQ to start"
until $(nc -z rabbitmq 5672); do
    printf '.'
    sleep 5
done
echo "RabbitMQ is up"

if [ "$SM_DOCKER_ENV" = "development" ]; then
  cd /opt/dev/sm-engine
  conda env update
else
  cd /opt/sm-engine
fi

# Failed attempt to make conda work with a read-only environment
# if [ "$SM_DOCKER_ENV" = "development" ]; then
#   SM_ENGINE_DIR="/opt/dev/sm-engine"
#   # Run conda commands from /tmp because it fails if run from a directory mounted as read-only
#   cd /tmp
#   cp "$SM_ENGINE_DIR/environment.yml" . && conda env update && rm environment.yml
# else
#   SM_ENGINE_DIR="/opt/sm-engine"
# fi
# # Install `sm` as a package as there are self-imports
# # pip install -e $SM_ENGINE_DIR # doesn't work on read-only file system
# echo $SM_ENGINE_DIR > /opt/conda/envs/sm/lib/python3.6/site-packages/sm.egg-link


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
