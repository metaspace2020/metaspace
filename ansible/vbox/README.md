## Setting up single instance SM Platform in VirtualBox

Steps to get a working installation inside VirtualBox.

System and software requirements for the host machine:
* 16GB of system memory
* [Ubuntu 16.04](http://releases.ubuntu.com/16.04/)
* [VirtualBox 5.0](https://www.virtualbox.org/wiki/Downloads)
* [Vagrant 1.8](https://www.vagrantup.com/downloads.html)
* [Ansible 2.4](http://docs.ansible.com/ansible/intro_installation.html#latest-releases-via-pip)

#### Installation
Should take about 10 minutes with a good internet connection.

* Install Vagrant and Ansible
* `git clone -b rel-v0.7 https://github.com/METASPACE2020/sm-engine-ansible.git` rel-v0.7 is the branch for installing the most recent version of SM Platform
* `cd vbox/`
* `cp group_vars/all.yml.template group_vars/all.yml`
* `vagrant up`
* `ansible-playbook provision.yml`
* `ansible-playbook deploy.yml`

Individual components can later be re-deployed by running `ansible-playbook deploy.yml` with appropriate `--tags` flag.

If you need to tweak provisioning:
- use `--start-at-task` flag to avoid wasting time on unrelated tasks
- re-run `ansible-playbook deploy.yml` after provisioning

You can test the installation by opening [localhost:8999](http://localhost:8999) in your browser and uploading a test dataset.
First processing will take more time because of isotope pattern computation which has to be run for every database.

In case you encounter problems, login into the virtual machine:
```bash
ssh -i ~/.ssh/id_rsa -p 2222 ubuntu@localhost
```
Inside it you can run `supervisorctl` to see the list of running daemons (`status` command) and their logs (`tail`).
