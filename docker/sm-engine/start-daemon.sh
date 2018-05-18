#!/usr/bin/env bash

source activate sm

if [ "$SM_DOCKER_ENV" = "development" ]; then
  cd /opt/dev/sm-engine
  conda env update
else
  cd /opt/sm-engine
fi

# export PYSPARK_PYTHON=python3
# export SPARK_HOME=$(python -c "
# import pyspark;
# from inspect import getfile;
# from os.path import dirname;
# print(dirname(getfile(pyspark)))
# ")

exec python -m scripts.run_sm_daemon
