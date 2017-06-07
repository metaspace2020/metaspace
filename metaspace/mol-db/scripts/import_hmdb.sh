#!/usr/bin/env bash

wget -c https://s3-eu-west-1.amazonaws.com/sm-mol-db/db_files/hmdb_201701.tsv
python scripts/import_molecular_db.py HMDB 2017 hmdb_201701.tsv
