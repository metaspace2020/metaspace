# Molecular Database REST API Service

HMDB, ChEBI and other molecular databases.

Molecular attributes: InChI, InChI key, sum formula, name, database id

## Installation (Ubuntu)

Install and setup PostgreSQL ([LINK](https://www.howtoforge.com/tutorial/how-to-install-postgresql-95-on-ubuntu-12_04-15_10/))

Create a user and database
```bash
sudo -u postgres psql
CREATE ROLE sm LOGIN CREATEDB NOSUPERUSER PASSWORD 'simple_pass';
CREATE DATABASE sm WITH OWNER sm;
\q  # exit
```
Python of at least 3.4 version is required
```bash
sudo pip install -U pip
sudo pip install -r requirements.txt
```
## Running

`python3 app/main.py`