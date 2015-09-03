"""
.. module:: metrics_db
    :synopsis: Procedures that insert job results to database.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""

from computing import *

def get_fulldataset_query_data(db, tol=3e-6):
	'''Selects all sum formulas from the database and produces an input structure for the processing.

	The output structure is :code:`(formulas, mzadducts, mzpeaks, intensities, data)`, where:

	* :code:`formulas` is the list of sum formulas (there are several entries for each sum formula with different adducts and peaks);
	* :code:`mzadducts` is the list of adducts;
	* :code:`mzpeaks` is the list of peaks (m/z values);
	* :code:`intensities` is the list of intensities corresponding to each :code:`(formula, mzadduct, mzpeak)` triple;
	* :code:`data` is the list of intervals in the form [x*(1-tol), x*(1+tol)] for each peak x and given multiplicative tolerance (default 3e-6).
	'''
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

def get_full_dataset_results(res_dicts, formulas, mzadducts, intensities, nrows, ncols, job_id=0, offset=0):
	'''Converts the results of spark jobs into a convenient form for adding to the database.
	:param res_dicts: list of dictionaries with results
	:param formulas: list of sum formulas
	:param mzadducts: list of adducts
	:param intensities: list of theoretical peak intensities
	'''
	total_nonzero = sum([len(x) for x in res_dicts])
	my_print("Got result of full dataset job %d with %d nonzero spectra" % (job_id, total_nonzero))
	corr_images = [ iso_img_correlation(res_dicts[i]) for i in xrange(len(res_dicts)) ]
	corr_int = [ iso_pattern_match(res_dicts[i], intensities[i]) for i in xrange(len(res_dicts)) ]
	to_insert = [ i for i in xrange(len(res_dicts)) if corr_int[i] > 0.3 and corr_images[i] > 0.3 ]
	chaos_measures = [ measure_of_chaos_dict(res_dicts[i][0], nrows, ncols) if corr_int[i] > 0.3 and corr_images[i] > 0.3 else 0 for i in xrange(len(res_dicts)) ]
	return ([ formulas[i+offset]["id"] for i in to_insert ],
		[ int(mzadducts[i+offset]) for i in to_insert ],
		[ len(res_dicts[i]) for i in to_insert ],
		[ {
			"corr_images" : corr_images[i],
			"corr_int" : corr_int[i],
			"chaos" : chaos_measures[i]
		  } for i in to_insert ],
		[ res_dicts[i] for i in to_insert ]
		)

def process_res_fulldataset(db, res_dicts, formulas, mzadducts, intensities, nrows, ncols, job_id=0, offset=0):
	'''Adds the results of full dataset processing to the database, updating both job_result_data and job_result_stats.'''
	formulas, mzadducts, lengths, stat_dicts, res_dicts = get_full_dataset_results(res_dicts, formulas, mzadducts, intensities, job_id, nrows, ncols, offset)
	if sum(lengths) > 0:
		db.query("INSERT INTO job_result_data VALUES %s" %
			",".join(['(%d, %d, %d, %d, %d, %.6f)' % (job_id,
				int(formulas[i+offset]["id"]),
				int(mzadducts[i+offset]), j, k, v)
				for i in xrange(len(res_dicts)) for j in xrange(len(res_dicts[i])) for k,v in res_dicts[i][j].iteritems()])
		)
	insert_job_result_stats( db, job_id, formulas, mzadducts, lengths, stat_dicts )


def process_res_extractmzs(db, result, formula_id, intensities, job_id):
	'''Process results of an extraction procedure on a single sum formula.'''
	res_dict = result.get()
	for ad, res_array in res_dict.iteritems():
		my_print("Got result of job %d with %d peaks" % (job_id, len(res_array)))
		if (sum([len(x) for x in res_array]) > 0):
			db.query("INSERT INTO job_result_data VALUES %s" %
				",".join(['(%d, %d, %d, %d, %d, %.6f)' % (job_id, -1, ad, i, k, v) for i in xrange(len(res_array)) for k,v in res_array[i].iteritems()])
			)
		insert_job_result_stats( [ formula_id ], [ ad ], [ len(res_array) ], [ {
			"corr_images" : iso_img_correlation(res_array),
			"corr_int" : iso_pattern_match(res_array, intensities[ad])
		} ] )

