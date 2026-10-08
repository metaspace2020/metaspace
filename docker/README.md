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
if dependencies change. Api, update-daemon and lithops-daemon will need to be manually
restarted for code changes to take effect.

**Upgrading from the MinIO-based stack (before 2026-09-25):** the `storage` service is now RustFS,
which reads MinIO's on-disk data directly. To keep your existing datasets:

1. If you use `docker-compose.custom.yml`, copy the new `storage:` block from `docker-compose.yml` into it.
2. `docker-compose stop storage`
3. `<DATA_ROOT>` below is the value of `DATA_ROOT` from `docker/.env` (default `./data`, i.e. `docker/data`).
   With the default: `cd docker && mv data/s3 data/s3.bak && cp -Rc data/s3.bak data/s3` (macOS/APFS
   clone, instant). Adjust the paths if your `DATA_ROOT` in `.env` is not `./data`. On Linux use
   `cp -a --reflink=auto` instead of `cp -Rc` (instant on btrfs/XFS, a full copy on ext4). MinIO ran as
   root, so on Linux the old `s3` tree is root-owned; the `mv` works, but deleting `s3.bak` later needs
   `sudo`.
4. `docker-compose up -d storage && docker-compose run --rm api /sm-engine/create-buckets.sh`
5. Restart `api`, `update-daemon` and `lithops-daemon`.

`s3.bak` is your rollback copy for the old MinIO image (which is no longer downloadable, so do not
delete it from your Docker cache). Remove `s3.bak` only once you are sure you will not go back.
Skip step 3 if you do not care about existing data; RustFS then starts empty.

Rollback: the previous MinIO `storage:` block is in `git show 046164c2:docker/docker-compose.yml`; put
it back with the volume pointed at `<DATA_ROOT>/s3.bak:/data`. It only works while the old image is
still in your local Docker cache.

### Recommended bash aliases

Add these to your `~/.bashrc` or `~/.bash_profile`:

```
alias dc="docker-compose"
alias dclogs="dc logs -f --tail 0 api update-daemon lithops-daemon graphql webapp"
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
* http://localhost:9001/rustfs/console/ - RustFS console (S3-compatible object storage). Username: `minioadmin`, Password: `minioadmin`.
    The S3 API is on `localhost:9000`; data lives in `${DATA_ROOT}/s3` (the same directory MinIO used; the pre-RustFS original is `s3.bak`).
* `docker-compose logs storage` is sparse by design: RustFS writes WARN-and-above to `/logs/rustfs.log` inside the container and prints only a few startup lines to stdout. Use `curl -s localhost:9000/health` to check it is up.

Watching application logs:

* `docker-compose logs --tail 5 -f api update-daemon lithops-daemon graphql webapp`

Rebuilding the Elasticsearch index:

* `docker-compose run --rm api /sm-engine/rebuild-es-index.sh`

Recreating the storage buckets (e.g. after wiping `${DATA_ROOT}/s3`):

* `docker-compose run --rm api /sm-engine/create-buckets.sh`

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