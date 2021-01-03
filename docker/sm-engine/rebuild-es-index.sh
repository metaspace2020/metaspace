#!/usr/bin/env bash

cd /opt/dev/metaspace/metaspace/engine
conda env update

source activate sm

python -m scripts.create_es_index --drop

python -m scripts.update_es_index --ds-name %