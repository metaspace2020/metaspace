#!/usr/bin/env bash

export PATH=~/miniconda2/bin:$PATH
source activate sm_engine
export SPARK_HOME=$HOME/spark-1.6.0-bin-hadoop2.6/
export PYTHONPATH=.:$SPARK_HOME/python:$PYTHONPATH
cp conf/sm_log.cfg.template conf/sm_log.cfg
python scripts/run_molecule_search.py --config macosx/config.json.template "$@"
