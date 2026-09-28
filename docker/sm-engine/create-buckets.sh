#!/usr/bin/env bash
# Creates the buckets the dev stack expects in the storage service (RustFS).
# Idempotent; safe to re-run. Called by setup-dev-env.sh and by hand after
# wiping ${DATA_ROOT}/rustfs:
#   docker-compose run --rm api /sm-engine/create-buckets.sh

cd /opt/dev/metaspace/metaspace/engine

pip install -qr requirements.txt

python -m scripts.create_buckets \
  sm-engine-dev \
  sm-centroids-dev \
  sm-image-storage-dev \
  sm-imzml-browser-dev \
  sm-lithops-temp-dev
