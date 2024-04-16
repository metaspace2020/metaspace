#!/usr/bin/env bash

cd /opt/dev/metaspace/metaspace/engine

pip install -qr requirements.txt
pip install -e .

python -m scripts.import_scoring_model "MSM" "v1" "original"
python -m scripts.import_scoring_model "Animal" "v2.2023-12-14" "catboost" --model="../scoring-models/models_default/v2.2023-12-14_(METASPACE-ML_Animal).cbm" --bucket="sm-engine-dev"
python -m scripts.import_scoring_model "Plant" "v2.2023-12-14" "catboost" --model="../scoring-models/models_default/v2.2023-12-14_(METASPACE-ML_Plant).cbm" --bucket="sm-engine-dev"
