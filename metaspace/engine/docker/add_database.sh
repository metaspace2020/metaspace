#!/usr/bin/env bash
docker-compose run --rm web bash -c "bash /code/SM_distributed/docker/.scripts/add_database_wrapper.sh $1 $2"
