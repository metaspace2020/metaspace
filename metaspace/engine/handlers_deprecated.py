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
from engine.imaging import write_image, make_image_arrays
from engine.metrics_db import process_res_extractmzs, get_fulldataset_query_data, process_res_fulldataset
from engine.util import my_print, get_id_from_slug
from handlers import call_in_background, async_sleep
from webserver import get_formula_and_peak


# global variable for special case html files
html_pages = {
}


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
