# Ansible project for setting up machines running SM engine
Check https://github.com/SpatialMetabolomics/SM_distributed for more information about SM engine

## Installation
Make sure you have these tools installed
 - VirtualBox 5.0.12 (https://www.virtualbox.org/wiki/Downloads)
 - Vagrant 1.8.1 (https://www.vagrantup.com/downloads.html)
 - ansible 2.0.2 (http://docs.ansible.com/ansible/intro_installation.html#latest-releases-via-pip)

`git clone https://github.com/intsco/sm-engine-ansible.git`

## Setting up Virtual Box single instance SM engine

`cp group_vars/sm-vbox.yml.template group_vars/sm-vbox.yml`

Put the SM engine version of interest into group_vars/sm-vbox.yml as value for the sm.sm_branch variable

`vagrant up --provision`

`ansible-playbook -i hosts sm.yml`


## Run tests

SSH into the virtual machine
 
`ssh -i ~/.ssh/id_rsa -p 2222 ubuntu@127.0.0.1`
 
Initialize Miniconda virtual environment

`source /opt/dev/miniconda/bin/activate sm`

Run tests

`scripts/run.sh test_runner.py -u -r`

## License

This project is licensed under Apache 2.0 license.