import numpy as np
from os import curdir, sep, path
import psycopg2, psycopg2.extras
import json
import argparse
import cPickle
import pandas as pd

ppm = 1.5
# tol = 0.01
adducts = ["H", "Na", "K"]

import sys
from os.path import dirname, realpath
from util import *

engine_path = dirname(dirname(realpath(__file__)))
sys.path.append(engine_path)

from engine.metrics_db import *

parser = argparse.ArgumentParser(description='IMS webserver.')
parser.add_argument('--out', dest='fname', type=str, help='filename')
parser.add_argument('--sf-filter-file', dest='sf_filter_path', type=str, help='filter path')
parser.add_argument('--config', dest='config', type=str, help='config file name')
parser.set_defaults(config='config.json', fname='queries.pkl')
args = parser.parse_args()

with open(args.config) as f:
    config_db = json.load(f)['db']

my_print("Reading formulas from DB...")

conn = psycopg2.connect(**config_db)
curs = conn.cursor()

# --sf-filter-file
#/home/intsco/embl/SpatialMetabolomics/sm/test/data/run_process_dataset_test/20150730_ANB_spheroid_control_65x65_15um/sf_id_sample.csv

sql = 'SELECT sf_id as id, adduct, peaks, ints FROM mz_peaks'
curs.execute(sql)

if args.sf_filter_path:
    print 'Using filter file: ', args.sf_filter_path
    with open(args.sf_filter_path) as f:
        sfs = map(int, open(args.sf_filter_path).readlines())
        formulas = filter(lambda row: row[0] in sfs, curs.fetchall())
else:
    formulas = curs.fetchall()
ids = [x[0] for x in formulas]
mzadducts = [x[1] for x in formulas]
mzpeaks = [x[2] for x in formulas]
intensities = [x[3] for x in formulas]

data = [[[x - ppm*x/1e6, x + ppm*x/1e6] for x in peaks] for peaks in mzpeaks]

if len(data) <= 0:
    raise Exception('{} returned empty result set'.format(sql))
else:
    print 'Fetched {} formulas from DB'.format(len(data))

res = {
    "ids": ids,
    "formulas": formulas,
    "mzadducts": mzadducts,
    "mzpeaks": mzpeaks,
    "intensities": intensities,
    "data": data
}

my_print("Saving queries to %s..." % args.fname)

with open(args.fname, "w") as outf:
    cPickle.dump(res, outf)

my_print("All done!")
