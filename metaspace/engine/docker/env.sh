source activate sm_engine
cd /code/sm-engine
pip install -U --upgrade-strategy only-if-needed .
export PYTHONPATH=.:/root/spark-2.1.1-bin-hadoop2.7/python:$PYTHONPATH
