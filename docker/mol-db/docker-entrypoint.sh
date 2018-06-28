#!/usr/bin/env bash

wait_for() {
  if ! $1; then
    echo "Waiting for $2"
    sleep 5
    until $1; do
        printf '.'
        sleep 1
    done
  fi
  echo "$2 is up"
}

if [ "$SM_DOCKER_ENV" = "development" ]; then
  cd /opt/dev/sm-molecular-db
else
  cd /opt/mol-db
fi

# Update conda environment if it has changed since the last run
if [ ! -f "/opt/last-environment.yml" ] || [ "/opt/last-environment.yml" -nt "environment.yml" ] || [ "/opt/last-environment.yml" -ot "environment.yml" ]; then
  echo "Conda env out of date - updating"
  conda env update && cp -p environment.yml /opt/last-environment.yml
else
  echo "Conda env up to date"
fi

wait_for "nc -z postgres 5432" "Postgres"

source activate mol-db
exec gunicorn -b 0.0.0.0:5001 app.main:application --reload
