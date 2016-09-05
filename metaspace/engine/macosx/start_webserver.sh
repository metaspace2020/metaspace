export PATH=~/miniconda2/bin:$PATH
export SPARK_DIR=spark-1.6.0-bin-hadoop2.6
source activate sm_engine

nohup postgres -D /usr/local/var/postgres >postgres.stdout 2>&1 &
sleep 5

export PYTHONPATH=.:$SPARK_DIR/python:$PYTHONPATH
cp conf/sm_log.cfg.template conf/sm_log.cfg
python webapp/webserver.py --config macosx/config.json.template
