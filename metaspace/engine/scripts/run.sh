#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
. $DIR/sm-env.sh

. $SPARK_HOME/conf/spark-env.sh

source activate sm38
exec $@
