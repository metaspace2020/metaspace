from datetime import datetime,time,date,timedelta

import numpy as np

import tornado.ioloop
import tornado.web
import tornado.httpserver
from tornado.concurrent import Future
from tornado import gen
from tornado.ioloop import IOLoop
import tornpsql

from pyspark import SparkContext, SparkConf

from computing import *
from util import *
from blockentropy import *

fulldataset_chunk_size = 1000
adducts = [ "H", "Na", "K" ]

def get_one_group_total(mz_lower, mz_upper, mzs, intensities):
    return np.sum(intensities[ bisect.bisect_left(mzs, mz_lower) : bisect.bisect_right(mzs, mz_upper) ])


def get_one_group_total_dict(name, mz_lower, mz_upper, mzs, intensities):
    res = get_one_group_total(mz_lower, mz_upper, mzs, intensities)
    if res > 0.0001:
    	return {int(name) : res}
    else:
    	return {}

def get_many_groups_total_dict_individual(queries, sp):
	res = { k : [ get_one_group_total_dict(sp[0], q[0], q[1], sp[1], sp[2]) for q in v ] for k,v in queries.iteritems() }
	return res

def get_many_groups_total_arr_individual(queries, sp):
	return [ get_one_group_total_dict(sp[0], q[0], q[1], sp[1], sp[2]) for q in queries ]

def get_many_groups2d_total_dict_individual(data, sp):
	return [ get_many_groups_total_arr_individual(queries, sp) for queries in data]


def run_extractmzs(sc, fname, data, nrows, ncols):
	ff = sc.textFile(fname)
	spectra = ff.map(txt_to_spectrum)
	# qres = spectra.map(lambda sp : get_many_groups_total_dict(data, sp)).reduce(join_dicts)
	qres = spectra.map(lambda sp : get_many_groups_total_dict_individual(data, sp)).reduce(reduce_manygroups_dict)
	entropies = { k : [ get_block_entropy_dict(x, nrows, ncols) for x in v ] for k,v in qres.iteritems() }
	return (qres, entropies)

def dicts_to_dict(dictresults):
	res_dict = dictresults[0]
	for res in dictresults[1:]:
		res_dict.update({ k : v + res_dict.get(k, 0.0) for k,v in res.iteritems() })
	return res_dict

def run_fulldataset(sc, fname, data, nrows, ncols):
	ff = sc.textFile(fname)
	spectra = ff.map(txt_to_spectrum)
	qres = spectra.map(lambda sp : get_many_groups2d_total_dict_individual(data, sp)).reduce(reduce_manygroups2d_dict_individual)
	entropies = [ [ get_block_entropy_dict(x, nrows, ncols) for x in res ] for res in qres ]
	return (qres, entropies)


