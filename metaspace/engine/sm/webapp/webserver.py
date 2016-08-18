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

# global variables
args = None
config = None


class Application(tornado.web.Application):
    """Main class of the tornado application."""

    def __init__(self, debug=False):
        """Initializes handlers, sets up database connection."""

        handlers = [
            (r"/", misc.IndexHandler),
            (r"/auth", auth.AuthenticateClient),
            (r"/feedback-rating", feedback.FeedbackRating),
            (r"/feedback-comment", feedback.FeedbackComment),
            # (r"/static/(.*)", tornado.web.StaticFileHandler, {"path": path.join(path.dirname(__file__), "static")}),
            (r"^/results_table/(.*)", results_table.ResultsTableHandler),
            (r"^/mzimage2/([^/]+)/([^/]+)/([^/]+)/([^/]+)/([^/]+)/([^/]+)", iso_image_gen.AggIsoImgPngHandler),
            (r"^/mzimage2/([^/]+)/([^/]+)/([^/]+)/([^/]+)/([^/]+)/([^/]+)/([^/]+)", iso_image_gen.IsoImgPngHandler),
            (r"^/spectrum_line_chart_data/([^/]+)/([^/]+)/([^/]+)/([^/]+)/([^/]+)", misc.SpectrumLineChartHandler),
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


def main():
    """Creates tornado application, handles keyboard interrupts (to release the http socket)."""
    global args, config

    parser = argparse.ArgumentParser(description='IMS webserver.')
    parser.add_argument('--config', dest='config', type=str, help='config file name')
    parser.add_argument('--port', dest='port', type=int, help='port on which to access the web server')
    parser.add_argument('--profile', dest='time_profiling_enabled', action='store_true')
    parser.add_argument('--use-deprecated', dest='use_deprecated', action='store_true')
    parser.add_argument('--debug', dest='debug', action='store_true')
    args = parser.parse_args()
    # handlers.args = args

    with open(args.config) as f:
        config = json.load(f)

    port = args.port
    torn_app = Application(args.debug)
    http_server = tornado.httpserver.HTTPServer(torn_app)
    http_server.listen(port)
    print "Starting server, listening to port %d..." % port
    try:
        # start loop
        tornado.ioloop.IOLoop.instance().start()
    except KeyboardInterrupt:
        print '^C received, shutting down server'
        http_server.stop()


if __name__ == "__main__":
    main()
