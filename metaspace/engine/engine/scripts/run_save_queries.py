import numpy as np
from os import curdir,sep,path
import psycopg2, psycopg2.extras
import json
import argparse
import cPickle

tol = 0.01
adducts = [ "H", "Na", "K" ]

from engine.util import *
from engine.metrics_db import *

parser = argparse.ArgumentParser(description='IMS webserver.')
parser.add_argument('--out', dest='fname', type=str, help='filename')
parser.add_argument('--config', dest='config', type=str, help='config file name')
parser.set_defaults(config='config.json', fname='queries.pkl')
args = parser.parse_args()

with open(args.config) as f:
	config = json.load(f)

config_db = config["db"]

my_print("Reading formulas from DB...")

conn = psycopg2.connect("dbname=%s user=%s password=%s host=%s" % (config_db['db'], config_db['user'], config_db['password'], config_db['host']) )
cur = conn.cursor()

cur.execute("SELECT sf_id as id,adduct,peaks,ints FROM mz_peaks limit 1000")
formulas = cur.fetchall()
ids = [ x[0] for x in formulas]
mzadducts = [ x[1] for x in formulas]
mzpeaks = [ x[2] for x in formulas]
intensities = [ x[3] for x in formulas]
data = [ [ [float(x)-tol, float(x)+tol] for x in peaks ] for peaks in mzpeaks ]

res = {
	"ids" : ids,
	"formulas" : formulas,
	"mzadducts" : mzadducts,
	"mzpeaks" : mzpeaks,
	"intensities" : intensities,
	"data" : data
}

my_print("Saving queries to %s..." % args.fname)

with open(args.fname, "w") as outf:
	cPickle.dump(res, outf)

my_print("All done!")

