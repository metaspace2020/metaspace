# Ansible project for setting up machines running SM engine
Check https://github.com/SpatialMetabolomics/sm-engine for more information about the SM engine

## Installation
Make sure you have the following tools installed:
* [VirtualBox 5.0.12](https://www.virtualbox.org/wiki/Downloads)
* [Vagrant 1.8.1](https://www.vagrantup.com/downloads.html)
* [ansible 2.0.2](http://docs.ansible.com/ansible/intro_installation.html#latest-releases-via-pip)

`git clone https://github.com/intsco/sm-engine-ansible.git`

## Setting up single instance SM engine in Virtual Box

`cd vbox`

`cp group_vars/all.yml.template group_vars/all.yml`

Put the SM engine version of interest into group_vars/all.yml as value for the sm_branch variable

Create a pair of keys if you do not have one. This installation imply the private key name to be `id_rsa`

`ssh-keygen -t rsa`

`vagrant up --provision`

`ansible-playbook provision.yml`


### Run tests

SSH into the virtual machine
 
`ssh -i ~/.ssh/id_rsa -p 2222 ubuntu@127.0.0.1`
 
Initialize Miniconda virtual environment

`cd /opt/dev/sm`

`source /opt/dev/miniconda/bin/activate sm`

Run tests

`scripts/run.sh test_runner.py -u -r`

### Start example molecule annotation job <a id="example-job"></a>

SSH into the virtual machine
 
`ssh -i ~/.ssh/id_rsa -p 2222 ubuntu@127.0.0.1`
 
Initialize Miniconda virtual environment

`cd /opt/dev/sm`

`source /opt/dev/miniconda/bin/activate sm`

`scripts/run.sh scripts/run_molecule_search.py spheroid /opt/dev/sm/tests/data/sci_test_search_job_spheroid_dataset/ /opt/dev/sm/tests/data/sci_test_search_job_spheroid_dataset/config.json`

The first time it will run for quite some time. The progress can be tracked here [http://localhost:4040/stages/](http://localhost:4040/stages/) 

After molecule annotation job is finished run the SM web app

`python sm/webapp/webserver.py --config /opt/dev/sm/conf/config.json --port 8090`

Open [http://localhost:8090](http://localhost:8090) address in a browser and explore the results

## Setting up AWS based SM engine version

`cd aws`

`cp group_vars/all.yml.template group_vars/all.yml`

Put the SM engine version and AWS user credentials into group_vars/all.yml.
Ansible may have issues with AWS credentials containing / symbol so try to generate them without it.

Create a pair of keys with help of AWS console. They will be used for ssh'ing to launched AWS instances

Spin up all needed instances. You will need at least three: web app and db instance, spark master and spark slave ones.
Check `manages_instances.py` script for parameters used for instances launching.

`ansible-playbook -i ec2.py aws_start.yml -e "component=all key_name=NAME_OF_YOUR_AWS_KEY"`

Provision web application and database instance
 
`ansible-playbook -i ec2.py aws_provision_webserver.yml`

If you gen the message "Failed to connect to the host via ssh." try to issue the command

`ansible-playbook aws_clean_cache.yml`

Provision Spark cluster instances
 
`ansible-playbook -i ec2.py aws_provision_spark.yml`

Once provisioning process is finished successfully you can ssh to the Spark master instance (should have sm-spark-master name).
Try to run the example molecule annotation job like [above](#example-job).

To deploy and start the web app the command and open http://AWS_WEB_SERVER_IP_ADDRESS:8080

`ansible-playbook -i ec2.py web_app_deploy.yml`

When you do not need the Spark cluster any more don't forget to stop it.

`ansible-playbook -i ec2.py aws_stop.yml -e "component=all key_name=NAME_OF_YOUR_AWS_KEY"`

## License

This project is licensed under Apache 2.0 license.
