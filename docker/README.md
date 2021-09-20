## Description

This directory contains a docker-compose configuration for setting up instances of the METASPACE
platform for personal and development use.

This configuration has not been secured for production use and should not be deployed to any server
with the intent of providing public access without first considering the security implications.
In particular, administrative ports for back-end services have not been closed in this
configuration, and easily guessable passwords are used and stored in plain text.

## Usage

### Install Docker

```
sudo apt-get install docker-compose git
sudo snap install docker
```

After installation, log out and log back in to start the Docker daemon. If this step isn't done,
docker will hang when trying to start containers.

### Docker config file

Copy `.env.example` to `.env` and customize it if needed.

### Development installation

The full `metaspace` repository is mounted into most containers
and projects are run from your checked-out code. This makes it much
easier to make live code changes.

Running `setup-dev-env.sh` will copy the pre-made docker config files into the
projects in this repository and start the docker containers.

To avoid disruption due to changes in the docker-compose files while updating from git,
changing branches, etc. it's recommended to make a copy of the `docker-compose.yml`
file that is excluded from git:

* Copy `docker-compose.yml` to `docker-compose.custom.yml` (this file is already .gitignored)
* Update `.env` with `COMPOSE_FILE=docker-compose.custom.yml`

Webapp and graphql are set to auto-reload if code changes, but they'll need to be restarted
if dependencies change. Api, update-daemon and annotate-daemon will need to be manually
restarted for code changes to take effect.

### Recommended bash aliases

Add these to your `~/.bashrc` or `~/.bash_profile`:

```
alias dc="docker-compose"
alias dclogs="dc logs -f --tail 0 api update-daemon annotate-daemon lithops-daemon graphql webapp"
dcr() {
    docker-compose kill "$@" ; docker-compose up -d --no-deps --no-recreate "$@"
}
```

* To start everything: `dc up -d`
* To stop everything: `dc kill` (note: don't use `dc down` as it cleans up, making the containers take longer to start later)
* To restart one or more containers: `dcr graphql webapp` (kill/re-up is faster than dc restart)
* To view logs of METASPACE containers: `dclogs`

### Import data

```bash
docker-compose run --rm api /sm-engine/install-dbs.sh
./fetch-mol-images.sh
```

### Configuration

Running `setup-dev-env.sh` should set up individual projects' config files to a working state,
though some adjustments may be required if container names or credentials have changed.
The most common causes of runtime errors in new development environments are mismatched
credentials and incorrect service names.

### Accessing METASPACE

* http://localhost:8999/ - Main site

Development tools:

* `localhost:9200` - Elasticsearch REST endpoint. Can be accessed with GUIs such as Elasticvue and dejavu
* `localhost:5432` - Postgres server. Can be used with e.g. DataGrip.
    Username: `postgres`, Password: `postgres`, Database: `sm`
* http://localhost:15672/ - RabbitMQ management interface

Watching application logs:

* `docker-compose logs --tail 5 -f api update-daemon annotate-daemon lithops-daemon graphql webapp`

Rebuilding the Elasticsearch index:

* `docker-compose run --rm api /sm-engine/rebuild-es-index.sh`

### Creating an admin user

1. Register through the METASPACE web UI
2. Use the email verification link to verify your account (can be found in the graphql logs, or your inbox if the AWS credentials are set up)
3. Update your user type to `admin` in the `graphql.user` table in the database.
    If you don't have a DB UI set up yet, you can do this instead:
    `docker-compose exec postgres psql sm postgres -c "UPDATE graphql.user SET role = 'admin' WHERE email = '<your email address>';"`

### Non-Linux host support

When Docker runs containers in a VM, only directory-based volumes can be mounted.
This is why the nginx/elasticsearch services have custom dockerfiles
that create symlinks to files in a mounted config directory, rather than
mounting the files directly.

There's no cross-platform way to do the /etc/timezone mounts,
but they're optional and can just be commented out on non-Linux systems.