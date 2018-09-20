source activate sm_engine
cd ~/metaspace/metaspace/engine
pip install -U pip
pip install -U --upgrade-strategy only-if-needed --process-dependency-links .
export PYTHONPATH=.:/root/spark-2.3.0-bin-hadoop2.7/python:$PYTHONPATH
