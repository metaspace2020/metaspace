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
#python scripts/import_lion_info.py LION /tmp/LION-LUT.csv CoreMetabolome v3 /tmp/core_metabolome.json /tmp/LION_METASPACE_list.csv  --mol-type=lipid
#python scripts/import_lion_info.py LION /tmp/LION-LUT.csv LipidMaps 2017-12-12 /tmp/lipidmaps.json /tmp/LION_METASPACE_list.csv  --mol-type=lipid
#python scripts/import_lion_info.py LION /tmp/LION-LUT.csv HMDB v4 /tmp/HMDB.json /tmp/LION_METASPACE_list.csv  --mol-type=lipid
#python scripts/import_lion_info.py LION /tmp/LION-LUT.csv SwissLipids 2018-02-02 /tmp/swisslipids.json /tmp/LION_METASPACE_list.csv  --mol-type=lipid
#
#rm /tmp/LION-LUT.csv /tmp/lipidmaps.json /tmp/HMDB.json /tmp/swisslipids.json /tmp/core_metabolome.json /tmp/LION_METASPACE_list.csv

curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Metabo_super_class_list.csv" -o /tmp/Metabo_super_class_list.csv
curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Metabo_super_class.json" -o /tmp/Metabo_super_class.json
python scripts/import_lion_info.py "Super" /tmp/Metabo_super_class_list.csv HMDB v4 /tmp/Metabo_super_class.json /tmp/Metabo_super_class_list.csv --mol-type=metabolite --category=class
python scripts/import_lion_info.py "Super" /tmp/Metabo_super_class_list.csv CoreMetabolome v3 /tmp/Metabo_super_class.json /tmp/Metabo_super_class_list.csv --mol-type=metabolite --category=class
rm /tmp/Metabo_super_class.json /tmp/Metabo_super_class_list.csv

curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Metabo_sub_class_list.csv" -o /tmp/Metabo_sub_class_list.csv
curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Metabo_sub_class.json" -o /tmp/Metabo_sub_class.json
python scripts/import_lion_info.py "Subclass" /tmp/Metabo_sub_class_list.csv HMDB v4 /tmp/Metabo_sub_class.json /tmp/Metabo_sub_class_list.csv --mol-type=metabolite --category=class
python scripts/import_lion_info.py "Subclass" /tmp/Metabo_sub_class_list.csv CoreMetabolome v3 /tmp/Metabo_sub_class.json /tmp/Metabo_sub_class_list.csv --mol-type=metabolite --category=class
rm /tmp/Metabo_sub_class.json /tmp/Metabo_sub_class_list.csv

curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Metabo_pathways_list.csv" -o /tmp/Metabo_pathways_list.csv
curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Metabo_pathways.json" -o /tmp/Metabo_pathways.json
python scripts/import_lion_info.py "Main" /tmp/Metabo_pathways_list.csv HMDB v4 /tmp/Metabo_pathways.json /tmp/Metabo_pathways_list.csv --mol-type=metabolite --category=pathways
python scripts/import_lion_info.py "Main" /tmp/Metabo_pathways_list.csv CoreMetabolome v3 /tmp/Metabo_pathways.json /tmp/Metabo_pathways_list.csv --mol-type=metabolite --category=pathways
rm /tmp/Metabo_pathways.json /tmp/Metabo_pathways_list.csv

curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Metabo_main_class_list.csv" -o /tmp/Metabo_main_class_list.csv
curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Metabo_main_class.json" -o /tmp/Metabo_main_class.json
python scripts/import_lion_info.py "Main" /tmp/Metabo_main_class_list.csv HMDB v4 /tmp/Metabo_main_class.json /tmp/Metabo_main_class_list.csv --mol-type=metabolite --category=class
python scripts/import_lion_info.py "Main" /tmp/Metabo_main_class_list.csv CoreMetabolome v3 /tmp/Metabo_main_class.json /tmp/Metabo_main_class_list.csv --mol-type=metabolite --category=class
rm /tmp/Metabo_main_class.json /tmp/Metabo_main_class_list.csv

curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Lipid_super_class_list.csv" -o /tmp/Lipid_super_class_list.csv
curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Lipid_super_class.json" -o /tmp/Lipid_super_class.json
python scripts/import_lion_info.py "Super" /tmp/Lipid_super_class_list.csv HMDB v4 /tmp/Lipid_super_class.json /tmp/Lipid_super_class_list.csv --mol-type=lipid --category=class
python scripts/import_lion_info.py "Super" /tmp/Lipid_super_class_list.csv CoreMetabolome v3 /tmp/Lipid_super_class.json /tmp/Lipid_super_class_list.csv --mol-type=lipid --category=class
rm /tmp/Lipid_super_class.json /tmp/Lipid_super_class_list.csv

curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Lipid_sub_class_list.csv" -o /tmp/Lipid_sub_class_list.csv
curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Lipid_sub_class.json" -o /tmp/Lipid_sub_class.json
python scripts/import_lion_info.py "Sub" /tmp/Lipid_sub_class_list.csv HMDB v4 /tmp/Lipid_sub_class.json /tmp/Lipid_sub_class_list.csv --mol-type=lipid --category=class
python scripts/import_lion_info.py "Sub" /tmp/Lipid_sub_class_list.csv CoreMetabolome v3 /tmp/Lipid_sub_class.json /tmp/Lipid_sub_class_list.csv --mol-type=lipid --category=class
rm /tmp/Lipid_sub_class.json /tmp/Lipid_sub_class_list.csv

curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Lipid_pathways_list.csv" -o /tmp/Lipid_pathways_list.csv
curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Lipid_pathways.json" -o /tmp/Lipid_pathways.json
python scripts/import_lion_info.py "Main" /tmp/Lipid_pathways_list.csv HMDB v4 /tmp/Lipid_pathways.json /tmp/Lipid_pathways_list.csv --mol-type=lipid --category=pathways
python scripts/import_lion_info.py "Main" /tmp/Lipid_pathways_list.csv CoreMetabolome v3 /tmp/Lipid_pathways.json /tmp/Lipid_pathways_list.csv --mol-type=lipid --category=pathways
rm /tmp/Lipid_pathways.json /tmp/Lipid_pathways_list.csv

curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Lipid_main_class_list.csv" -o /tmp/Lipid_main_class_list.csv
curl "https://sm-lion-project.s3.eu-west-1.amazonaws.com/v2/Lipid_main_class.json" -o /tmp/Lipid_main_class.json
python scripts/import_lion_info.py "Main" /tmp/Lipid_main_class_list.csv HMDB v4 /tmp/Lipid_main_class.json /tmp/Lipid_main_class_list.csv --mol-type=lipid --category=class
python scripts/import_lion_info.py "Main" /tmp/Lipid_main_class_list.csv CoreMetabolome v3 /tmp/Lipid_main_class.json /tmp/Lipid_main_class_list.csv --mol-type=lipid --category=class
rm /tmp/Lipid_main_class.json /tmp/Lipid_main_class_list.csv