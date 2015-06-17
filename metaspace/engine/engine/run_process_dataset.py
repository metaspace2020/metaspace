import numpy as np
import json
import argparse
import cPickle

from pyspark import SparkContext, SparkConf

adducts = [ "H", "Na", "K" ]
fulldataset_chunk_size = 1000

from util import *
from computing import *

def get_full_dataset_results(res_dicts, entropies, formulas, mzadducts, intensities, job_id=0, offset=0):
	total_nonzero = sum([len(x) for x in res_dicts])
	my_print("Got result of full dataset job %d with %d nonzero spectra" % (job_id, total_nonzero))
	corr_images = [ avg_dict_correlation(res_dicts[i]) for i in xrange(len(res_dicts)) ]
	corr_int = [ avg_intensity_correlation(res_dicts[i], intensities[i]) for i in xrange(len(res_dicts)) ]
	to_insert = [ i for i in xrange(len(res_dicts)) if corr_int[i] > 0.3 and corr_images[i] > 0.3 ]
	return ([ formulas[i+offset][0] for i in to_insert ],
		[ int(mzadducts[i+offset]) for i in to_insert ],
		[ len(res_dicts[i]) for i in to_insert ],
		[ {
			"entropies" : entropies[i],
			"corr_images" : corr_images[i],
			"corr_int" : corr_int[i]
		  } for i in to_insert ],
		[ res_dicts[i] for i in to_insert ]
		)

def process_res_fulldataset(db, res_dicts, entropies, formulas, mzadducts, intensities, job_id=0, offset=0):
	formulas, mzadducts, lengths, stat_dicts, res_dicts = get_full_dataset_results(res_dicts, entropies, formulas, mzadducts, intensities, job_id, offset)
	if sum(lengths) > 0:
		db.query("INSERT INTO job_result_data VALUES %s" %
			",".join(['(%d, %d, %d, %d, %d, %.6f)' % (job_id,
				int(formulas[i+offset][0]),
				int(mzadducts[i+offset]), j, k, v)
				for i in xrange(len(res_dicts)) for j in xrange(len(res_dicts[i])) for k,v in res_dicts[i][j].iteritems()])
		)
	insert_job_result_stats( db, job_id, formulas, mzadducts, lengths, stat_dicts )


parser = argparse.ArgumentParser(description='IMS process dataset at a remote spark location.')
parser.add_argument('--out', dest='fname', type=str, help='filename')
parser.add_argument('--job_id', dest='job_id', type=int, help='job id for the database')
parser.add_argument('--rows', dest='rows', type=int, help='number of rows')
parser.add_argument('--cols', dest='cols', type=int, help='number of columns')
parser.add_argument('--ds', dest='ds', type=str, help='dataset file name')
parser.add_argument('--queries', dest='queries', type=str, help='queries file name')
parser.set_defaults(config='config.json', queries='queries.pkl', fname='result.pkl', ds='', job_id=0, rows=-1, cols=-1)
args = parser.parse_args()

if args.ds == '':
	print "Must specify dataset as --ds=filename!"
	exit(0)

my_print("Reading %s..." % args.queries)
with open(args.queries) as f:
	q = cPickle.load(f)

my_print("Looking for %d peaks" % sum([len(x) for x in q["data"]]))
num_chunks = 1 + len(q["data"]) / fulldataset_chunk_size

conf = SparkConf() #.setAppName("Extracting m/z images").setMaster("local") #.set("spark.executor.memory", "16g").set("spark.driver.memory", "8g")
sc = SparkContext(conf=conf)

ff = sc.textFile(args.ds)
spectra = ff.map(txt_to_spectrum)
# spectra.cache()

res = {
	"formulas" : [],
	"mzadducts" : [],
	"lengths" : [],
	"stat_dicts" : [],
	"res_dicts" : []
}

for i in xrange(num_chunks):
	my_print("Processing chunk %d..." % i)

	data = q["data"][fulldataset_chunk_size*i:fulldataset_chunk_size*(i+1)]
	qres = spectra.map(lambda sp : get_many_groups2d_total_dict_individual(data, sp)).reduce(reduce_manygroups2d_dict_individual)
	entropies = [ [ get_block_entropy_dict(x, args.rows, args.cols) for x in one_result ] for one_result in qres ]
	cur_results = get_full_dataset_results(qres, entropies, q["formulas"], q["mzadducts"], q["intensities"], args.job_id, fulldataset_chunk_size*i)	
	res["formulas"].extend([ n + fulldataset_chunk_size*i for n in cur_results[0] ])
	res["mzadducts"].extend(cur_results[1])
	res["lengths"].extend(cur_results[2])
	res["stat_dicts"].extend(cur_results[3])
	res["res_dicts"].extend(cur_results[4])

my_print("Saving results to %s..." % args.fname)

with open(args.fname, "w") as outf:
	cPickle.dump(res, outf)

my_print("All done!")

