## Setting up AWS based SM platform version

Software requirements for the developer machine:
* [Ubuntu 16.04](http://releases.ubuntu.com/16.04/)
* [VirtualBox 5.0](https://www.virtualbox.org/wiki/Downloads)
* [Vagrant 1.8](https://www.vagrantup.com/downloads.html)
* [Ansible 2.4](http://docs.ansible.com/ansible/intro_installation.html#latest-releases-via-pip)


#### Installation

`git clone -b rel-v0.7 https://github.com/intsco/sm-engine-ansible.git`

`cd aws`

`cp all.yml.template dev/group_vars/all.yml`

Put the SM engine version, AWS user credentials and other parameters into dev/group_vars/all.yml.

Create a pair of keys with help of the AWS console. They will be used for ssh'ing to launched AWS instances

Spin up all needed instances. You will need at least three: web app and db instance, spark master and spark slave ones.

`ansible-playbook -i dev aws_start.yml -e "components=all"`

`ansible-playbook -i dev aws_cluster_setup.yml`

Provision the web services instance
 
`ansible-playbook -i dev provision/web_server.yml`

Provision Spark cluster instances
 
`ansible-playbook -i dev provision/spark_cluster.yml`

Deploy and start the web app and other services

`ansible-playbook -i dev deploy/web_server.yml`

To stop all SM platform instances

`ansible-playbook -i dev aws_stop.yml -e "components=all`
