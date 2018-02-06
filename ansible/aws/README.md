# Setting up AWS based SM platform version

Software requirements for the developer machine:
* [Ubuntu 16.04](http://releases.ubuntu.com/16.04/)
* Python>=3.5
* boto3>=1.5
* boto>=2.48
* [Ansible>=2.4](http://docs.ansible.com/ansible/intro_installation.html#latest-releases-via-pip)


## First time setup

#### Clone repository and copy config file

```
git clone -b rel-v0.8 https://github.com/intsco/sm-engine-ansible.git
cd aws
mkdir dev/group_vars
cp group_vars_all.yml.template dev/group_vars/all.yml
```

#### Go through manual steps in AWS console

* Create IAM user with admin rights for SM engine.
* Create two buckets: one for the engine and one for the web application uploads.
For the web application bucket make sure to allow PUT, POST, and DELETE requests from all hosts in the CORS configuration.
* Create a separate IAM user for the web application. Make sure this user have full access to the web application bucket.
* Create a pair of public/private keys with `ssh-keygen`. Upload the public key to the AWS Console.
It will be used to ssh to instances.

#### Update config file

Specify

* SM platform component versions
* SM engine AWS user credentials, region, and bucket names/paths
* SM web application AWS user credentials
* SSH key name
* Admin emails
* Passwords
* `hostgroup` values for all types of instances

in dev/group_vars/all.yml

Values to be updated are capitalized.

#### Spin up all needed instances

You will need at least three: main instance for the web app, database, RabbitMQ, and Elasticsearch;
Spark master and Spark slave instances.

`ansible-playbook -i dev aws_start.yml -e "components=all"`

#### Provision instances

Provision the web services and Spark cluster instances

```
ansible-playbook -i dev provision/web_server.yml
ansible-playbook -i dev provision/spark_cluster.yml
```

#### Create custom AMIs for Spark master and slave instances

`ansible-playbook -i dev create_ami.yml`

This step will take a while.
Once the playbook is finished replace AMI ids for master ans slave instances with new ones in the dev/group_vars/all.yml.
New AMI ids can be found in the AWS Console.

#### Stop Spark master and slave instances

After AMIs were successfully created stop Spark instances.
They will be started automatically from new AMIs after a dataset is uploaded.

`ansible-playbook -i dev aws_stop.yml -e "components=master,slave"`

#### Deploy and start the web app and other services

`ansible-playbook -i dev deploy/web_server.yml`

## Start/Stop instances manually

Start all instances

```
ansible-playbook -i dev aws_start.yml -e "components=all"
ansible-playbook -i dev aws_cluster_setup.yml
```

Deploy and start the web application and other services

`ansible-playbook -i dev deploy/web_server.yml`

To Stop all SM platform instances execute

`ansible-playbook -i dev aws_stop.yml -e "components=all"`
