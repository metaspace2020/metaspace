from fabric.decorators import task, roles

from fabric.api import run, local, env, hosts, sudo
from fabric.colors import green
from fabric.contrib.project import rsync_project, put
from fabric.contrib.files import append
from fabric.tasks import execute
from fabric.context_managers import cd

from pprint import pprint
import json
from os import environ
from time import sleep
from os.path import dirname, realpath, join


env.roledefs = {
    'dev_master': ['ubuntu@54.171.149.242'],
    'dev_web': ['ubuntu@52.19.27.255'],
    'demo_web': ['ubuntu@52.50.109.217']
}


def full_path(path=''):
    return join(dirname(__file__), path)


def remote_full_path(path=''):
    return join('/home/ubuntu/sm', path)


conf_path = 'conf/fabric.json'
with open(conf_path) as f:
    print green('Loading fabric config from {}'.format(conf_path))
    conf = json.load(f)
    print conf
    for k, v in conf.items():
        env[k] = v


def get_inst_id(inst_name, status):
    out = json.loads(local('aws ec2 describe-instances --filter "Name=tag:Name,Values={}" "Name=instance-state-name,Values={}"'.format(inst_name, status), capture=True))
    pprint(out)
    return out['Reservations'][0]['Instances'][0]['InstanceId']


@task
def webserver_start(inst_name='sm-dev-webserver'):
    print green('========= Starting webserver instance =========')
    inst_id = get_inst_id(inst_name, 'stopped')
    local('aws ec2 start-instances --instance-ids={}'.format(inst_id))
    sleep(60)
    run('supervisord -l /home/ubuntu/supervisord.log')


@task
def webserver_stop(inst_name='sm-dev-webserver'):
    print green('========= Stopping webserver instance =========')
    inst_id = get_inst_id(inst_name, 'running')
    local('aws ec2 stop-instances --instance-ids={}'.format(inst_id))


@task
def webserver_deploy(delete=False):
    print green('========= Code deployment to SM webserver =========')
    rsync_project(remote_dir='/home/ubuntu/', exclude=['.*', '*.pyc', 'conf', 'logs', 'data'], delete=delete)
    run('supervisorctl restart all')


# def run_spark_ec2_script(command, cluster_name, slaves=1, price=0.07):
#     cmd = '''/opt/dev/spark-1.4.0/ec2/spark-ec2 --key-pair=sm_spark_cluster --identity-file={0} --ami ami-0e451a79 \
# --region=eu-west-1 --slaves={1} --instance-type=m3.large --master-instance-type=m3.medium --copy-aws-credentials \
# --spot-price={2} {3} {4}'''.format(env['cluster_key_file'], slaves, price, command, cluster_name)
#     local(cmd)


# @task
# def cluster_launch():
#     print green('========= Launching Spark cluster =========')
#     # local('rm conf/SPARK_MASTER')
#     # run_spark_ec2_script('launch', name, slaves=slaves, price=price)
#     # info = get_aws_instance_info(name)
#     # spark_master_host = info['Reservations'][0]['Instances'][0]['PublicDnsName']
#
#     print 'Spark master host: {}'.format(spark_master_host)
#     with open('conf/SPARK_MASTER', 'w') as f:
#         f.write(spark_master_host)


# @hosts(get_spark_master_host())
# @task
# def cluster_config():
#     env.host_string = get_spark_master_host()[0]
#     print green('========= Configuring Spark cluster =========')
#     # print get_spark_master_host()
#     # print env.host_string
#
#     # text = "\nexport AWS_ACCESS_KEY_ID={} \nexport AWS_SECRET_ACCESS_KEY={}".format(environ['AWS_ACCESS_KEY_ID'], environ['AWS_SECRET_ACCESS_KEY'])
#     # append('/root/spark/conf/spark-env.sh', text)


@task
@roles('dev_master')
def cluster_deploy(delete=False):
    print green('========= Code deployment to Spark cluster =========')
    run('mkdir -p /home/ubuntu/sm')
    rsync_project(local_dir='engine scripts test test_runner.py', remote_dir='/home/ubuntu/sm/', delete=delete,
                  exclude=['.*', '*.pyc'])
    run('cd /home/ubuntu/sm; rm sm.zip; zip -rq sm.zip engine __init__.py')


