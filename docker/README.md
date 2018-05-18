## Usage
Install docker:

```
sudo apt-get install docker-compose git
sudo snap install docker
```

Log out and log back in so that Docker daemon starts. (Otherwise docker will hang when trying to start containers)

### Self-contained installation

Run `docker-compose up -d` and jump to the "Import data" section

### Development installation

In a development setup, SM projects are run from volumes that are linked to the filesystem.
These projects are expected to be checked out in the directory above `sm-docker`,
e.g. the `sm-webapp` container will run from code in `../sm-webapp` relative to the `docker-compose.yml` file.

```bash
# clone projects in parent directory
cd ..
git clone --recurse-submodules https://github.com/METASPACE2020/sm-molecular-db.git
git clone --recurse-submodules https://github.com/METASPACE2020/sm-engine.git
git clone --recurse-submodules https://github.com/METASPACE2020/sm-graphql.git
git clone --recurse-submodules https://github.com/METASPACE2020/sm-webapp.git

cd sm-docker
# Create a symlink so that the path to the data directory is the same in all environments
sudo ln -s "${PWD}/data" /opt/data
# Run (./dev is a convenience shortcut for `docker-compose -f docker-compose.yml -f docker-compose.dev.yml`)
./dev up -d
```

### Import data

```bash
docker-compose exec mol-db /import-dbs.sh
cd data
./fetch-mol-images.sh
```

### Configuration

TODO: Pull configuration templates from their respective repositories
and use a Jinja-based tool to populate them with defaults so that configuration doesn't need to be hard-coded

### Accessing METASPACE

* http://localhost:8999/ - Main site

Development tools:

* http://localhost:5601/ - Kibana
* http://localhost:9000/ - Adminer database management tool. Use "postgres" for System, Server, Username, Password and "sm" for Database
* http://localhost:15672/ - RabbitMQ management interface

Watching application logs:

* `docker-compose logs --tail 5 -f mol-db sm-api sm-daemon sm-graphql sm-webapp`

Rebuilding the Elasticsearch index:

* `./dev exec sm-api /rebuild-es-index.sh`

## Funding

This project is funded from the [European Horizon2020](https://ec.europa.eu/programmes/horizon2020/)
project [METASPACE](http://project.metaspace2020.eu/) (no. 634402),
[NIH NIDDK project KPMP](http://kpmp.org/)
and internal funds of the [European Molecular Biology Laboratory](https://www.embl.org/).

## License

Unless specified otherwise in file headers, all files are licensed under the [Apache 2.0 license](LICENSE).