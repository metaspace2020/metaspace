#!/usr/bin/env bash

cd /opt/dev/metaspace/metaspace/engine

pip install -qr requirements.txt
pip install -e .

# TODO: This doesn't include all databases, and the only way to exclude databases is to comment them out.
# It would be much better as a Python script that interactively allowed databases to be selected.

curl https://sm-lion-project.s3.eu-west-1.amazonaws.com/LION-LUT.csv -o /tmp/LION-LUT.csv \
 && python scripts/import_lion_info.py LION /tmp/LION-LUT.csv \
 && rm /tmp/LION-LUT.csv