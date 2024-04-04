#!/usr/bin/env bash

cd /opt/dev/metaspace/metaspace/engine

pip install -qr requirements.txt
pip install -e .

python -m scripts.import_scoring_model --is_default "Animal" "v2.2023-12-14" "../scoring-models/models_default/v2.2023-12-14_(METASPACE-ML_Animal).cbm" sm-engine-dev
python -m scripts.import_scoring_model "Plant" "v2.2023-12-14" "../scoring-models/models_default/v2.2023-12-14_(METASPACE-ML_Plant).cbm" sm-engine-dev
python -m scripts.import_scoring_model --model_type="original" "MSM" "v1"
