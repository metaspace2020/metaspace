echo 'localhost:5432:sm:password\n' > ~/.pgpass
chmod 0600 ~/.pgpass

mkdir -p logs
cp docker/sci_test_config.json conf/config.json

pip install --upgrade -r requirements.txt
pip install -e .
export PYTHONPATH=.:/root/spark-2.3.0-bin-hadoop2.7/python:$PYTHONPATH
