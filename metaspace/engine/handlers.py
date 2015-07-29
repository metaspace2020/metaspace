#!/home/snikolenko/anaconda/bin/python
# -*- coding: utf8 -*
"""
.. module:: handlers
    :synopsis: Handlers for the webserver.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""

# global variable for special case html files
html_pages = {
}

import numpy as np

import json
import threading
import Queue

import tornado.ioloop
import tornado.web
import tornado.httpserver
from tornado.concurrent import Future
from tornado import gen
from tornado.ioloop import IOLoop
import tornpsql

from util import *
from globalvars import *
from computing import run_fulldataset, run_extractmzs
from metrics_db import get_fulldataset_query_data, process_res_extractmzs, process_res_fulldataset


@gen.coroutine
def async_sleep(seconds):
	'''Sleep for a given number of seconds.'''
	yield gen.Task(IOLoop.instance().add_timeout, time.time() + seconds)

def call_in_background(f, *args):
	'''Call function in background in a separate thread / coroutine'''
	result = Queue.Queue(1)
	t = threading.Thread(target=lambda: result.put(f(*args)))
	t.start()
	return result

class AjaxHandler(tornado.web.RequestHandler):
	'''Tornado handler for an ajax request.'''
	@property
	def db(self):
		return self.application.db

	def make_datatable_dict(self, draw, count, res):
		return {
			"draw":             draw,
			"recordsTotal":     count,
			"recordsFiltered":  count,
			"data":             res    
		}

	def load_random_image(self):
		'''Load a random m/z image from the database; used in the "choose more structured" game.'''
		im1 = self.db.query(sql_queries['randomstat'])[0]
		my_print("%s" % im1)
		peak1 = np.random.randint(im1['json_array_length'])
		im1.update({'peak' : peak1})
		my_print("chose peak %d" % peak1)
		my_print(sql_queries['onedata'] % (im1['job_id'], im1['formula_id'], im1['adduct'], peak1))
		data1 = self.db.query(sql_queries['onedata'] % (im1['job_id'], im1['formula_id'], im1['adduct'], peak1))
		return {
			"meta" : im1,
			"data" : {
				"val" : [ x['value'] for x in data1 ],
				"sp" : [ x['spectrum'] for x in data1 ]
			},
			"coords" : [ [x['x'], x['y']] for x in data1 ],
			"max_x" : np.max([ x['x'] for x in data1 ]),
			"max_y" : np.max([ x['y'] for x in data1 ])
		}

	@gen.coroutine
	def get(self, query_id, slug):
		def flushed_callback(t0):
			def callback():
				my_print("Finished write in AjaxHandler. Took %s" % (datetime.now() - t0))
			return callback

		def wrapper(self, query_id, slug, cProfile_res_list):
			my_print("ajax %s starting..." % query_id)
			my_print("%s" % query_id)
			my_print("%s" % slug)
			draw = self.get_argument('draw', 0)
			input_id = ""
			if len(slug) > 0:
				input_id = get_id_from_slug(slug)

			if query_id in ['formulas', 'substancejobs', 'jobs', 'datasets', 'demobigtable']:
				orderby = sql_fields[query_id][ int(self.get_argument('order[0][column]', 0)) ]
				orderdir = self.get_argument('order[0][dir]', 0)
				limit = self.get_argument('length', 0)
				limit_string = "LIMIT %s" % limit if limit != '-1' else ""
				offset = self.get_argument('start', 0)
				searchval = self.get_argument('search[value]', "")
				my_print("search for : %s" % searchval)

				## queries
				q_count = sql_counts[query_id] if searchval == "" else (sql_counts[query_id + '_search'] % (searchval, searchval, searchval))
				q_res = sql_queries[query_id] if searchval == "" else (sql_queries[query_id + '_search'] % (searchval, searchval, searchval))
				if query_id in ['substancejobs', 'fullimages']:
					q_count = q_count % input_id
					q_res = q_res % input_id
				my_print(q_count)
				if query_id == 'demobigtable':
					count = int(self.db.query(q_count)[0]['count'])
					res = self.db.query(q_res)
				else:
					my_print(q_res + " ORDER BY %s %s %s OFFSET %s" % (orderby, orderdir, limit_string, offset))
					count = int(self.db.query(q_count)[0]['count'])
					res = self.db.query(q_res + " ORDER BY %s %s %s OFFSET %s" % (orderby, orderdir, limit_string, offset))
				res_dict = self.make_datatable_dict(draw, count, [[ row[x] for x in sql_fields[query_id] ] for row in res])

			elif query_id == 'imagegame':
				res_dict = {"draw" : draw,
					"im1" : self.load_random_image(),
					"im2" : self.load_random_image()
				}

			else:
				if query_id == 'jobstats':
					arr = input_id.split('/')
					if len(arr) > 1:
						final_query = sql_queries[query_id] % arr[0] + " AND s.formula_id='%s'" % arr[1]
					else:
						final_query = sql_queries[query_id] % input_id
				elif query_id == 'demosubst':
					arr = input_id.split('/')
					spectrum = get_lists_of_mzs(arr[2])
					spec_add = { ad : get_lists_of_mzs(arr[2] + ad) for ad in adducts }
					coords_q = self.db.query( sql_queries['democoords'] % int(arr[3]) )
					coords = { row["index"] : [row["x"], row["y"]] for row in coords_q }
					final_query = sql_queries[query_id] % ( int(arr[0]), arr[1], int(arr[1]) )
				else:
					final_query = sql_queries[query_id] % input_id
				my_print(final_query)
				res_list = self.db.query(final_query)
				if query_id == 'fullimages':
					res_dict = {"data" : [ [x[field] for field in sql_fields[query_id]] for x in res_list]}
				elif query_id == 'demosubst':
					adduct_dict = {};

					for row in res_list:
						if adducts[ row["adduct"] ] not in adduct_dict:
							adduct_dict[ adducts[ row["adduct"] ] ] = []
						adduct_dict[ adducts[ row["adduct"] ] ].append(row)
					res_dict = {"data" : { k : sorted(v, key=lambda x: x["peak"]) for k,v in adduct_dict.iteritems() },
						"spec" : spectrum, "spadd" : spec_add
					}
					for k, v in res_dict["data"].iteritems():
						for imInd in xrange(len(v)):
							v[imInd]["val"] = np.array(v[imInd]["val"])
							im_q = np.percentile(v[imInd]["val"], 99.0)
							im_rep =  v[imInd]["val"] > im_q
							v[imInd]["val"][im_rep] = im_q
							v[imInd]["val"] = list(v[imInd]["val"])
					res_dict.update({ "coords" : coords })
				else:
					res_dict = res_list[0]
				## add isotopes for the substance query
				if query_id == "substance":
					res_dict.update({"all_datasets" : self.application.all_datasets})
					res_dict.update(get_lists_of_mzs(res_dict["sf"]))
				res_dict.update({"draw" : draw})
			cProfile_res_list.append(res_dict)
		res = []
		if args.time_profiling_enabled:
			cProfile.runctx("wrapper(self, query_id, slug, res)", globals(), locals())
		else:
			wrapper(self, query_id, slug, res)
		res_dict = res[0]
		my_print("ajax %s processed, returning..." % query_id)
		t0 = datetime.now()
		self.write(json.dumps(res_dict, cls = DateTimeEncoder))
		self.flush(callback=flushed_callback(t0))

	@gen.coroutine
	def post(self, query_id, slug):
		my_print("ajax post " + query_id)
		if query_id in ['postgameimages']:
			my_print("%s" % self.request.body)
			self.db.query("INSERT INTO game_results VALUES ('%s', '%s')" % (datetime.now(), json.dumps({
				"meta1"  : {
					"job_id" : self.get_argument("m1_job_id"),
					"dataset_id" : self.get_argument("m1_dataset_id"),
					"formula_id" : self.get_argument("m1_formula_id"),
					"adduct" : self.get_argument("m1_adduct"),
					"param" : self.get_argument("m1_param"),
					"peak" : self.get_argument("m1_peak")
				},
				"meta2"  : {
					"job_id" : self.get_argument("m2_job_id"),
					"dataset_id" : self.get_argument("m2_dataset_id"),
					"formula_id" : self.get_argument("m2_formula_id"),
					"adduct" : self.get_argument("m2_adduct"),
					"param" : self.get_argument("m2_param"),
					"peak" : self.get_argument("m2_peak")
				},
				"ans" : self.get_argument("chosen"),
			})) )


class IndexHandler(tornado.web.RequestHandler):
	'''Tornado handler for the index page.'''
	@gen.coroutine
	def get(self):
		self.render("html/index.html", sparkactivated=args.spark)

class SimpleHtmlHandlerWithId(tornado.web.RequestHandler):
	'''Tornado handler for an html file with a parameter.'''
	@gen.coroutine
	def get(self, id):
		my_print("Request: %s, Id: %s" % (self.request.uri, id))
		self.render( html_pages.get( self.request.uri.split('/')[1], 'html/' + self.request.uri.split('/')[1] + ".html"), sparkactivated=args.spark )

class SimpleHtmlHandler(tornado.web.RequestHandler):
	'''Tornado handler for an html file without parameters.'''
	@gen.coroutine
	def get(self):
		my_print("Request: %s" % self.request.uri)
		self.render( html_pages.get( self.request.uri.split('/')[1], 'html/' + self.request.uri.split('/')[1] + ".html"), sparkactivated=args.spark )


fulldataset_chunk_size = 1000
adducts = [ "H", "Na", "K" ]


class RunSparkHandler(tornado.web.RequestHandler):
	'''Tornado handler for spark jobs. Currently supports two kinds of jobs.

	1. extractmzs -- find peaks for a single sum formula.
	2. fulldataset -- find peaks for all formulas in a dataset.
	'''
	@property
	def db(self):
		return self.application.db

	def result_callback(response):
		'''Dummy response.'''
		my_print("Got response! %s" % response)

	def strings_to_dict(self, stringresults):
		'''Converts input strings in a txt file into the :code:`{ m/z : intensity }` dictionary.
		Supports multiple occurrences of the same m/z value (will add intensities).
		'''
		res_dict = { int(x.split(':')[0]) : float(x.split(':')[1]) for x in stringresults[0].split(' ') }
		for res_string in stringresults[1:]:
			res_dict.update({ int(x.split(':')[0]) : float(x.split(':')[1]) + res_dict.get(int(x.split(':')[0]), 0.0) for x in res_string.split(' ') })
		return res_dict

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
			process_res_extractmzs(self.db, result, self.formula_id, self.intensities, self.job_id)

		elif query_id == "fulldataset":
			my_print("Running dataset-wise m/z image extraction for dataset id %s" % self.dataset_id)
			self.formula_id = -1
			self.job_type = 1
			prefix = "\t[fullrun %s] " % self.dataset_id
			my_print(prefix + "collecting m/z queries for the run")
			tol = 3*(1e-6)
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
				res_dicts = result.get()
				process_res_fulldataset(self.db, res_dicts, self.formulas, self.mzadducts, self.intensities, self.nrows, self.ncols, self.job_id, offset=fulldataset_chunk_size*i)
		else:
			my_print("[ERROR] Incorrect run query %s!" % query_id)
			return


class NewPngHandler(tornado.web.RequestHandler):
	'''A RequestHandler for producing pngs. Returns a single ion image for given dataset, formula, adduct and peak. Not used in web code yet. Caches the res_dict until a request arrives that requires computing a different res_dict.'''
	cache = {}

	@property
	def db(self):
		return self.application.db
	
	@gen.coroutine
	def get(self, dataset_id, job_id, sf_id, sf, adduct, peak_id):
		colormap = ((0x35, 0x2A, 0x87), (0x02, 0x68, 0xE1), (0x10, 0x8E, 0xD2), (0x0F, 0xAE, 0xB9), (0x65, 0xBE, 0x86), (0xC0, 0xBC, 0x60), (0xFF, 0xC3, 0x37), (0xF9, 0xFB, 0x0E))
		bitdepth = 8
		query_id = "demosubst"
		peak_id, job_id, sf_id, dataset_id = int(get_id_from_slug(peak_id)), int(job_id), int(sf_id), int(dataset_id)
		def flushed_callback(t0):
			def callback():
				my_print("Finished write in NewPngHandler. Took %s" % (datetime.now() - t0))
			return callback
		def res_dict():
			# return immediately if result is cached.
			request_as_tuple = (dataset_id, job_id, sf_id, sf)
			if request_as_tuple in NewPngHandler.cache:
				my_print("request_as_tuple found in cache, returning immediately.")
				return NewPngHandler.cache[request_as_tuple]
			else:
				my_print("request was not cached; clearing cache")
				NewPngHandler.cache.clear()
			# coords_q = self.db.query( sql_queries['mzimage2coords'] % int(dataset_id) )
			coords_q = self.db.query( sql_queries['democoords'] % dataset_id )
			# coords = { row["index"] : [row["column"], row["row"]] for row in coords_q }
			coords = { row["index"] : [row["x"], row["y"]] for row in coords_q }
			dimensions = self.db.query("SELECT nrows,ncols FROM jobs j JOIN datasets d on j.dataset_id=d.dataset_id WHERE j.id=%d" % (job_id))[0]
			(nRows, nColumns) = ( int(dimensions["nrows"]), int(dimensions["ncols"]) )
			final_query = sql_queries[query_id] % ( job_id, sf_id, sf_id )
			res_list = self.db.query(final_query)
			adduct_dict = {}
			for row in res_list:
				if adducts[ row["adduct"] ] not in adduct_dict:
					adduct_dict[ adducts[ row["adduct"] ] ] = []
				adduct_dict[ adducts[ row["adduct"] ] ].append(row)
			res_dict = {
				"data" : {k : sorted(v, key=lambda x: x["peak"]) for k,v in adduct_dict.iteritems()},
				"coords" : coords,
				"dimensions" : (nRows, nColumns)
			}
			for k, v in res_dict["data"].iteritems():
				for imInd in xrange(len(v)):
					v[imInd]["val"] = np.array(v[imInd]["val"])
					im_q = np.percentile(v[imInd]["val"], 99.0)
					im_rep =  v[imInd]["val"] > im_q
					v[imInd]["val"][im_rep] = im_q
					v[imInd]["val"] = [round(x, 2) for x in list(v[imInd]["val"])]
			NewPngHandler.cache[request_as_tuple] = res_dict
			my_print("stored res_dict in cache")
			return res_dict
		def image_data(res_dict):
			data = res_dict["data"][adduct][peak_id]
			coords = res_dict["coords"]
			nRows, nColumns = res_dict["dimensions"]
			# find highest and lowest intensity
			non_zero_intensities = filter(lambda x: x > 0, data["val"])
			min_val = min(non_zero_intensities)
			max_val = max(non_zero_intensities) - min_val
			# normalize to byte (bitdepth=8)
			im_new = [list(colormap[0])*nColumns for _ in range(nRows)]
			for idx, val in zip(data["sp"], data["val"]):
				x,y = coords[idx]
				new_val = 0 if val == 0 else int(255 * (val - min_val)/max_val)
				chunk_size = math.ceil(2.0**bitdepth / (len(colormap)-1))
				color_chunk = int(new_val//chunk_size)
				pos_in_chunk = new_val % chunk_size
				l_chunk, u_chunk = colormap[color_chunk:color_chunk+2]
				colors = list(colormap[0])
				for i,(l,u) in enumerate(zip(l_chunk, u_chunk)):
					colors[i] = int(l + (u-l)*pos_in_chunk/float(chunk_size))
				im_new[y][3*x:3*x+3] = colors
			return im_new, (nColumns, nRows)
		def wrapper(res, res_list):
			res_list.append(res)
			
		if args.time_profiling_enabled:
			res = []
			cProfile.runctx("wrapper(image_data(res_dict()), res)", globals(), locals())
			im_data, size = res[0]
		else:
			im_data, size = image_data(res_dict())
		fp = cStringIO.StringIO()
		write_image(im_data, fp, size=size)
		self.set_header("Content-Type", "image/png")
		self.write(fp.getvalue())


class MZImageHandler(tornado.web.RequestHandler):
	'''Tornado handler for a png m/z image (not used in current version).'''
	@property
	def db(self):
		return self.application.db

	@gen.coroutine
	def get(self, job_string):
		my_print(job_string)
		job_id, peak_id = get_formula_and_peak(job_string)
		my_print("Creating m/z image for job %d..." % job_id)
		params = self.db.query("SELECT nrows,ncols FROM jobs j JOIN datasets d on j.dataset_id=d.dataset_id WHERE j.id=%d" % (job_id))[0]
		(dRows, dColumns) = ( int(params["nrows"]), int(params["ncols"]) )
		if peak_id > -1:
			data = self.db.query("SELECT spectrum as s,value as v FROM job_result_data WHERE job_id=%d AND peak=%d" % (job_id, peak_id))
		else:
			data = self.db.query("SELECT spectrum as s,value as v FROM job_result_data WHERE job_id=%d" % job_id)
		sio = write_image( make_image_arrays(dRows, dColumns, [int(row["s"]) for row in data], [float(row["v"]) for row in data]) )
		self.set_header("Content-Type", "image/png")
		self.write(sio.getvalue())


class MZImageParamHandler(tornado.web.RequestHandler):
	'''Tornado handler for a png m/z image from a dataset job with parameter (not used in current version).'''
	@property
	def db(self):
		return self.application.db

	@gen.coroutine
	def get(self, job_string, param_string):
		my_print(job_string)
		job_id = int( get_id_from_slug(job_string) )
		formula_id, peak_id = get_formula_and_peak(param_string)
		my_print("Creating m/z image for job %d..." % job_id)
		params = self.db.query("SELECT nrows,ncols FROM jobs j JOIN datasets d on j.dataset_id=d.dataset_id WHERE j.id=%d" % job_id)[0]
		(dRows, dColumns) = ( int(params["nrows"]), int(params["ncols"]) )
		data = self.db.query("SELECT spectrum as s,value as v FROM job_result_data WHERE job_id=%d AND param=%d AND peak=%d" % (job_id, formula_id, peak_id))
		sio = write_image( make_image_arrays(dRows, dColumns, [int(row["s"]) for row in data], [float(row["v"]) for row in data]) )
		self.set_header("Content-Type", "image/png")
		self.write(sio.getvalue())
