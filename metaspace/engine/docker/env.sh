source activate sm_engine
cd /code/sm-engine
pip install -U --upgrade-strategy only-if-needed git+https://github.com/alexandrovteam/pyImagingMSpec
pip install -U --upgrade-strategy only-if-needed .
export PYTHONPATH=.:/root/spark-2.0.2-bin-hadoop2.7/python:$PYTHONPATH