@task
@roles('dev_master')
def cluster_stop():
    print green('========= Stopping Spark cluster =========')
    HADOOP_HOME = '/opt/dev/hadoop-2.6.2'
    SPARK_HOME = '/opt/dev/spark-1.5.1-bin-hadoop2.6'

    print 'Stopping HDFS and Spark...'
    run('{}/sbin/stop-dfs.sh'.format(HADOOP_HOME))
    run('{}/sbin/stop-all.sh'.format(SPARK_HOME))

    print 'Terminating slaves...'
    out = run('cat {}/etc/hadoop/slaves'.format(HADOOP_HOME))
    slaves = filter(lambda h: h != 'localhost', [h.strip() for h in out.split('\n')])

    desc_cmd = 'aws ec2 describe-instances --filters "Name=private-dns-name,Values={}"'.format(','.join(slaves))
    out = json.loads(local(desc_cmd, capture=True))
    for res_out in out['Reservations']:
        for inst_out in res_out['Instances']:
            inst_id = inst_out['InstanceId']
            term_cmd = 'aws ec2 terminate-instances --instance-ids {}'.format(inst_id)
            local(term_cmd)

    print 'Stopping master...'
    master_inst = 'i-54c44cd9'
    stop_cmd = 'aws ec2 stop-instances --instance-ids={}'.format(master_inst)
    local(stop_cmd)


@task
@roles('dev_master')
def cluster_start(slave_type='c4.2xlarge', slaves=0):
    print green('========= Starting Spark cluster =========')
    HADOOP_HOME = '/opt/dev/hadoop-2.6.2'
    SPARK_HOME = '/opt/dev/spark-1.5.1-bin-hadoop2.6'

    print 'Starting master...'
    master_inst_name = 'sm-dev-master'
    master_ints_id = get_inst_id(master_inst_name, 'stopped')
    local('aws ec2 start-instances --instance-ids={}'.format(master_ints_id))
    sleep(60)

    if slaves > 0:
        slave_ami_id = 'ami-18f97a6b'
        run_slave_cmd = ('aws ec2 run-instances --image-id {} --instance-type {} --count {} '
                         '--key-name sm_spark_cluster --security-group-ids sg-921b7ff6').format(slave_ami_id, slave_type, slaves)
        out = json.loads(local(run_slave_cmd, capture=True))
        slave_hosts = [inst_out['PrivateDnsName'] for inst_out in out['Instances']]
        sleep(100)

        with cd(HADOOP_HOME):
            run('echo "localhost" > etc/hadoop/slaves')
            for host in slave_hosts:
                run('echo "{}" >> etc/hadoop/slaves'.format(host))
            run('sbin/start-dfs.sh')

        with cd(SPARK_HOME):
            run('echo "localhost" > conf/slaves')
            for host in slave_hosts:
                run('echo "{}" >> conf/slaves'.format(host))
            run('sbin/start-all.sh')
    else:
        with cd(HADOOP_HOME):
            run('echo "localhost" > etc/hadoop/slaves')
            run('sbin/start-dfs.sh')

        with cd(SPARK_HOME):
            run('echo "localhost" > conf/slaves')
            run('sbin/start-all.sh')

    run('jps -l')

# @task
# def platform_start(cluster_name, slaves=1, price=0.07, components=['webserver', 'cluster']):
#     # launch
#     if 'webserver' in components:
#         execute(webserver_start)
#
#     if 'cluster' in components:
#         # execute(cluster_launch, name=cluster_name, slaves=slaves, price=price)
#         execute(cluster_launch, name=cluster_name, slaves=slaves, price=price)
#
#     # deploy and configure
#     if 'webserver' in components:
#         execute(webserver_deploy)
#
#     if 'cluster' in components:
#         # execute(cluster_config)
#         execute(cluster_deploy)
#
#
# @task
# def platform_stop(cluster_name):
#     execute(cluster_terminate, name=cluster_name)
#     execute(webserver_stop)









