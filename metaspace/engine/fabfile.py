__author__ = 'intsco'

from fabric.api import run, local, env, hosts
from fabric.colors import green
from fabric.contrib.project import rsync_project
from fabric.contrib.files import append

import json


conf_path = 'conf/fabric.json'
with open(conf_path) as f:
    print green('Loading fabric config from {}'.format(conf_path))
    conf = json.load(f)
    env.hosts = conf['hosts']
    env.key_filename = conf['key_files']


def get_spark_master_host():
    return 'root@' + open('conf/SPARK_MASTER').readline().strip('\n')


def get_webserver_host():
    return 'ubuntu@sm-webserver'


@hosts(get_webserver_host())
def webserver_start():
    print green('========= [1] Start webserver instance =========')

    local('aws configure set default.region eu-west-1')
    local('aws ec2 start-instances --instance-ids=i-9fdcdf32')

    run('luigid --background --logdir /home/ubuntu/luigi_logs', pty=False)


@hosts(get_webserver_host())
def webserver_deploy():
    print green('========= [2] Code deployment to SM webserver =========')

    run('mkdir -p /home/ubuntu/sm/data')
    rsync_project(remote_dir='/home/ubuntu/sm', exclude=['.*', '*.pyc'])


@hosts(get_webserver_host())
def cluster_launch(name, slaves=1, price=0.05):
    print green('========= [3] Spark cluster start =========')

    cmd = '''/opt/dev/spark-1.4.1-bin-hadoop2.4/ec2/spark-ec2 --key-pair=sm_spark_cluster --identity-file=/home/ubuntu/.ssh/sm_spark_cluster.pem\
    --region=eu-west-1 --slaves={} --instance-type=m3.large --master-instance-type=m3.medium --copy-aws-credentials\
    --ami=ami-c49acbb3 --spot-price={} launch {}'''.format(slaves, price, name)
    run(cmd)

    out = local('aws ec2 describe-instances --filter "Name=tag:Name,Values={}-master-*"\
                                                    "Name=instance-state-name,Values=running"'.format(name),
                capture=True)
    res = json.loads(out.stdout)
    spark_master_host = res['Reservations'][0]['Instances'][0]['PublicDnsName']
    print 'Spark master host: {}'.format(spark_master_host)
    with open('conf/SPARK_MASTER', 'w') as f:
        f.write(spark_master_host)


@hosts(get_spark_master_host())
def cluster_config():
    text = "\nexport AWS_ACCESS_KEY_ID=AKIAIHSHCY7SBXNFGARQ \nexport AWS_SECRET_ACCESS_KEY=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"
    append('/root/spark/conf/spark-env.sh', text)


@hosts(get_spark_master_host())
def cluster_deploy():
    print green('========= [3] Code deployment to Spark cluster =========')
    run('mkdir -p /root/sm/data')
    rsync_project(local_dir='engine scripts', remote_dir='/root/sm/', exclude=['.*', '*.pyc'])
    run('cd /root/sm; zip -r engine.zip engine')


def platform_start(cluster_name, slaves=1, price=0.05):
    webserver_start()
    webserver_deploy()
    cluster_launch(name=cluster_name, slaves=slaves, price=price)
    cluster_config()
    cluster_deploy()


