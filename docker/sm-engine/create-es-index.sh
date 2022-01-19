cd /opt/dev/metaspace/metaspace/engine

pip install -qr requirements.txt
pip install -e .

python -m scripts.manage_es_index create