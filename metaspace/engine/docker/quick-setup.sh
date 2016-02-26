#!/usr/bin/env bash

# docker-compose.yml mounts formula_dbs to /databases directory
mkdir -p formula_dbs

echo "Starting webserver"
docker-compose up -d

echo "Adding HMDB database"
wget https://s3-eu-west-1.amazonaws.com/sm-engine/hmdb.csv -O formula_dbs/hmdb.csv
./add_database.sh HMDB hmdb.csv

echo "Processing an example dataset"
# (the directory is specified in docker-compose.yml and defaults to ../test/data)
./add_dataset.sh spheroid_test sci_test_search_job_spheroid_dataset
