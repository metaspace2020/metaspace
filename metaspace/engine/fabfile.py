__author__ = 'intsco'

from fabric.api import run, local, env, hosts
from fabric.colors import green
from fabric.contrib.project import rsync_project
from fabric.contrib.files import append
from fabric.context_managers import shell_env

import json
from os import environ


conf_path = 'conf/fabric.json'
with open(conf_path) as f:
    print green('Loading fabric config from {}'.format(conf_path))
    conf = json.load(f)
    print conf
    for k, v in conf.items():
        env[k] = v


def get_spark_master_host():
    return 'root@' + open('conf/SPARK_MASTER').readline().strip('\n')


def get_webserver_host():
    return ['ubuntu@sm-webserver']


@hosts(get_webserver_host())
def webserver_start():
    print green('========= Start webserver instance =========')

    local('aws configure set default.region eu-west-1')
    local('aws ec2 start-instances --instance-ids=i-9fdcdf32')

    run('luigid --background --logdir /home/ubuntu/luigi_logs', pty=False)


@hosts(get_webserver_host())
def webserver_deploy():
    print green('========= Code deployment to SM webserver =========')

    run('mkdir -p /home/ubuntu/sm/data')
    rsync_project(remote_dir='/home/ubuntu/sm', exclude=['.*', '*.pyc'])


# @hosts(get_webserver_host())
# def webserver_config():
#     run('export LUIGI_CONFIG_PATH=/home/ubuntu/sm/webserver/conf/luigi_log.cfg')

def get_aws_instance_info(name):
    out = local('aws ec2 describe-instances --filter "Name=tag:Name,Values={}-master-*"\
                "Name=instance-state-name,Values=running"'.format(name),
                capture=True)
    return json.loads(out.stdout)


def cluster_launch(name, slaves=1, price=0.06):
    print green('========= Spark cluster start =========')

    cmd = '''/opt/dev/spark-1.4.0/ec2/spark-ec2 --key-pair=sm_spark_cluster --identity-file={0} \
--region=eu-west-1 --slaves={1} --instance-type=m3.large --master-instance-type=m3.medium --copy-aws-credentials \
--spot-price={2} launch {3}'''.format(env['cluster_key_file'], slaves, price, name)
    local(cmd)

    info = get_aws_instance_info(name)
    spark_master_host = info['Reservations'][0]['Instances'][0]['PublicDnsName']
    print 'Spark master host: {}'.format(spark_master_host)
    with open('conf/SPARK_MASTER', 'w') as f:
        f.write(spark_master_host)


@hosts(get_spark_master_host())
def cluster_config():
    text = "\nexport AWS_ACCESS_KEY_ID={} \nexport AWS_SECRET_ACCESS_KEY={}".format(environ['AWS_ACCESS_KEY_ID'], environ['AWS_SECRET_ACCESS_KEY'])
    append('/root/spark/conf/spark-env.sh', text)


@hosts(get_spark_master_host())
def cluster_deploy():
    print green('========= Code deployment to Spark cluster =========')
    run('mkdir -p /root/sm/data')
    rsync_project(local_dir='engine scripts', remote_dir='/root/sm/', exclude=['.*', '*.pyc'])
    run('cd /root/sm; zip -r engine.zip engine')


def cluster_destroy(name):
    cmd = '''{0}/ec2/spark-ec2 --key-pair=sm_spark_cluster --identity-file={1} \
--region=eu-west-1 destroy {2}'''.format(environ['SPARK_HOME'], env['cluster_key_file'], name)
    local(cmd)


@hosts(get_webserver_host())
def platform_start(cluster_name, slaves=1, price=0.06, components=['webserver', 'cluster']):
    # launch
    if 'webserver' in components:
        webserver_start()

    if 'cluster' in components:
        cluster_launch(name=cluster_name, slaves=slaves, price=price)

    # deploy and configure
    if 'webserver' in components:
        webserver_deploy()

    if 'cluster' in components:
        cluster_config()
        cluster_deploy()

