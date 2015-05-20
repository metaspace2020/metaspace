#!/home/snikolenko/anaconda/bin/python
# -*- coding: utf8 -*

import os
from datetime import datetime,time,date,timedelta
from os import curdir,sep,path
import psycopg2,psycopg2.extras
import json
import argparse

import tornado.ioloop
import tornado.web
import tornado.httpserver
from tornado.concurrent import Future
from tornado import gen
from tornado.ioloop import IOLoop
import tornpsql

import numpy as np

import time
import decimal

# sys.path = ['..'] + sys.path
from engine.util import *
from engine.computing import *
from engine.imaging import *


parser = argparse.ArgumentParser(description='IMS webserver.')
parser.add_argument('--no-spark', dest='spark', action='store_false')
parser.add_argument('--config', dest='config', type=str, help='config file name')
parser.set_defaults(spark=True, config='config.json')
args = parser.parse_args()

if args.spark:
	from pyspark import SparkContext, SparkConf
	from engine.spark import *

with open(args.config) as f:
	config = json.load(f)

adducts = [ "H", "Na", "K" ]

sql_counts = dict(
	formulas="SELECT count(*) FROM formulas",
	formulas_search="SELECT count(*) FROM formulas WHERE lower(name) like '%%%s%%' OR lower(sf) like '%%%s%%' OR id like '%s%%'",
	substancejobs="SELECT count(*) FROM jobs WHERE formula_id='%s'",
	jobs="SELECT count(*) FROM jobs",
	datasets="SELECT count(*) FROM datasets",
	fullimages="SELECT count(*) FROM job_result_stats WHERE job_id=%s",
	demobigtable="SELECT count(distinct formula_id) FROM job_result_stats"
)

sql_queries = dict(
	formulas="SELECT id,name,sf FROM formulas ",
	formulas_search="SELECT id,name,sf FROM formulas WHERE lower(name) like '%%%s%%' OR lower(sf) like '%%%s%%' OR id like '%s%%' ",
	substance='''SELECT
		f.id,f.sf_id,name,sf,peaks,ints,array_agg(s.job_id) as job_ids,
		array_agg(d.dataset_id) as dataset_ids,array_agg(dataset) as datasets,
		array_agg(stats) as stats
		FROM formulas f 
			JOIN mz_peaks p ON f.sf_id=p.sf_id
			LEFT JOIN job_result_stats s ON f.id=s.formula_id
			LEFT JOIN jobs j ON s.job_id=j.id
			LEFT JOIN datasets d ON j.dataset_id=d.dataset_id
		WHERE f.id='%s' GROUP BY f.id,f.sf_id,name,sf,peaks,ints
	''',
	jobstats="SELECT stats,peaks FROM job_result_stats s JOIN mz_peaks p ON s.formula_id=p.formula_id WHERE job_id=%s",
	substancejobs='''
		SELECT j.dataset_id,dataset,id,description,done,status,tasks_done,tasks_total,start,finish,id
		FROM jobs j
			LEFT JOIN datasets d on j.dataset_id=d.dataset_id
			LEFT JOIN job_types t on j.type=t.type
		WHERE formula_id='%s'
	''',
	jobs='''
		SELECT j.id as id,t.type,t.description,j.dataset_id,dataset,formula_id,f.name as formula_name,done,status,tasks_done,tasks_total,start,finish,j.id as id
		FROM jobs j LEFT JOIN datasets d on j.dataset_id=d.dataset_id
		LEFT JOIN formulas f on j.formula_id=f.id
		LEFT JOIN job_types t on t.type=j.type
	''',
	datasets='SELECT dataset_id,dataset,nrows,ncols,dataset_id FROM datasets',
	jobdescription='''
		SELECT j.dataset_id as dataset_id,dataset,description,done,status,tasks_done,tasks_total,start,finish
		FROM jobs j
			LEFT JOIN datasets d on j.dataset_id=d.dataset_id
			LEFT JOIN job_types t on j.type=t.type
		WHERE j.id=%s
	''',
	fullimages='''
		SELECT id,name,sf,stats->'entropies' as entropies,stats->'mean_ent' as mean_ent,stats->'corr_images' as corr_images,stats->'corr_int' as corr_int,id
		FROM job_result_stats j LEFT JOIN formulas f ON f.id=j.formula_id
		WHERE (stats->'mean_ent')::text::real > 0.0001 AND job_id=%s
	''',
	demobigtable='''
		SELECT db,ds.dataset,f.sf,f.names,f.subst_ids,
			array_agg((s.stats->'mean_ent')::text::real) AS mean_ent,
			array_agg((s.stats->'corr_images')::text::real) AS corr_images,
			array_agg((s.stats->'corr_int')::text::real) AS corr_int,
			array_agg(s.adduct) as adducts,
			j.id as job_id,
			array_agg(s.stats->'entropies') AS entropies,
			j.dataset_id,f.id as sf_id
		FROM agg_formulas f
			JOIN formula_dbs db ON f.db_ids[1]=db.db_id
			JOIN job_result_stats s ON f.id=s.formula_id JOIN jobs j ON s.job_id=j.id
			JOIN datasets ds ON j.dataset_id=ds.dataset_id
		WHERE
			(s.stats->'corr_images')::text::real > 0.3 AND
			(s.stats->'corr_int')::text::real > 0.3
		GROUP BY db,ds.dataset,f.sf,f.names,f.subst_ids,j.id,j.dataset_id,sf_id
	''',
	demosubst='''
		SELECT s.job_id,s.formula_id,s.adduct,
			(s.stats->'entropies'->peak)::text::real as entropy,peak,array_agg(spectrum) as sp,array_agg(value) as val
		FROM job_result_stats s 
			JOIN job_result_data d ON s.job_id=d.job_id  and s.adduct=d.adduct 
			JOIN jobs j ON d.job_id=j.id 
		WHERE d.job_id=%d AND s.formula_id=%s AND d.param=%d
		AND (s.stats->'corr_images')::text::real > 0.3 AND
			(s.stats->'corr_int')::text::real > 0.3
		GROUP BY s.job_id,s.formula_id,entropy,s.adduct,peak
	''',
	demosubstpeaks="SELECT peaks,ints FROM mz_peaks WHERE formula_id='%s'",
	democoords="SELECT index,x,y FROM coordinates WHERE dataset_id=%d"
)

