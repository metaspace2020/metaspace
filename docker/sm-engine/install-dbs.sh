#!/usr/bin/env bash
# Imports the default molecular databases. Each import is independent: a failure is reported
# at the end and makes the script exit non-zero, but does not stop the other imports.

cd /opt/dev/metaspace/metaspace/engine

pip install -qr requirements.txt
pip install -e .

# TODO: This doesn't include all databases, and the only way to exclude databases is to comment them out.
# It would be much better as a Python script that interactively allowed databases to be selected.

BASE_URL=https://s3-eu-west-1.amazonaws.com/sm-mol-db/db_files_2021
failed=()

import_db() { # name version url
  local file="/tmp/$(basename "$3")"
  if ! { curl -f "$3" -o "$file" && python scripts/import_molecular_db.py "$1" "$2" "$file" --bypass-row-limit; }; then
    failed+=("$1 $2")
  fi
  rm -f "$file"
}

import_db HMDB v4 "$BASE_URL/hmdb/hmdb_4.tsv"
import_db ChEBI 2018-01 "$BASE_URL/chebi/chebi_2018-01.tsv"
import_db LipidMaps 2017-12-12 "$BASE_URL/lipidmaps/lipidmaps_2017-12-12-v2.tsv"
import_db SwissLipids 2018-02-02 "$BASE_URL/swisslipids/swisslipids_2018-02-02-v2.tsv"

if [ ${#failed[@]} -gt 0 ]; then
  echo "ERROR: failed to import: ${failed[*]}" >&2
  exit 1
fi
