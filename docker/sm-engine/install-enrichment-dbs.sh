#!/usr/bin/env bash

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
#python scripts/import_lion_info.py LION /tmp/LION-LUT.csv CoreMetabolome v3 /tmp/core_metabolome.json /tmp/LION_METASPACE_list.csv
#python scripts/import_lion_info.py LION /tmp/LION-LUT.csv LipidMaps 2017-12-12 /tmp/lipidmaps.json /tmp/LION_METASPACE_list.csv
#python scripts/import_lion_info.py LION /tmp/LION-LUT.csv HMDB v4 /tmp/HMDB.json /tmp/LION_METASPACE_list.csv
#python scripts/import_lion_info.py LION /tmp/LION-LUT.csv SwissLipids 2018-02-02 /tmp/swisslipids.json /tmp/LION_METASPACE_list.csv
#
#rm /tmp/LION-LUT.csv /tmp/lipidmaps.json /tmp/HMDB.json /tmp/swisslipids.json /tmp/core_metabolome.json /tmp/LION_METASPACE_list.csv
curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Lipid_main_class_list.csv" -o /tmp/Lipid_main_class_list.csv
curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Lipid_main_class.json" -o /tmp/Lipid_main_class.json



python scripts/import_lion_info.py "Main" /tmp/Lipid_main_class_list.csv HMDB v4 /tmp/Lipid_main_class.json /tmp/Lipid_main_class_list.csv --mol-type=lipid --category=class

rm /tmp/Lipid_main_class.json