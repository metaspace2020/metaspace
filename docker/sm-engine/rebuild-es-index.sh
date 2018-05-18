#!/usr/bin/env bash

if [ "$SM_DOCKER_ENV" = "development" ]; then
  # Run conda env update from /tmp because it can't run in a read-only directory
  cd /tmp
  conda env update -p /opt/dev/sm-engine
  cd /opt/dev/sm-engine
else
  cd /opt/sm-engine
fi

source activate sm

python ./scripts/create_es_index.py --drop

python ./scripts/update_es_index.py --ds-name %