# Molecular Database RESTful Web API

HMDB, ChEBI and other molecular databases.

Molecule attributes: formula, name, database id

## Installation (Ubuntu)

Install and setup PostgreSQL ([LINK](https://www.howtoforge.com/tutorial/how-to-install-postgresql-95-on-ubuntu-12_04-15_10/))

Create a user and database
```bash
sudo -u postgres psql
CREATE ROLE mol_db LOGIN CREATEDB NOSUPERUSER PASSWORD 'simple_pass';
CREATE DATABASE mol_db WITH OWNER sm;
\q  # exit
```

Python>=3.6 is required
```bash
sudo pip install -U pip
sudo pip install -r requirements.txt
```
## Usage

Start the API in development mode
```
python app/main.py
```

Start in production mode
```
gunicorn --log-level INFO --access-logfile - --workers 4 \
--worker-class sync --timeout 90 --bind 0.0.0.0:5001 app.main:application
``` 

Add a new database
```
curl -X POST "http://localhost:5001/v1/databases?name=mol-db-name&version=2019-12-12&drop=yes"
curl -H "Content-Type: text/plain" --data-binary -d "@/path/to/import/file.csv" -X POST "http://localhost:5001/v1/databases/{moldb_id}/molecules"
```

Delete a database
```
curl -X DELETE "http://localhost:5001/v1/databases/{moldb_id}"
```

Because the API doesn't have authentication, all non GET requests should be blocked for all IPs other than `127.0.0.1`

## Funding

This project is funded from the [European Horizon2020](https://ec.europa.eu/programmes/horizon2020/)
project [METASPACE](http://project.metaspace2020.eu/) (no. 634402),
[NIH NIDDK project KPMP](http://kpmp.org/)
and internal funds of the [European Molecular Biology Laboratory](https://www.embl.org/).

## License

This project is licensed under the [Apache 2.0 license](LICENSE).
