from fabric.decorators import task

__author__ = 'intsco'

from fabric.api import run, local, env, hosts
from fabric.colors import green
from fabric.contrib.project import rsync_project, put
from fabric.contrib.files import append
from fabric.tasks import execute
from fabric.context_managers import cd

import json
from os import environ
from time import sleep
from os.path import dirname, realpath, join

conf_path = 'conf/fabric.json'
with open(conf_path) as f:
    print green('Loading fabric config from {}'.format(conf_path))
    conf = json.load(f)
    print conf
    for k, v in conf.items():
        env[k] = v


def get_spark_master_host():
    try:
        with open('conf/SPARK_MASTER') as f:
            return ['root@' + f.readline().strip('\n')]
    except Exception as e:
        print e
        return 'localhost'


def get_webserver_host():
    return ['ubuntu@sm-webserver']

@task
@hosts(get_webserver_host())
def webserver_start():
    print green('========= Starting webserver instance =========')

    local('aws configure set default.region eu-west-1')
    local('aws ec2 start-instances --instance-ids=i-9fdcdf32')
    sleep(60)

    run('luigid --background --logdir /home/ubuntu/luigi_logs', pty=False)


@task
def webserver_stop():
    print green('========= Stopping webserver instance =========')
    local('aws ec2 stop-instances --instance-ids=i-9fdcdf32')


@task
@hosts(get_webserver_host())
def webserver_deploy():
    print green('========= Code deployment to SM webserver =========')

    rsync_project(remote_dir='/home/ubuntu/', exclude=['.*', '*.pyc', 'data'])
    # rsync_project(local_dir='test/data/', remote_dir='/home/ubuntu/sm/test/data/', exclude=['tmp'])

    # for conf_file in ['conf/config.json', 'conf/luigi.cfg', 'conf/luigi_log.cfg']:
    #     put(local_path=conf_file, remote_path='/home/ubuntu/sm/conf/')


# @hosts(get_webserver_host())
# def webserver_config():
#     run('export LUIGI_CONFIG_PATH=/home/ubuntu/sm/webserver/conf/luigi_log.cfg')

def get_aws_instance_info(name):
    out = local('aws ec2 describe-instances\
    --filter "Name=tag:Name,Values={}-master-*" "Name=instance-state-name,Values=running" '.format(name), capture=True)
    return json.loads(out.stdout)


def run_spark_ec2_script(command, cluster_name, slaves=1, price=0.07):
    cmd = '''/opt/dev/spark-1.4.0/ec2/spark-ec2 --key-pair=sm_spark_cluster --identity-file={0} --ami ami-0e451a79 \
--region=eu-west-1 --slaves={1} --instance-type=m3.large --master-instance-type=m3.medium --copy-aws-credentials \
--spot-price={2} {3} {4}'''.format(env['cluster_key_file'], slaves, price, command, cluster_name)
    local(cmd)


@task
def cluster_launch(name, slaves=1, price=0.07):
    print green('========= Launching Spark cluster =========')
    # local('rm conf/SPARK_MASTER')

    run_spark_ec2_script('launch', name, slaves=slaves, price=price)

    info = get_aws_instance_info(name)
    spark_master_host = info['Reservations'][0]['Instances'][0]['PublicDnsName']
    print 'Spark master host: {}'.format(spark_master_host)
    with open('conf/SPARK_MASTER', 'w') as f:
        f.write(spark_master_host)


# @hosts(get_spark_master_host())
@task
def cluster_config():
    env.host_string = get_spark_master_host()[0]
    print green('========= Configuring Spark cluster =========')
    # print get_spark_master_host()
    # print env.host_string

    text = "\nexport AWS_ACCESS_KEY_ID={} \nexport AWS_SECRET_ACCESS_KEY={}".format(environ['AWS_ACCESS_KEY_ID'], environ['AWS_SECRET_ACCESS_KEY'])
    append('/root/spark/conf/spark-env.sh', text)


# @hosts(get_spark_master_host())
@task
def cluster_deploy():
    env.host_string = get_spark_master_host()[0]
    print green('========= Code deployment to Spark cluster =========')
    run('mkdir -p /root/sm/data')
    rsync_project(local_dir='engine scripts test', remote_dir='/root/sm/', exclude=['.*', '*.pyc', 'test'])
    run('cd /root/sm; zip -r engine.zip engine')

@task
def cluster_terminate(name):
    print green('========= Destroying Spark cluster =========')
    cmd = '''{0}/ec2/spark-ec2 --key-pair=sm_spark_cluster --identity-file={1} \
--region=eu-west-1 destroy {2}'''.format(environ['SPARK_HOME'], env['cluster_key_file'], name)
    local(cmd)


# @hosts(get_webserver_host())
@task
def cluster_stop(name):
    print green('========= Stopping Spark cluster =========')
    run_spark_ec2_script('stop', name)


@hosts(get_webserver_host())
@task
def cluster_start(name):
    print green('========= Starting Spark cluster =========')
    run_spark_ec2_script('start', name)


@task
def platform_start(cluster_name, slaves=1, price=0.07, components=['webserver', 'cluster']):
    # launch
    if 'webserver' in components:
        execute(webserver_start)

    if 'cluster' in components:
        # execute(cluster_launch, name=cluster_name, slaves=slaves, price=price)
        execute(cluster_launch, name=cluster_name, slaves=slaves, price=price)

    # deploy and configure
    if 'webserver' in components:
        execute(webserver_deploy)

    if 'cluster' in components:
        execute(cluster_config)
        execute(cluster_deploy)


@task
def platform_stop(cluster_name):
    execute(cluster_terminate, name=cluster_name)
    execute(webserver_stop)


@task
@hosts(get_webserver_host())
def deploy_test_data():
    rsync_project(local_dir='test/data/blackbox_pipeline_test', remote_dir='/home/ubuntu/sm/test/data')