sql_fields = dict(
	formulas=["id", "name", "sf"],
	substancejobs=["dataset_id", "dataset", "id", "description", "done", "status", "tasks_done", "tasks_total", "start", "finish", "id"],
	jobs=["id", "type", "description", "dataset_id", "dataset", "formula_id", "formula_name", "done", "status", "tasks_done", "tasks_total", "start", "finish", "id"],
	datasets=["dataset_id", "dataset", "nrows", "ncols", "dataset_id"],
	fullimages=["id", "name", "sf", "entropies", "mean_ent", "corr_images", "corr_int", "id"],
	demobigtable=["db", "dataset", "sf", "names", "subst_ids", "mean_ent", "corr_images", "corr_int", "adducts", "job_id", "entropies", "dataset_id", "sf_id"]
)

def get_formula_and_peak(s):
	arr = get_id_from_slug(s).split('p')
	if len(arr) > 1:
		return (int(arr[0]), int(arr[1]))
	else:
		return (int(arr[0]), -1)

class MZImageHandler(tornado.web.RequestHandler):
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


class AjaxHandler(tornado.web.RequestHandler):
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

	@gen.coroutine
	def get(self, query_id, slug):
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
		else:
			if query_id == 'jobstats':
				arr = input_id.split('/')
				if len(arr) > 1:
					final_query = sql_queries[query_id] % arr[0] + " AND s.formula_id='%s'" % arr[1]
				else: 
					final_query = sql_queries[query_id] % input_id
			elif query_id == 'demosubst':
				arr = input_id.split('/')
				# spectrum = self.db.query( sql_queries['demosubstpeaks'] % arr[1] )
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
				res_dict.update({ "coords" : coords })
			else:
				res_dict = res_list[0]
			## add isotopes for the substance query
			if query_id == "substance":
				res_dict.update({"all_datasets" : self.application.all_datasets})
				res_dict.update(get_lists_of_mzs(res_dict["sf"]))
			res_dict.update({"draw" : draw})

		my_print("ajax %s processed, returning..." % query_id)
		self.write(json.dumps(res_dict, cls = DateTimeEncoder))

class IndexHandler(tornado.web.RequestHandler):
	@gen.coroutine
	def get(self):
		self.render("index.html", sparkactivated=args.spark)

html_pages = {
}

class SimpleHtmlHandlerWithId(tornado.web.RequestHandler):
	@gen.coroutine
	def get(self, id):
		my_print("Request: %s, Id: %s" % (self.request.uri, id))
		self.render( html_pages.get( self.request.uri.split('/')[1], self.request.uri.split('/')[1] + ".html"), sparkactivated=args.spark )

class SimpleHtmlHandler(tornado.web.RequestHandler):
	@gen.coroutine
	def get(self):
		my_print("Request: %s" % self.request.uri)
		self.render( html_pages.get( self.request.uri.split('/')[1], self.request.uri.split('/')[1] + ".html"), sparkactivated=args.spark )

