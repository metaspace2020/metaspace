import argparse
import cPickle

import psycopg2
import psycopg2.extras

import sys
from engine.util import *

engine_path = dirname(dirname(realpath(__file__)))
sys.path.append(engine_path)

parser = argparse.ArgumentParser(description='Queries saving script')
parser.add_argument('--out', dest='fname', type=str, help='filename')
parser.add_argument('--sf-filter-file', dest='sf_filter_path', type=str, help='filter path')
parser.add_argument('--config', dest='config', type=str, help='config file name')
parser.add_argument('--ds-config', dest='ds_config_path', type=str, help='dataset config file name')
parser.set_defaults(config='config.json', fname='queries.pkl')
args = parser.parse_args()

# SM config
with open(args.config) as f:
    config_db = json.load(f)['db']

# Dataset config
with open(args.ds_config_path) as f:
    ds_config = json.load(f)

my_print("Reading formulas from DB...")

conn = psycopg2.connect(**config_db)
curs = conn.cursor()

# --sf-filter-file
#/home/intsco/embl/SpatialMetabolomics/sm/test/data/run_process_dataset_test/20150730_ANB_spheroid_control_65x65_15um/sf_id_sample.csv

sql = '''SELECT sf_id, adduct, centr_mzs, centr_ints
        FROM theor_peaks
        WHERE db_id = %s AND adduct = ANY(ARRAY[%s])'''
curs.execute(sql, (ds_config['inputs']['database_id'], ds_config['isotope_generation']['adducts']))

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

ppm = ds_config['image_generation']['ppm']
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
