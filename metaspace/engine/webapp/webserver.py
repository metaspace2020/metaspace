#!/usr/bin/python
# -*- coding: utf8 -*

"""
.. module:: webserver
    :synopsis: The main webserver file.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""
import json
from os import path
import argparse
import os
from datetime import datetime, timedelta

import tornado.ioloop
import tornado.web
import tornado.httpserver
import tornpsql

import handlers
from engine.util import my_print


# get list of engine files
engine_pyfiles = ['computing.py', 'util.py', 'imaging.py',
                  path.join('pyIMS', 'image_measures', 'level_sets_measure.py')]

# global variables
args = None
config = None


# def get_formula_and_peak(s):
#     arr = get_id_from_slug(s).split('p')
#     if len(arr) > 1:
#         return int(arr[0]), int(arr[1])
#     else:
#         return int(arr[0]), -1


class Application(tornado.web.Application):
    """Main class of the tornado application."""

    def __init__(self):
        """Initializes handlers, including the spark handler, sets up database connection."""

        torn_handlers = [
            (r"/", handlers.IndexHandler),
            (r"/static/(.*)", tornado.web.StaticFileHandler, {"path": path.join(path.dirname(__file__), "static")}),
            (r"^/ajax/([a-z]*)/(.*)", handlers.AjaxHandler),
            (r"^/mzimage2/([^/]+)/([^/]+)/([^/]+)/([^/]+)", handlers.AggIsoImgPngHandler),
            (r"^/mzimage2/([^/]+)/([^/]+)/([^/]+)/([^/]+)/([^/]+)/([^/]+)/([^/]+)", handlers.IsoImgPngHandler),
            (r"^/spectrum_line_chart_data/([^/]+)/([^/]+)/([^/]+)/([^/]+)", handlers.SpectrumLineChartHandler),
            (r"^/sf_peak_mzs/([^/]+)/([^/]+)/([^/]+)/([^/]+)", handlers.SFPeakMZsHandler),
            (r"^/min_max_int/([^/]+)/([^/]+)/([^/]+)/([^/]+)", handlers.MinMaxIntHandler),
            (r"^/demo", handlers.AjaxHandler)
        ]
        # you can add deprecated handlers by specifying --use-deprecated in the command line
        if args.use_deprecated:
            import handlers_deprecated
            torn_handlers.extend([
                (r"^/fullresults/(.*)", handlers.SimpleHtmlHandlerWithId),
                (r"^/substance/(.*)", handlers.SimpleHtmlHandlerWithId),
                (r"^/demo/", handlers.SimpleHtmlHandler),
                (r"^/demo-png/", handlers.SimpleHtmlHandler),
                (r"^/jobs/", handlers.SimpleHtmlHandler),
                (r"^/datasets/", handlers.SimpleHtmlHandler),
                (r"^/mzimage/([^/]*)\.png", handlers_deprecated.MZImageHandler),
                (r"^/mzimage/([^/]*)/([^/]*)\.png", handlers_deprecated.MZImageParamHandler)
            ])
            # only if spark is used we add the RunSparkHandler
            if args.spark:
                from pyspark import SparkContext, SparkConf
                torn_handlers.extend([(r"^/run/(.*)", handlers_deprecated.RunSparkHandler)])
        settings = dict(
            static_path=path.join(path.dirname(__file__), "static"),
            debug=True,
            compress_response=True
        )
        config_db = config["db"]
        tornado.web.Application.__init__(self, torn_handlers, **settings)
        # Have one global connection to the blog DB across all handlers
        self.db = tornpsql.Connection(config_db['host'], config_db['database'], config_db['user'],
                                      config_db['password'], 5432)
        if args.spark:
            self.conf = SparkConf().setMaster("local[2]").setAppName("IMS Webserver v0.2").set(
                "spark.ui.showConsoleProgress", "false")
            self.sc = SparkContext(conf=self.conf,
                                   pyFiles=[path.join(os.getcwd(), 'engine', x) for x in engine_pyfiles])
            self.status = self.sc.statusTracker()
        # self.max_jobid = self.db.get("SELECT max(id) as maxid FROM jobs").maxid
        # self.max_jobid = int(self.max_jobid) if self.max_jobid != None else 0
        # self.jobs = {}
        # self.all_datasets = [d["dataset"] for d in self.db.query("SELECT dataset FROM datasets ORDER BY dataset_id")]

    # def get_next_job_id(self):
    #     self.max_jobid += 1
    #     return self.max_jobid

    # def add_job(self, spark_id, formula_id, data_id, job_type, started, chunks=1):
    #     """Adds a job to the job table of the database and to the application queue."""
    #     job_id = self.get_next_job_id()
    #     self.jobs[job_id] = {
    #         "type": job_type,
    #         "spark_id": spark_id,
    #         "formula_id": formula_id,
    #         "started": started,
    #         "finished": started,
    #         "chunks": chunks,
    #         "chunk_size": 0,
    #         "chunks_done": 0
    #     }
    #     self.db.query('''
    #         INSERT INTO jobs VALUES (%d, %d, '%s', %d, false, 'RUNNING', %d, %d, '%s', '%s')
    #     ''' % (job_id, job_type, formula_id, data_id, 0, 0, str(started), str(started)))
    #     return job_id

    def update_all_jobs_callback(self):
        """For each job, checks whether its status has changed."""
        try:
            my_print("updating spark jobs status...")
            for job_id, v in self.jobs.iteritems():
                if v["finished"] == v["started"]:
                    self.update_job_status(job_id)
        finally:
            tornado.ioloop.IOLoop.instance().add_timeout(timedelta(seconds=5), self.update_all_jobs_callback)

    def update_job_status(self, job_id):
        """Updates a spark job's status based on information from getJobInfo()."""
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
        my_print("Setting job totals: %d %d %d %d %d" % (
            v["chunk_size"], v["chunks"], v["chunks_done"], total_total, total_done))
        self.db.query('''
            UPDATE jobs SET tasks_done=%d, tasks_total=%d, status='%s', done=%s, finish='%s'
            WHERE id=%d
            ''' % (total_done, total_total, jobinfo.status, done_string, str(self.jobs[job_id]["finished"]), job_id))


def main():
    """Creates tornado application, handles keyboard interrupts (to release the http socket)."""
    global args, config

    parser = argparse.ArgumentParser(description='IMS webserver.')
    parser.add_argument('--no-spark', dest='spark', action='store_true')
    parser.add_argument('--config', dest='config', type=str, help='config file name')
    parser.add_argument('--port', dest='port', type=int, help='port on which to access the web server')
    parser.add_argument('--profile', dest='time_profiling_enabled', action='store_true')
    parser.add_argument('--use-deprecated', dest='use_deprecated', action='store_true')
    parser.set_defaults(spark=False, config='config.json', port=8080, time_profiling_enabled=False,
                        use_deprecated=False)
    args = parser.parse_args()
    handlers.args = args

    if args.spark:
        from pyspark import SparkContext, SparkConf

    with open(args.config) as f:
        config = json.load(f)

    port = args.port
    torn_app = Application()
    http_server = tornado.httpserver.HTTPServer(torn_app)
    http_server.listen(port)
    my_print("Starting server, listening to port %d..." % port)
    try:
        # set periodic updates
        if args.spark:
            tornado.ioloop.IOLoop.instance().add_timeout(timedelta(seconds=5), torn_app.update_all_jobs_callback)
        # start loop
        tornado.ioloop.IOLoop.instance().start()
    except KeyboardInterrupt:
        my_print('^C received, shutting down server')
        if args.spark:
            torn_app.sc.stop()
        http_server.stop()


if __name__ == "__main__":
    main()
