#!/usr/bin/env bash

. /sm-engine/start-common.sh

python -m scripts.manage_es_index --inactive create
python -m scripts.manage_es_index swap
python -m scripts.manage_es_index --inactive drop

python -m scripts.update_es_index --ds-name %