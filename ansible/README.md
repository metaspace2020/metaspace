# Ansible project for setting up machines running SM engine
Check https://github.com/SpatialMetabolomics/SM_distributed for more information about the SM engine

## Installation
Make sure you have the following tools installed:
* [VirtualBox 5.0.12](https://www.virtualbox.org/wiki/Downloads)
* [Vagrant 1.8.1](https://www.vagrantup.com/downloads.html)
* [ansible 2.0.2](http://docs.ansible.com/ansible/intro_installation.html#latest-releases-via-pip)

`git clone https://github.com/intsco/sm-engine-ansible.git`

## Setting up single instance SM engine in Virtual Box

`cp group_vars/all.yml.template group_vars/all.yml`

Put the SM engine version of interest into group_vars/all.yml as value for the sm_branch variable

Create a pair of keys if you do not have one. This installation imply the private key name to be `id_rsa`

`ssh-keygen -t rsa`

`vagrant up --provision`

`ansible-playbook sm.yml`


## Run tests

SSH into the virtual machine
 
`ssh -i ~/.ssh/id_rsa -p 2222 ubuntu@127.0.0.1`
 
Initialize Miniconda virtual environment

`cd /opt/dev/sm`

`source /opt/dev/miniconda/bin/activate sm`

Run tests

`scripts/run.sh test_runner.py -u -r`

## Start example molecule annotation job

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

## License

This project is licensed under Apache 2.0 license.
