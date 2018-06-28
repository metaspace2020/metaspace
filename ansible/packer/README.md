This directory contains configuration for [Packer](www.packer.io), tool for provisioning and building AMI/Docker/VirtualBox images.

# Docker image

## Building

```bash
packer build sm_docker.json
```

## Running

On the host:
```bash
docker run -it sm-docker:queue /bin/bash
```

Inside the container:
```bash
service elasticsearch start
service postgresql start
service rabbitmq-server start
cd /opt/dev/sm
source /opt/dev/miniconda/bin/activate sm
supervisord -c /etc/supervisor/supervisord.conf -l /var/log/supervisor/supervisord.log
```
