#!/usr/bin/env bash

. /sm-engine/start-common.sh

exec python -m scripts.run_sm_daemon --name=update
