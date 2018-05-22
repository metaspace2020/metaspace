#!/usr/bin/env bash

source activate sm

echo "Waiting for Postgres to start"
until $(nc -z postgres 5432); do
    printf '.'
    sleep 5
done
echo "Postgres is up"

echo "Waiting for RabbitMQ to start"
until $(nc -z rabbitmq 5672); do
    printf '.'
    sleep 5
done
echo "RabbitMQ is up"

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
