cd /opt/dev/metaspace/metaspace/engine

pip install -qr requirements.txt
pip install -e .

python -m scripts.import_scoring_model v3_default "../scoring-models/v3_default/v2.20230517_(METASPACE-ML).cbm" sm-engine-dev
