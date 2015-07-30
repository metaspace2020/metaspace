#!/bin/bash

if [ $# -lt 7 ]; then
    echo "Usage: ./run_aws_dataset credentials.pem aws_server_compute.amazonaws.com aws_access_key aws_secret_key s3n_address rows columns"
    exit
fi

timestamp=`date +"%s"`

echo "Running on $2; current timestamp is $timestamp."
echo "      === [1] Copying python scripts ==="
scp -i $1 engine/util.py engine/computing.py engine/blockentropy.py engine/run_process_dataset.py root@$2:~/

echo "      === [2] Running the job remotely ==="
ssh -i $1 root@$2 "~/spark/bin/spark-submit --py-files=blockentropy.py,util.py,computing.py run_process_dataset.py --ds=s3n://$3:$4@$5 --rows=$6 --cols=$7 --queries=queries.pkl"

wait

echo "      === [3] Copying the results back ==="
scp -i $1 root@$2:~/result.pkl result.$timestamp.pkl

echo "      === [4] Adding results to the database ==="
python engine/run_insert_to_db.py --in=result.$timestamp.pkl

echo "All done!"
