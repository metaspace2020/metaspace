#!/usr/bin/env bash
source activate mol-db

if [ "$SM_DOCKER_ENV" = "development" ]; then
  cd /opt/dev/sm-molecular-db
else
  cd /opt/mol-db
fi

# curl https://s3-eu-west-1.amazonaws.com/sm-mol-db/db_files/hmdb/hmdb_2-5.tsv -o /tmp/hmdb_2-5.tsv \
#  && (python scripts/import_molecular_db.py HMDB-v2.5 2018-03-08 /tmp/hmdb_2-5.tsv \
#  ; rm /tmp/hmdb_2-5.tsv)

curl https://s3-eu-west-1.amazonaws.com/sm-mol-db/db_files/hmdb/hmdb_4.tsv -o /tmp/hmdb_4.tsv \
 && python scripts/import_molecular_db.py HMDB-v4 2018-03-08 /tmp/hmdb_4.tsv \
 && rm /tmp/hmdb_4.tsv

curl https://s3-eu-west-1.amazonaws.com/sm-mol-db/db_files/chebi/chebi_2018-01.tsv -o /tmp/chebi_2018-01.tsv \
 && python scripts/import_molecular_db.py ChEBI-2018-01 2018-03-08 /tmp/chebi_2018-01.tsv \
 && rm /tmp/chebi_2018-01.tsv

curl https://s3-eu-west-1.amazonaws.com/sm-mol-db/db_files/lipidmaps/lipidmaps_2017-12-12.tsv -o /tmp/lipidmaps_2017-12-12.tsv \
 && python scripts/import_molecular_db.py LipidMaps-2017-12-12 2018-03-08 /tmp/lipidmaps_2017-12-12.tsv \
 && rm /tmp/lipidmaps_2017-12-12.tsv

curl https://s3-eu-west-1.amazonaws.com/sm-mol-db/db_files/swisslipids/swisslipids_2018-02-02 -o /tmp/swisslipids_2018-02-02 \
 && python scripts/import_molecular_db.py SwissLipids-2018-02-02 2018-03-08 /tmp/swisslipids_2018-02-02 \
 && rm /tmp/swisslipids_2018-02-02
