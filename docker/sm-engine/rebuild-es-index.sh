#!/usr/bin/env bash

if [ "$SM_DOCKER_ENV" = "development" ]; then
  cd /opt/dev/metaspace/metaspace/engine
  conda env update
else
  cd /opt/metaspace/metaspace/engine
fi

source activate sm

python -m scripts.create_es_index --drop

python -m scripts.update_es_index --ds-name %