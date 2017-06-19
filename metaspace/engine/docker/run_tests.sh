#/usr/bin/env bash
# usage: docker-compose run --rm web bash docker/run_unittests.sh
#       --rm flag is important, because web has restart:always policy,
#       and without the flag docker will try to spin the container indefinitely

source docker/env.sh
cp docker/config.json conf/test_config.json
cp conf/sm_log.cfg.template conf/sm_log.cfg
mkdir -p /code/sm-engine/logs

coverage run --source=./sm/engine --omit=./sm/engine/tests/* -m py.test sm/engine/tests tests && coveralls
