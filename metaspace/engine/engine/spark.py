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
from metrics_db import *

fulldataset_chunk_size = 1000
adducts = [ "H", "Na", "K" ]

@gen.coroutine
def async_sleep(seconds):
    yield gen.Task(IOLoop.instance().add_timeout, time.time() + seconds)


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
			self.formula_id = self.get_argument("sf_id")
			self.job_type = 0
			tol = 3*(1e-6)
			formula_data = self.db.query("SELECT adduct,peaks,ints FROM mz_peaks WHERE sf_id=%d" % int(self.formula_id))
			peaks = {}
			self.intensities = {}
			for row in formula_data:
				peaks[row["adduct"]] = row["peaks"]
				self.intensities[row["adduct"]] = row["ints"]
			data = { k : [ [float(x)*(1-tol), float(x)*(1+tol)] for x in pks] for k,pks in peaks.iteritems() }
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
			self.formulas, self.mzadducts, mzpeaks, self.intensities, data = get_fulldataset_query_data(self.db, tol=tol)
			my_print(prefix + "looking for %d peaks" % sum([len(x) for x in data]))
			self.num_chunks = 1 + len(data) / fulldataset_chunk_size
			self.job_id = self.application.add_job(-1, self.formula_id, self.dataset_id, self.job_type, datetime.now(), chunks=self.num_chunks)
			# for i in xrange(self.num_chunks):
			for i in xrange(1):
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
				my_print("Processing results...")
				res_dicts, entropies = result.get()
				process_res_fulldataset(self.db, res_dicts, entropies, self.formulas, self.mzadducts, self.intensities, self.nrows, self.ncols, self.job_id, offset=fulldataset_chunk_size*i)
		else:
			my_print("[ERROR] Incorrect run query %s!" % query_id)
			return

