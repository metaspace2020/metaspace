#!/usr/bin/env bash

export PATH=~/miniconda2/bin:$PATH
source activate sm_distributed
export PYTHONPATH=.:/usr/local/Cellar/apache-spark/1.6.0/libexec/python:$PYTHONPATH
cp conf/sm_log.cfg.template conf/sm_log.cfg
python webapp/webserver.py --config macosx/config.json.template
