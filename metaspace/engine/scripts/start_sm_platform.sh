#!/bin/bash

if [ $# -lt 2 ]; then
    echo "Usage: ./start_sm_platform --name <cluster_name> --slaves <spark_slaves_n> "
    exit
fi

while [[ $# > 0 ]]
    do
    key="$1"

    case $key in
        --name)
        CLUSTER_NAME="$2"
        shift # past argument
        ;;
        --slaves)
        SLAVES_N="$2"
        shift # past argument
        ;;
        *)
        # unknown option
        ;;
    esac
    shift # past argument or value
done

#timestamp=`date +"%s"`

#echo "  === [1] Start webserver instance ===  "
#aws configure set default.region eu-west-1
#aws ec2 start-instances --instance-ids=i-9fdcdf32
#
#echo "Continue?"
#read varname

wait

echo "  === [2] Code deployment to SM webserver ===  "
ssh ubuntu@sm-webserver "mkdir -p /home/ubuntu/sm/data"
rsync -rv ../../webserver ubuntu@sm-webserver:/home/ubuntu/sm

wait

echo "  === [3] Start Spark cluster ===  "
ssh ubuntu@sm-webserver "export AWS_ACCESS_KEY_ID='AKIAIHSHCY7SBXNFGARQ';
export AWS_SECRET_ACCESS_KEY='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';
/opt/dev/spark-1.4.1-bin-hadoop2.4/ec2/spark-ec2 --key-pair=sm_spark_cluster --identity-file=/home/ubuntu/.ssh/sm_spark_cluster.pem --region=eu-west-1 --slaves=${SLAVES_N} --instance-type=m3.large --copy-aws-credentials --ami=ami-c49acbb3 --spot-price=0.03 launch ${CLUSTER_NAME}"

ssh root@spark-master 'echo "" >> ~/spark/conf/spark-env.sh'
ssh root@spark-master 'echo "export AWS_ACCESS_KEY_ID='AKIAIHSHCY7SBXNFGARQ'" >> ~/spark/conf/spark-env.sh'
ssh root@spark-master 'echo "export AWS_SECRET_ACCESS_KEY='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'" >> ~/spark/conf/spark-env.sh'

wait

echo "  === [4] Code deployment to Spark master ===  "
ssh root@spark-master "mkdir -p /root/sm/data"
rsync -rv ../engine ../scripts root@spark-master:/root/sm
ssh root@spark-master "cd /root/sm; zip -r engine.zip engine"

echo "Ready!"