class RunSparkHandler(tornado.web.RequestHandler):
	@property
	def db(self):
		return self.application.db

	def result_callback(response):
		my_print("Got response! %s" % response)

	def strings_to_dict(self, stringresults):
		res_dict = { int(x.split(':')[0]) : float(x.split(':')[1]) for x in stringresults[0].split(' ') }
		for res_string in stringresults[1:]:
			res_dict.update({ int(x.split(':')[0]) : float(x.split(':')[1]) + res_dict.get(int(x.split(':')[0]), 0.0) for x in res_string.split(' ') })
		return res_dict

	def insert_job_result_stats(self, formula_ids, adducts, num_peaks, stats):
		if len(formula_ids) > 0:
			for stdict in stats:
				if "entropies" in stdict:
					stdict.update({ 'mean_ent' : np.mean(stdict["entropies"]) })
			self.db.query('INSERT INTO job_result_stats VALUES %s' % (
				",".join([ '(%d, \'%s\', %d, %d, \'%s\')' % (self.job_id, formula_ids[i], adducts[i], num_peaks[i], json.dumps(
					stats[i]
				)) for i in xrange(len(formula_ids)) ])
			) )

	def process_res_extractmzs(self, result):
		res_dict, entropies_dict = result.get()
		print "%s" % res_dict.keys()
		print "%s" % entropies_dict
		for ad, res_array in res_dict.iteritems():
			entropies = entropies_dict[ad]
			my_print("Got result of job %d with %d peaks" % (self.job_id, len(res_array)))
			if (sum([len(x) for x in res_array]) > 0):
				self.db.query("INSERT INTO job_result_data VALUES %s" %
					",".join(['(%d, %d, %d, %d, %d, %.6f)' % (self.job_id, -1, ad, i, k, v) for i in xrange(len(res_array)) for k,v in res_array[i].iteritems()])
				)
			self.insert_job_result_stats( [ self.formula_id ], [ ad ], [ len(res_array) ], [ {
				"entropies" : entropies,
				"corr_images" : avg_dict_correlation(res_array),
				"corr_int" : avg_intensity_correlation(res_array, self.intensities[ad])
			} ] )

	def process_res_fulldataset(self, result, offset=0):
		res_dicts, entropies = result.get()
		total_nonzero = sum([len(x) for x in res_dicts])
		my_print("Got result of full dataset job %d with %d nonzero spectra" % (self.job_id, total_nonzero))
		with open("jobresults.txt", "a") as f:
			for i in xrange(len(res_dicts)):
				f.write( "%s;%d;%d;%.3f;%.3f;%.3f\n" % ( self.formulas[i+offset]["id"],
					int(self.mzadducts[i+offset]),
					len(res_dicts[i]),
					entropies[i],
					avg_dict_correlation(res_dicts[i]),
					avg_intensity_correlation(res_dicts[i], self.intensities[i])
			  	)
		if (total_nonzero > 0):
			self.db.query("INSERT INTO job_result_data VALUES %s" %
				",".join(['(%d, %d, %d, %d, %d, %.6f)' % (self.job_id,
					int(self.formulas[i+offset]["id"]),
					int(self.mzadducts[i+offset]), j, k, v)
					for i in xrange(len(res_dicts)) for j in xrange(len(res_dicts[i])) for k,v in res_dicts[i][j].iteritems()])
			)
		self.insert_job_result_stats(
			[ self.formulas[i+offset]["id"] for i in xrange(len(res_dicts)) ],
			[ int(self.mzadducts[i+offset]) for i in xrange(len(res_dicts)) ],
			[ len(res_dicts[i]) for i in xrange(len(res_dicts)) ],
			[ {
				"entropies" : entropies[i],
				"corr_images" : avg_dict_correlation(res_dicts[i]),
				"corr_int" : avg_intensity_correlation(res_dicts[i], self.intensities[i])
			  } for i in xrange(len(res_dicts)) ]
		)

	@gen.coroutine
	def post(self, query_id):
		my_print("called /run/" + query_id)

		self.dataset_id = int(self.get_argument("dataset_id"))
		dataset_params = self.db.query("SELECT filename,nrows,ncols FROM datasets WHERE dataset_id=%d" % self.dataset_id)[0]
		self.nrows = dataset_params["nrows"]
		self.ncols = dataset_params["ncols"]
		self.fname = dataset_params["filename"]
		self.job_id = -1
		## we want to extract m/z values
		if query_id == "extractmzs":
			self.formula_id = self.get_argument("formula_id")
			self.job_type = 0
			tol = 0.01
			formula_data = self.db.query("SELECT adduct,peaks,ints FROM mz_peaks WHERE formula_id='%s'" % self.formula_id)
			peaks = {}
			self.intensities = {}
			for row in formula_data:
				peaks[row["adduct"]] = row["peaks"]
				self.intensities[row["adduct"]] = row["ints"]
			data = { k : [ [float(x)-tol, float(x)+tol] for x in pks] for k,pks in peaks.iteritems() }
			my_print("Running m/z extraction for formula id %s. Input data:" % self.formula_id)
			my_print("\n".join([ "\t%s\t%s" % (adducts[k], " ".join([ "[%.3f, %.3f]" % (x[0], x[1]) for x in d])) for k,d in data.iteritems() ]))

			cur_jobs = set(self.application.status.getActiveJobsIds())
			my_print("Current jobs: %s" % cur_jobs)
			result = call_in_background(run_extractmzs, *(self.application.sc, self.fname, data, self.nrows, self.ncols))
			self.spark_job_id = -1
			while self.spark_job_id == -1:
				yield async_sleep(1)
				my_print("Current jobs: %s" % set(self.application.status.getActiveJobsIds()))
				if len(set(self.application.status.getActiveJobsIds()) - cur_jobs) > 0:
					self.spark_job_id = list(set(self.application.status.getActiveJobsIds()) - cur_jobs)[0]
			## if this job hasn't started yet, add it
			if self.job_id == -1:
				self.job_id = self.application.add_job(self.spark_job_id, self.formula_id, self.dataset_id, self.job_type, datetime.now())
			else:
				self.application.jobs[self.job_id]["spark_id"] = self.spark_job_id
			while result.empty():
				yield async_sleep(1)
			self.process_res_extractmzs(result)

		elif query_id == "fulldataset":
			my_print("Running dataset-wise m/z image extraction for dataset id %s" % self.dataset_id)
			self.formula_id = -1
			self.job_type = 1
			prefix = "\t[fullrun %s] " % self.dataset_id
			my_print(prefix + "collecting m/z queries for the run")
			tol = 0.01
			self.formulas = self.db.query("SELECT formula_id as id,adduct,peaks,ints FROM mz_peaks")
			self.mzadducts = [ x["adduct"] for x in self.formulas]
			mzpeaks = [ x["peaks"] for x in self.formulas]
			self.intensities = [ x["ints"] for x in self.formulas]
			data = [ [ [float(x)-tol, float(x)+tol] for x in peaks ] for peaks in mzpeaks ]
			my_print(prefix + "looking for %d peaks" % sum([len(x) for x in data]))
			self.num_chunks = 1 + len(data) / fulldataset_chunk_size
			self.job_id = self.application.add_job(-1, self.formula_id, self.dataset_id, self.job_type, datetime.now(), chunks=self.num_chunks)
			for i in xrange(self.num_chunks):
				my_print("Processing chunk %d..." % i)
				cur_jobs = set(self.application.status.getActiveJobsIds())
				my_print("Current jobs: %s" % cur_jobs)
				result = call_in_background(run_fulldataset, *(self.application.sc, self.fname, data[fulldataset_chunk_size*i:fulldataset_chunk_size*(i+1)], self.nrows, self.ncols))
				self.spark_job_id = -1
				while self.spark_job_id == -1:
					yield async_sleep(1)
					my_print("Current jobs: %s" % set(self.application.status.getActiveJobsIds()))
					if len(set(self.application.status.getActiveJobsIds()) - cur_jobs) > 0:
						self.spark_job_id = list(set(self.application.status.getActiveJobsIds()) - cur_jobs)[0]
				## if this job hasn't started yet, add it
				if self.job_id == -1:
					self.job_id = self.application.add_job(self.spark_job_id, self.formula_id, self.dataset_id, self.job_type, datetime.now())
				else:
					self.application.jobs[self.job_id]["spark_id"] = self.spark_job_id
				while result.empty():
					yield async_sleep(1)
				self.process_res_fulldataset(result, offset=fulldataset_chunk_size*i)
		else:
			my_print("[ERROR] Incorrect run query %s!" % query_id)
			return

