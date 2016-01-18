#!/usr/bin/env bash
docker-compose run web bash -c "/code/SM_distributed/docker/.scripts/add_dataset_wrapper.sh $1 $2"
