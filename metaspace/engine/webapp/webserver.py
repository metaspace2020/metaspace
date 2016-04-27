#!/usr/bin/python
# -*- coding: utf8 -*

"""
.. module:: webserver
    :synopsis: The main webserver file.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""
import argparse
import json
from datetime import datetime, timedelta
from os import path

import tornado.httpserver
import tornado.ioloop
import tornado.web
import tornpsql

from handlers import results_table, iso_image_gen, misc, auth, feedback
from util import my_print

# get list of engine files
engine_pyfiles = ['computing.py', 'util.py', 'imaging.py',
                  path.join('pyImagingMSpec', 'image_measures', 'level_sets_measure.py')]

# global variables
args = None
config = None


class Application(tornado.web.Application):
    """Main class of the tornado application."""

    def __init__(self, debug=False):
        """Initializes handlers, including the spark handler, sets up database connection."""

        handlers = [
            (r"/", misc.IndexHandler),
            (r"/auth", auth.AuthenticateClient),
            (r"/feedback-rating", feedback.FeedbackRating),
            (r"/feedback-comment", feedback.FeedbackComment),
            # (r"/static/(.*)", tornado.web.StaticFileHandler, {"path": path.join(path.dirname(__file__), "static")}),
            (r"^/results_table/(.*)", results_table.ResultsTableHandler),
            (r"^/mzimage2/([^/]+)/([^/]+)/([^/]+)/([^/]+)/([^/]+)", iso_image_gen.AggIsoImgPngHandler),
            (r"^/mzimage2/([^/]+)/([^/]+)/([^/]+)/([^/]+)/([^/]+)/([^/]+)/([^/]+)", iso_image_gen.IsoImgPngHandler),
            (r"^/spectrum_line_chart_data/([^/]+)/([^/]+)/([^/]+)/([^/]+)", misc.SpectrumLineChartHandler),
            (r"^/sf_peak_mzs/([^/]+)/([^/]+)/([^/]+)/([^/]+)", misc.SFPeakMZsHandler),
            (r"^/min_max_int/([^/]+)/([^/]+)/([^/]+)/([^/]+)", misc.MinMaxIntHandler),
        ]
        settings = dict(
            static_path=path.join(path.dirname(__file__), 'static'),
            template_path=path.join(path.dirname(__file__), 'html'),
            cookie_secret='59x6wj71r6462o16PSFsouy5QnaviACW',
            debug=debug,
            compress_response=True
        )
        config_db = config["db"]
        tornado.web.Application.__init__(self, handlers, **settings)
        # Have one global connection to the blog DB across all handlers
        self.db = tornpsql.Connection(config_db['host'], config_db['database'], config_db['user'],
                                      config_db['password'], 5432)

        # hack needed to overcome sending expensive query every time results table is filtered or sorted
        self.adducts = [row['adduct'] for row in self.db.query('select distinct(target_add) as adduct from target_decoy_add')]

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
    parser.add_argument('--config', dest='config', type=str, help='config file name')
    parser.add_argument('--port', dest='port', type=int, help='port on which to access the web server')
    parser.add_argument('--profile', dest='time_profiling_enabled', action='store_true')
    parser.add_argument('--use-deprecated', dest='use_deprecated', action='store_true')
    parser.add_argument('--debug', dest='debug', action='store_true')
    parser.set_defaults(spark=False, config='config.json', port=8080, time_profiling_enabled=False,
                        use_deprecated=False)
    args = parser.parse_args()
    # handlers.args = args

    with open(args.config) as f:
        config = json.load(f)

    port = args.port
    torn_app = Application(args.debug)
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
