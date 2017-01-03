#/usr/bin/env bash
source /miniconda/bin/activate sm_engine
export PYTHONPATH=/code/sm-engine:/root/spark-2.0.2-bin-hadoop2.7/python:$PYTHONPATH
python scripts/run_molecule_search.py $1 /data/$2 /data/$2/config.json --config /code/sm-engine/docker/config.json