class Application(tornado.web.Application):
	def __init__(self):
		handlers = [
			(r"^/ajax/([a-z]*)/(.*)", AjaxHandler),
			(r"^/substance/(.*)", SimpleHtmlHandlerWithId),
			(r"^/mzimage/([^/]*)\.png", MZImageHandler),
			(r"^/mzimage/([^/]*)/([^/]*)\.png", MZImageParamHandler),
			(r"^/demo/", SimpleHtmlHandler),
			(r"^/jobs/", SimpleHtmlHandler),
			(r"^/datasets/", SimpleHtmlHandler),
			(r"^/fullresults/(.*)", SimpleHtmlHandlerWithId),
			(r"/", IndexHandler)
		]
		if args.spark:
			handlers = [ (r"^/run/(.*)", RunSparkHandler) ] + handlers
		settings = dict(
			static_path=path.join(os.path.dirname(__file__), "static"),
			debug=True
		)
		config_db = config["db"]
		tornado.web.Application.__init__(self, handlers, **settings)
		# Have one global connection to the blog DB across all handlers
		self.db = tornpsql.Connection(config_db['host'], config_db['db'], config_db['user'], config_db['password'], 5432)
		if args.spark:
			self.conf = SparkConf().setMaster("local[2]").setAppName("IMS Webserver v0.2").set("spark.ui.showConsoleProgress", "false")
			self.sc = SparkContext(conf=self.conf)
			self.status = self.sc.statusTracker()
		self.max_jobid = self.db.get("SELECT max(id) as maxid FROM jobs").maxid
		self.max_jobid = int(self.max_jobid) if self.max_jobid != None else 0
		self.jobs = {}
		self.all_datasets = [d["dataset"] for d in self.db.query("SELECT dataset FROM datasets ORDER BY dataset_id")]

	def get_next_job_id(self):
		self.max_jobid += 1
		return self.max_jobid

	def add_job(self, spark_id, formula_id, data_id, job_type, started, chunks=1):
		job_id = self.get_next_job_id()
		self.jobs[job_id] = {
			"type" : job_type,
			"spark_id" : spark_id,
			"formula_id" : formula_id,
			"started" : started,
			"finished" : started,
			"chunks" : chunks,
			"chunk_size" : 0,
			"chunks_done" : 0
		}
		self.db.query('''
			INSERT INTO jobs VALUES (%d, %d, '%s', %d, false, 'RUNNING', %d, %d, '%s', '%s')
		''' % (job_id, job_type, formula_id, data_id, 0, 0, str(started), str(started)) )
		return job_id


	def update_all_jobs_callback(self):
		try:
			my_print("updating spark jobs status...")
			for job_id, v in self.jobs.iteritems():
				if v["finished"] == v["started"]:
					self.update_job_status(job_id)
		finally:
			tornado.ioloop.IOLoop.instance().add_timeout(timedelta(seconds=5), self.update_all_jobs_callback)

	def update_job_status(self, job_id):
		v = self.jobs[job_id]
		jobinfo = self.status.getJobInfo(v["spark_id"])
		done_string = 'false' if jobinfo.status == 'RUNNING' else 'true'
		total_total = v["chunk_size"] * v["chunks"]
		if v["finished"] == v["started"] and done_string == "true":
			v["chunks_done"] += 1
			if v["chunks_done"] == v["chunks"]:
				v["finished"] = datetime.now()
			total_done = v["chunk_size"] * v["chunks_done"]
		else:
			(nTasks, nActive, nComplete) = (0, 0, 0)
			for sid in jobinfo.stageIds:
				stageinfo = self.status.getStageInfo(sid)
				if stageinfo:
					nTasks += stageinfo.numTasks
					nActive += stageinfo.numActiveTasks
					nComplete += stageinfo.numCompletedTasks
				if v["chunks"] > 0 and v["chunk_size"] == 0:
					v["chunk_size"] = nTasks
			total_done = v["chunk_size"] * v["chunks_done"] + nComplete
		total_done = min(total_done, total_total)
		my_print("Setting job totals: %d %d %d %d %d" % (v["chunk_size"], v["chunks"], v["chunks_done"], total_total, total_done))
		self.db.query('''
			UPDATE jobs SET tasks_done=%d, tasks_total=%d, status='%s', done=%s, finish='%s'
			WHERE id=%d
		''' % (total_done, total_total, jobinfo.status, done_string, str(self.jobs[job_id]["finished"]), job_id))

def main():
	try:
		port = 2347
		torn_app = Application()
		http_server = tornado.httpserver.HTTPServer(torn_app)
		http_server.listen(port)
		my_print("Starting server, listening to port %d..." % port)
		## set periodic updates
		tornado.ioloop.IOLoop.instance().add_timeout(timedelta(seconds=5), torn_app.update_all_jobs_callback)
		## start loop
		tornado.ioloop.IOLoop.instance().start()
	except KeyboardInterrupt:
		my_print( '^C received, shutting down server' )
		if args.spark:
			torn_app.sc.stop()
		# http_server.socket.close()


if __name__ == "__main__":
    main()

