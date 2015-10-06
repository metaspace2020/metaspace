#!/home/snikolenko/anaconda/bin/python
# -*- coding: utf8 -*
"""
.. module:: handlers_deprecated
    :synopsis: Handlers for the webserver that are not currently in use.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""
from datetime import datetime

import tornado.ioloop
import tornado.web
import tornado.httpserver
from tornado import gen

from engine.computing import run_fulldataset, run_extractmzs
from webapp.imaging import write_image, make_image_arrays
from engine.metrics_db import process_res_extractmzs, get_fulldataset_query_data, process_res_fulldataset
from engine.util import my_print, get_id_from_slug
from handlers import call_in_background, async_sleep
from webserver import get_formula_and_peak


# global variable for special case html files
html_pages = {
}


class OldPngHandler(tornado.web.RequestHandler):
    '''A RequestHandler for producing pngs. Returns a single ion image for given dataset, formula, adduct and peak.
    Available at url /demo-png. Caches the res_dict until a request arrives that requires computing a different res_dict.

    The min and max intensity is also cached for the colorbar. It is required that the client download the total
    ion image before requesting the colorbar, since the min and max values are computed during the image generation.
    '''
    cache = {}
    minmax_cache = {}

    def initialize(self):
        self.colormap = ((0x35, 0x2A, 0x87), (0x02, 0x68, 0xE1), (0x10, 0x8E, 0xD2), (0x0F, 0xAE, 0xB9),
                         (0x65, 0xBE, 0x86), (0xC0, 0xBC, 0x60), (0xFF, 0xC3, 0x37), (0xF9, 0xFB, 0x0E))
        self.bitdepth = 8

    @property
    def db(self):
        return self.application.db

    def flushed_callback(self, t0):
        def callback():
            my_print("Finished write in NewPngHandler. Took %s" % (datetime.now() - t0))
        return callback

    def res_dict(self, request_as_tuple, query_id):
        # return immediately if result is cached.
        if request_as_tuple in OldPngHandler.cache:
            my_print("request_as_tuple found in cache, returning immediately.")
            return OldPngHandler.cache[request_as_tuple]
        else:
            my_print("request was not cached; clearing cache")
            OldPngHandler.cache.clear()

        dataset_id, job_id, sf_id = map(int, request_as_tuple[:-1])
        # sf = request_as_tuple[-1]

        # coords_q = self.database.query( sql_queries['mzimage2coords'] % int(dataset_id) )
        coords_q = self.db.query(sql_queries['democoords'] % int(dataset_id))
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
                v[imInd]["ints"] = np.array(v[imInd]["ints"])
                im_q = np.percentile(v[imInd]["ints"], 99.0)
                im_rep = v[imInd]["ints"] > im_q
                v[imInd]["ints"][im_rep] = im_q
                v[imInd]["ints"] = [round(x, 2) for x in list(v[imInd]["ints"])]
        OldPngHandler.cache[request_as_tuple] = res_dict
        my_print("stored res_dict in cache")
        return res_dict

    def image_data(self, res_dict, request_as_tuple_long):
        dataset_id, job_id, sf_id, sf, adduct, peak_id = request_as_tuple_long

        # aggregated image for a formula
        if not adduct and not peak_id:
            # total image
            # flat objects out into a list
            data_list = reduce(operator.add, [np.array(r['ints']) for r in res_dict['data'].values()[0]])
            # write them to a dict
            # data_dict = defaultdict(float)
            # for data_obj in data_list:
            #     for idx, intens in zip(data_obj["sp"], data_obj["ints"]):
            #         data_dict[idx] += intens
            # convert it into the desired format
            data = {
                'sp' : range(len(data_list)),
                'ints' : data_list
            }
        # isotope image
        else:
            data = res_dict["data"][adduct][int(peak_id)]
        coords = res_dict["coords"]
        nRows, nColumns = res_dict["dimensions"]
        # find highest and lowest intensity
        # non_zero_intensities = filter(lambda x: x > 0, data["ints"])
        min_val = min(data["ints"])
        max_val = max(data["ints"])
        OldPngHandler.minmax_cache[request_as_tuple_long] = (min_val, max_val)
        normalized_max_val = max_val- min_val
        # normalize to byte (bitdepth=8)
        im_new = [list(self.colormap[0])*nColumns for _ in range(nRows)]
        for idx, intens in zip(range(len(data['ints'])), data['ints']):
            x,y = coords[idx]
            if intens == 0:
                new_val = 0
            else:
                new_val = int(255 * (intens - min_val)/normalized_max_val)
            chunk_size = math.ceil(2.0**self.bitdepth / (len(self.colormap)-1))
            color_chunk = int(new_val//chunk_size)
            pos_in_chunk = new_val % chunk_size
            l_chunk, u_chunk = self.colormap[color_chunk:color_chunk+2]
            colors = list(self.colormap[0])
            for i,(l,u) in enumerate(zip(l_chunk, u_chunk)):
                colors[i] = int(l + (u-l)*pos_in_chunk/float(chunk_size))
            print len(im_new), len(im_new[0]), x, y
            im_new[y][3*x:3*x+3] = colors
        return im_new, (nColumns, nRows)

    @gen.coroutine
    def get(self, dataset_id, job_id, sf_id, sf, adduct=None, peak_id=None):
        request_as_tuple = (dataset_id, job_id, sf_id, sf)
        request_as_tuple_long = (dataset_id, job_id, sf_id, sf, adduct, peak_id)
        query_id = "demosubst"

        if self.request.uri.split('/')[1] == "mzimage_meta":
            min_val, max_val = OldPngHandler.minmax_cache[request_as_tuple_long]
            self.write(json.dumps({"min":min_val, "max":max_val}))
            return
        # cast args to int
        peak_id, job_id, sf_id, dataset_id = int(get_id_from_slug(peak_id)) if peak_id else None, int(job_id), int(sf_id), int(dataset_id)

        def wrapper(res, res_list):
            res_list.append(res)

        # if args.time_profiling_enabled:
        #     res = []
        #     cProfile.runctx("wrapper(image_data(res_dict()), res)", globals(), locals())
        #     im_data, size = res[0]
        # else:
        im_data, size = self.image_data(self.res_dict(request_as_tuple, query_id), request_as_tuple_long)
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


class MZImageHandler(tornado.web.RequestHandler):
    """Tornado handler for a png m/z image (not used in current version)."""

    @property
    def db(self):
        return self.application.db

    @gen.coroutine
    def get(self, job_string):
        my_print(job_string)
        job_id, peak_id = get_formula_and_peak(job_string)
        my_print("Creating m/z image for job %d..." % job_id)
        params = self.db.query(
            "SELECT nrows,ncols FROM jobs j JOIN datasets d on j.dataset_id=d.dataset_id WHERE j.id=%d" % job_id)[0]
        (dRows, dColumns) = (int(params["nrows"]), int(params["ncols"]))
        if peak_id > -1:
            data = self.db.query(
                "SELECT spectrum as s,value as v FROM job_result_data WHERE job_id=%d AND peak=%d" % (job_id, peak_id))
        else:
            data = self.db.query("SELECT spectrum as s,value as v FROM job_result_data WHERE job_id=%d" % job_id)
        sio = write_image(
            make_image_arrays(dRows, dColumns, [int(row["s"]) for row in data], [float(row["v"]) for row in data]))
        self.set_header("Content-Type", "image/png")
        self.write(sio.getvalue())


class MZImageParamHandler(tornado.web.RequestHandler):
    """Tornado handler for a png m/z image from a dataset job with parameter (not used in current version)."""

    @property
    def db(self):
        return self.application.db

    @gen.coroutine
    def get(self, job_string, param_string):
        my_print(job_string)
        job_id = int(get_id_from_slug(job_string))
        formula_id, peak_id = get_formula_and_peak(param_string)
        my_print("Creating m/z image for job %d..." % job_id)
        params = self.db.query(
            "SELECT nrows,ncols FROM jobs j JOIN datasets d on j.dataset_id=d.dataset_id WHERE j.id=%d" % job_id)[0]
        (dRows, dColumns) = (int(params["nrows"]), int(params["ncols"]))
        data = self.db.query(
            "SELECT spectrum as s,value as v FROM job_result_data WHERE job_id=%d AND param=%d AND peak=%d" % (
                job_id, formula_id, peak_id))
        sio = write_image(
            make_image_arrays(dRows, dColumns, [int(row["s"]) for row in data], [float(row["v"]) for row in data]))
        self.set_header("Content-Type", "image/png")
        self.write(sio.getvalue())


fulldataset_chunk_size = 1000
adducts = ["H", "Na", "K"]


class RunSparkHandler(tornado.web.RequestHandler):
    """Tornado handler for spark jobs. Currently supports two kinds of jobs.

    1. extractmzs -- find peaks for a single sum formula.
    2. fulldataset -- find peaks for all formulas in a dataset.
    """

    @property
    def db(self):
        return self.application.db

    def result_callback(response):
        """Dummy response."""
        my_print("Got response! %s" % response)

    def strings_to_dict(self, stringresults):
        """Converts input strings in a txt file into the :code:`{ m/z : intensity }` dictionary.
        Supports multiple occurrences of the same m/z value (will add intensities).
        """
        res_dict = {int(x.split(':')[0]): float(x.split(':')[1]) for x in stringresults[0].split(' ')}
        for res_string in stringresults[1:]:
            res_dict.update(
                {int(x.split(':')[0]): float(x.split(':')[1]) + res_dict.get(int(x.split(':')[0]), 0.0) for x in
                 res_string.split(' ')})
        return res_dict

    @gen.coroutine
    def post(self, query_id):
        my_print("called /run/" + query_id)

        self.dataset_id = int(self.get_argument("dataset_id"))
        dataset_params = \
            self.db.query("SELECT filename,nrows,ncols FROM datasets WHERE dataset_id=%d" % self.dataset_id)[0]
        self.nrows = dataset_params["nrows"]
        self.ncols = dataset_params["ncols"]
        self.fname = dataset_params["filename"]
        self.job_id = -1
        # we want to extract m/z values
        if query_id == "extractmzs":
            self.formula_id = self.get_argument("sf_id")
            self.job_type = 0
            tol = 3 * (1e-6)
            formula_data = self.db.query("SELECT adduct,peaks,ints FROM mz_peaks WHERE sf_id=%d" % int(self.formula_id))
            peaks = {}
            self.intensities = {}
            for row in formula_data:
                peaks[row["adduct"]] = row["peaks"]
                self.intensities[row["adduct"]] = row["ints"]
            data = {k: [[float(x) * (1 - tol), float(x) * (1 + tol)] for x in pks] for k, pks in peaks.iteritems()}
            my_print("Running m/z extraction for formula id %s. Input data:" % self.formula_id)
            my_print("\n".join(
                ["\t%s\t%s" % (adducts[k], " ".join(["[%.3f, %.3f]" % (x[0], x[1]) for x in d])) for k, d in
                 data.iteritems()]))

            cur_jobs = set(self.application.status.getActiveJobsIds())
            my_print("Current jobs: %s" % cur_jobs)
            result = call_in_background(run_extractmzs,
                                        *(self.application.sc, self.fname, data, self.nrows, self.ncols))
            self.spark_job_id = -1
            while self.spark_job_id == -1:
                yield async_sleep(1)
                my_print("Current jobs: %s" % set(self.application.status.getActiveJobsIds()))
                if len(set(self.application.status.getActiveJobsIds()) - cur_jobs) > 0:
                    self.spark_job_id = list(set(self.application.status.getActiveJobsIds()) - cur_jobs)[0]
            # if this job hasn't started yet, add it
            if self.job_id == -1:
                self.job_id = self.application.add_job(self.spark_job_id, self.formula_id, self.dataset_id,
                                                       self.job_type, datetime.now())
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
            tol = 3 * (1e-6)
            self.formulas, self.mzadducts, mzpeaks, self.intensities, data = get_fulldataset_query_data(self.db,
                                                                                                        tol=tol)
            my_print(prefix + "looking for %d peaks" % sum([len(x) for x in data]))
            self.num_chunks = 1 + len(data) / fulldataset_chunk_size
            self.job_id = self.application.add_job(-1, self.formula_id, self.dataset_id, self.job_type, datetime.now(),
                                                   chunks=self.num_chunks)
            # for i in xrange(self.num_chunks):
            for i in xrange(1):
                my_print("Processing chunk %d..." % i)
                cur_jobs = set(self.application.status.getActiveJobsIds())
                my_print("Current jobs: %s" % cur_jobs)
                result = call_in_background(run_fulldataset, *(
                    self.application.sc, self.fname, data[fulldataset_chunk_size * i:fulldataset_chunk_size * (i + 1)],
                    self.nrows, self.ncols))
                self.spark_job_id = -1
                while self.spark_job_id == -1:
                    yield async_sleep(1)
                    my_print("Current jobs: %s" % set(self.application.status.getActiveJobsIds()))
                    if len(set(self.application.status.getActiveJobsIds()) - cur_jobs) > 0:
                        self.spark_job_id = list(set(self.application.status.getActiveJobsIds()) - cur_jobs)[0]
                # if this job hasn't started yet, add it
                if self.job_id == -1:
                    self.job_id = self.application.add_job(self.spark_job_id, self.formula_id, self.dataset_id,
                                                           self.job_type, datetime.now())
                else:
                    self.application.jobs[self.job_id]["spark_id"] = self.spark_job_id
                while result.empty():
                    yield async_sleep(1)
                my_print("Processing results...")
                res_dicts = result.get()
                process_res_fulldataset(self.db, res_dicts, self.formulas, self.mzadducts, self.intensities, self.nrows,
                                        self.ncols, self.job_id, offset=fulldataset_chunk_size * i)
        else:
            my_print("[ERROR] Incorrect run query %s!" % query_id)
            return
