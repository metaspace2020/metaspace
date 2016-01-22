#!/usr/bin/env bash
docker-compose build
cp ../conf/sm_log.cfg.template ../conf/sm_log.cfg
docker-compose up
