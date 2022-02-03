cd /opt/dev/metaspace/metaspace/engine

pip install -qr requirements.txt
pip install -e .

python -m scripts.import_scoring_model v3_default ../scoring-models/v3_default/model-2022-01-05T13-45-26.947188-416b1311.cbm sm-engine-dev
