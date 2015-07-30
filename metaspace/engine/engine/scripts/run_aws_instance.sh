#!/bin/bash

if [ $# -lt 2 ]; then
    echo "Usage: ./run_aws_instance credentials.pem aws_server_compute.amazonaws.com"
    exit
fi

timestamp=`date +"%s"`

echo "Running on $2."
echo "Copying queries.pkl..."
scp -i $1 queries.pkl root@$2:~/

echo "Increasing memory size in spark-env..."
ssh -i $1 root@$2 'echo "export SPARK_DRIVER_MEMORY=7g" >> ~/spark/conf/spark-env.sh'
ssh -i $1 root@$2 'echo "export SPARK_DRIVER_MEMORY=7g" >> ~/spark/conf/spark-env.sh'

echo "All done!"
