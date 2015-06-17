import numpy as np

from math import log
from collections import Counter

from util import *
from computing import *

def get_fulldataset_query_data(db, tol=3e-6):
	formulas = db.query("SELECT sf_id as id,adduct,peaks,ints FROM mz_peaks")
	mzadducts = [ x["adduct"] for x in formulas]
	mzpeaks = [ x["peaks"] for x in formulas]
	intensities = [ x["ints"] for x in formulas]
	data = [ [ [float(x)*(1.-tol), float(x)*(1.+tol)] for x in peaks ] for peaks in mzpeaks ]
	return (formulas, mzadducts, mzpeaks, intensities, data)

def insert_job_result_stats(db, job_id, formula_ids, adducts, num_peaks, stats):
	if len(formula_ids) > 0:
		for stdict in stats:
			if "entropies" in stdict:
				stdict.update({ 'mean_ent' : np.mean(stdict["entropies"]) })
		db.query('INSERT INTO job_result_stats VALUES %s' % (
			",".join([ '(%d, %s, %d, %d, \'%s\')' % (job_id, formula_ids[i], adducts[i], num_peaks[i], json.dumps(
				stats[i]
			)) for i in xrange(len(formula_ids)) ])
		) )

def get_full_dataset_results(res_dicts, entropies, formulas, mzadducts, intensities, job_id=0, offset=0):
	total_nonzero = sum([len(x) for x in res_dicts])
	my_print("Got result of full dataset job %d with %d nonzero spectra" % (job_id, total_nonzero))
	# with open("jobresults.txt", "a") as f:
	# 	for i in xrange(len(res_dicts)):
	# 		f.write( "%s;%d;%d;%s;%.3f;%.3f\n" % ( formulas[i+offset]["id"],
	# 			int(mzadducts[i+offset]),
	# 			len(res_dicts[i]),
	# 			entropies[i],
	# 			avg_dict_correlation(res_dicts[i]),
	# 			avg_intensity_correlation(res_dicts[i], intensities[i])
	# 	  	) )
	corr_images = [ avg_dict_correlation(res_dicts[i]) for i in xrange(len(res_dicts)) ]
	corr_int = [ avg_intensity_correlation(res_dicts[i], intensities[i]) for i in xrange(len(res_dicts)) ]
	to_insert = [ i for i in xrange(len(res_dicts)) if corr_int[i] > 0.3 and corr_images[i] > 0.3 ]
	return ([ formulas[i+offset]["id"] for i in to_insert ],
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
				int(formulas[i+offset]["id"]),
				int(mzadducts[i+offset]), j, k, v)
				for i in xrange(len(res_dicts)) for j in xrange(len(res_dicts[i])) for k,v in res_dicts[i][j].iteritems()])
		)
	insert_job_result_stats( db, job_id, formulas, mzadducts, lengths, stat_dicts )



