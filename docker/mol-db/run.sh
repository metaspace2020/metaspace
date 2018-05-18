#!/usr/bin/env bash

if [ "$SM_DOCKER_ENV" = "development" ]; then
  # Run conda env update from /tmp because it can't run in a read-only directory
  cd /tmp
  conda env update -p /opt/dev/sm-molecular-db
  cd /opt/dev/sm-molecular-db
else
  cd /opt/mol-db
fi

source activate mol-db
exec gunicorn -b 0.0.0.0:5001 app.main:application --reload
