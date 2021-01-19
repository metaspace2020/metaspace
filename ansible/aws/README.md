# Setting up AWS based SM platform version

Software requirements for the developer machine:
* [Ubuntu 16.04](http://releases.ubuntu.com/16.04/)
* Python>=3.5
* boto3>=1.5
* boto>=2.48
* pyyaml
* [Ansible==2.8.6](http://docs.ansible.com/ansible/intro_installation.html#latest-releases-via-pip)


## First time setup

#### Clone repository and copy config file

```
git clone -b release https://github.com/metaspace2020/metaspace.git
```

#### Clone and setup Ansible config repository

```
cd metaspace/ansible/aws
git clone https://github.com/intsco/metaspace-ansible-config.git
mv metaspace-ansible-config env
```

Put the master password into `<METASPACE_HOME>/ansible/aws/vault_pass.txt`.


#### Go through manual steps in AWS console

* Create IAM user with admin rights for SM engine.
* Create two buckets: one for the engine and one for the web application uploads.
For the web application bucket make sure to allow PUT, POST, and DELETE requests from all hosts in the CORS configuration.
* Create a separate IAM user for the web application. Make sure this user have full access to the web application bucket.
* Create a pair of public/private keys with `ssh-keygen`. Upload the public key to the AWS Console.
It will be used to ssh to instances.
* Create [AWS configuration and credential files](https://docs.aws.amazon.com/cli/latest/userguide/cli-config-files.html)
for the admin IAM user on the developer manchine.

#### Spin up all needed instances

You will need at least three: main instance for the web app, database, RabbitMQ, and Elasticsearch;
Spark master and Spark slave instances.

`ansible-playbook -i env/dev aws_start.yml -e "components=all"`

#### Provision instances

Provision the web services and Spark cluster instances

```
ansible-playbook -i env/dev provision/web.yml
ansible-playbook -i env/dev provision/spark.yml
```

#### Create custom AMIs for Spark master and slave instances

`ansible-playbook -i env/dev create_ami.yml`

This step will take a while.
Once the playbook is finished replace AMI ids for master ans slave instances with new ones in the dev/group_vars/all/vars.yml.
New AMI ids can be found in the AWS Console.

#### Stop Spark master and slave instances

After AMIs were successfully created stop Spark instances.
They will be started automatically from new AMIs after a dataset is uploaded.

`ansible-playbook -i env/dev aws_stop.yml -e "components=master,slave"`

#### Deploy and start the web app and other services

`ansible-playbook -i env/dev deploy/web.yml`

## Start/Stop instances manually

Start all instances

```
ansible-playbook -i env/dev aws_start.yml -e "components=all"
ansible-playbook -i env/dev aws_cluster_setup.yml
```

Deploy and start the web application and other services

`ansible-playbook -i env/dev deploy/web.yml`

To Stop all SM platform instances execute

`ansible-playbook -i env/dev aws_stop.yml -e "components=all"`
