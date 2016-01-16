#!/usr/bin/env bash
docker-compose build
cp ../conf/sm_log.cfg.template ../conf/sm_log.cfg
wget -N https://s3-eu-west-1.amazonaws.com/sm-engine/hmdb_agg_formula.sql &&\
docker-compose up
