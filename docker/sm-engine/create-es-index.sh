#!/usr/bin/env bash

cd /opt/dev/metaspace/metaspace/engine
export PYTHONPATH="$(pwd)${PYTHONPATH:+:$PYTHONPATH}"

pip install -qr requirements.txt
# pip install -e .

python -m scripts.manage_es_index create