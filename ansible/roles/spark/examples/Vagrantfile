# -*- mode: ruby -*-
# vi: set ft=ruby :

VAGRANTFILE_API_VERSION = "2"

# Ensure role dependencies are in place
if [ "up", "provision" ].include?(ARGV.first) &&
  !(File.directory?("roles/azavea.java") || File.symlink?("roles/azavea.java"))

  unless system("ansible-galaxy install --force -r roles.yml -p roles")
    $stderr.puts "\nERROR: Please install Ansible 1.4.2+ so that the ansible-galaxy binary"
    $stderr.puts "is available."
    exit(1)
  end
end

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|
  config.vm.box = "ubuntu/trusty64"

  config.vm.network "forwarded_port", guest: 4040, host: 4040

  config.vm.provision "ansible" do |ansible|
    ansible.playbook = "site.yml"
    ansible.sudo = true
  end
end
