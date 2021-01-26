#!/usr/bin/env bash

cd /opt/dev/metaspace/metaspace/engine

pip install -qr requirements.txt
pip install -e .

# TODO: This doesn't include all databases, and the only way to exclude databases is to comment them out.
# It would be much better as a Python script that interactively allowed databases to be selected.

curl https://s3-eu-west-1.amazonaws.com/sm-mol-db/db_files_2021/hmdb/hmdb_4.tsv -o /tmp/hmdb_4.tsv \
 && python scripts/import_molecular_db.py HMDB v4 /tmp/hmdb_4.tsv \
 && rm /tmp/hmdb_4.tsv

curl https://s3-eu-west-1.amazonaws.com/sm-mol-db/db_files_2021/chebi/chebi_2018-01.tsv -o /tmp/chebi_2018-01.tsv \
 && python scripts/import_molecular_db.py ChEBI 2018-01 /tmp/chebi_2018-01.tsv \
 && rm /tmp/chebi_2018-01.tsv

curl https://s3-eu-west-1.amazonaws.com/sm-mol-db/db_files_2021/lipidmaps/lipidmaps_2017-12-12-v2.tsv -o /tmp/lipidmaps_2017-12-12.tsv \
 && python scripts/import_molecular_db.py LipidMaps 2017-12-12 /tmp/lipidmaps_2017-12-12.tsv \
 && rm /tmp/lipidmaps_2017-12-12.tsv

curl https://s3-eu-west-1.amazonaws.com/sm-mol-db/db_files_2021/swisslipids/swisslipids_2018-02-02-v2.tsv -o /tmp/swisslipids_2018-02-02 \
 && python scripts/import_molecular_db.py SwissLipids 2018-02-02 /tmp/swisslipids_2018-02-02 \
 && rm /tmp/swisslipids_2018-02-02
