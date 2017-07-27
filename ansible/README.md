# Ansible project for setting up machines running SM platform
Check https://github.com/METASPACE2020/sm-engine for more information about the SM engine

## Installation
Make sure you have the following tools installed:
* [VirtualBox 5.0.12](https://www.virtualbox.org/wiki/Downloads)
* [Vagrant 1.8.1](https://www.vagrantup.com/downloads.html)
* [ansible 2.0.2](http://docs.ansible.com/ansible/intro_installation.html#latest-releases-via-pip)

`git clone https://github.com/intsco/sm-engine-ansible.git`

## Setting up single instance SM engine in Virtual Box

`cd sm-engine-ansible/vbox`

`cp group_vars/all.yml.template group_vars/all.yml`

Create a pair of keys if you do not have one. This installation imply the public key name to be `~/.ssh/id_rsa.pub`

`ssh-keygen -t rsa` # generate a key pair

`vagrant up` # start a virtual machine, initial setup

`ansible-playbook provision.yml` # complete SM platform setup

`ansible-playbook deploy.yml` # deployment of all components

### Run tests

SSH into the virtual machine
 
`ssh -i ~/.ssh/id_rsa -p 2222 ubuntu@127.0.0.1`
 
Initialize Miniconda virtual environment

`cd /opt/dev/sm`

`source /opt/dev/miniconda/bin/activate sm`

Run tests

`scripts/run.sh test_runner.py -u -r`

### Upload a dataset and run molecular annotation

Open `Upload` page [http://localhost:8999/#/upload](http://localhost:8999/#/upload) of the web application

Upload a dataset and check the status at the `Datasets` page. Processing starts automatically after upload.
Once it's finished you can browse the results on the `Annotations` page.

The `Help` page contains other useful information about the web application.

## Setting up AWS based SM platform version

`cd aws`

`cp all.yml.template dev/group_vars/all.yml`

Put the SM engine version, AWS user credentials and other parameters into dev/group_vars/all.yml.

Create a pair of keys with help of the AWS console. They will be used for ssh'ing to launched AWS instances

Spin up all needed instances. You will need at least three: web app and db instance, spark master and spark slave ones.

`ansible-playbook -i dev aws_start.yml -e "component=all"`

`ansible-playbook -i dev aws_cluster_setup.yml`

Provision the web services instance
 
`ansible-playbook -i dev provision/web_server.yml`

Provision Spark cluster instances
 
`ansible-playbook -i dev provision/spark_cluster.yml`

Deploy and start the web app and other services

`ansible-playbook -i dev deploy/web_server.yml`

To stop all SM platform instances

`ansible-playbook -i dev aws_stop.yml -e "component=all`

## License

This project is licensed under Apache 2.0 license.
