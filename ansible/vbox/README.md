Steps to get a working installation inside VirtualBox (should take about half an hour with good internet connection):

1. Copy `group_vars/all.yml.template` to `group_vars/all.yml` and tweak it as needed
2. Install Vagrant and Ansible
3. Run `vagrant up` (~5 minutes first time)
4. Run `eval $(ssh-agent)` and then `ssh-add` to avoid entering password every time
5. Run `ansible-playbook provision.yml` (~20 minutes)
6. Run `ansible-playbook deploy.yml` (~5 minutes)

Individual components can later be re-deployed by running `ansible-playbook deploy.yml` with appropriate `--tags` flag.

If you need to tweak provisioning:
- use `--start-at-task` flag to avoid wasting time on unrelated tasks;
- re-run `ansible-playbook deploy.yml` after provisioning.

You can test the installation by opening `localhost:8999` in your browser and uploading a test dataset.
First processing will take more time because of isotope pattern computation which has to be run for every database.

In case you encounter problems, login into the virtual machine:
```bash
vagrant ssh -- -l ubuntu -i ~/.ssh/id_rsa
```
Inside it you can run `supervisorctl` to see the list of running daemons (`status` command) and their logs (`tail`).
