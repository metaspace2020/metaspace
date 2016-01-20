#/usr/bin/env bash
# usage: docker-compose run --rm web bash docker/run_unittests.sh
#       --rm flag is important, because web has restart:always policy,
#       and without the flag docker will try to spin the container indefinitely

source docker/env.sh
cp docker/config.json conf/config.json
cp conf/sm_log.cfg.template conf/sm_log.cfg
python test_runner.py -u
