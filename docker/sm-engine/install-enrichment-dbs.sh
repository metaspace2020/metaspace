#!/usr/bin/env bash
# Imports the enrichment ontologies and maps them to the molecular databases. Each set is
# independent: a failure is reported at the end and makes the script exit non-zero, but does
# not stop the other imports.

cd /opt/dev/metaspace/metaspace/engine

pip install -qr requirements.txt
pip install -e .

#curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/LION-LUT.csv" -o /tmp/LION-LUT.csv
#curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/LION_METASPACE_list.csv" -o /tmp/LION_METASPACE_list.csv
#curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/core_metabolome.json" -o /tmp/core_metabolome.json
#curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/lipidmaps.json" -o /tmp/lipidmaps.json
#curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/HMDB.json" -o /tmp/HMDB.json
#curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/swisslipids.json" -o /tmp/swisslipids.json
#
#python scripts/import_lion_info.py LION /tmp/LION-LUT.csv CoreMetabolome v3 /tmp/core_metabolome.json /tmp/LION_METASPACE_list.csv  --mol-type=lipid
#python scripts/import_lion_info.py LION /tmp/LION-LUT.csv LipidMaps 2017-12-12 /tmp/lipidmaps.json /tmp/LION_METASPACE_list.csv  --mol-type=lipid
#python scripts/import_lion_info.py LION /tmp/LION-LUT.csv HMDB v4 /tmp/HMDB.json /tmp/LION_METASPACE_list.csv  --mol-type=lipid
#python scripts/import_lion_info.py LION /tmp/LION-LUT.csv SwissLipids 2018-02-02 /tmp/swisslipids.json /tmp/LION_METASPACE_list.csv  --mol-type=lipid
#
#rm /tmp/LION-LUT.csv /tmp/lipidmaps.json /tmp/HMDB.json /tmp/swisslipids.json /tmp/core_metabolome.json /tmp/LION_METASPACE_list.csv

BASE_URL=https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2
failed=()

# import_set <enrichment name> <file stem> <mol type> <category>
# Downloads <stem>_list.csv and <stem>.json, then maps the terms against HMDB v4 and
# CoreMetabolome v3. A mapping against a molecular DB that is not installed is skipped by
# import_lion_info.py (it logs "Molecular database not found") and does not count as a failure.
import_set() {
  local name=$1 stem=$2 mol_type=$3 category=$4
  local list="/tmp/${stem}_list.csv" json="/tmp/${stem}.json"
  if curl -f "$BASE_URL/${stem}_list.csv" -o "$list" && curl -f "$BASE_URL/${stem}.json" -o "$json"; then
    for moldb in "HMDB v4" "CoreMetabolome v3"; do
      # shellcheck disable=SC2086 # $moldb is "<name> <version>", two arguments
      python scripts/import_lion_info.py "$name" "$list" $moldb "$json" "$list" \
        --mol-type="$mol_type" --category="$category" \
        || failed+=("$stem -> $moldb")
    done
  else
    failed+=("$stem download")
  fi
  rm -f "$list" "$json"
}

import_set Super    Metabo_super_class metabolite class
import_set Subclass Metabo_sub_class   metabolite class
import_set Main     Metabo_pathways    metabolite pathways
import_set Main     Metabo_main_class  metabolite class
import_set Super    Lipid_super_class  lipid      class
import_set Sub      Lipid_sub_class    lipid      class
import_set Main     Lipid_pathways     lipid      pathways
import_set Main     Lipid_main_class   lipid      class

if [ ${#failed[@]} -gt 0 ]; then
  echo "ERROR: failed to import enrichment sets: ${failed[*]}" >&2
  exit 1
fi
