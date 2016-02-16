# -*- coding: utf8 -*
"""
.. module:: handlers
    :synopsis: Handlers for the webserver.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""
import json
import threading
import Queue
import operator
import math
from datetime import time, datetime

import numpy as np
from scipy.stats import mode
from scipy import ndimage

import tornado.ioloop
import tornado.web
import tornado.httpserver
from tornado import gen
from tornado.ioloop import IOLoop

from util import my_print


@gen.coroutine
def async_sleep(seconds):
    """Sleep for a given number of seconds."""
    yield gen.Task(IOLoop.instance().add_timeout, time.time() + seconds)


def call_in_background(f, *args):
    """Call function in background in a separate thread / coroutine"""
    result = Queue.Queue(1)
    t = threading.Thread(target=lambda: result.put(f(*args)))
    t.start()
    return result


class IndexHandler(tornado.web.RequestHandler):
    """Tornado handler for the index page."""

    @gen.coroutine
    def get(self):
        self.render("index.html")


class SimpleHtmlHandlerWithId(tornado.web.RequestHandler):
    """Tornado handler for an html file with a parameter."""

    @gen.coroutine
    def get(self, id):
        my_print("Request: %s, Id: %s" % (self.request.uri, id))
        self.render(html_pages.get(self.request.uri.split('/')[1], 'html/' + self.request.uri.split('/')[1] + ".html"),
                    sparkactivated=args.spark)


class SimpleHtmlHandler(tornado.web.RequestHandler):
    """Tornado handler for an html file without parameters."""

    @gen.coroutine
    def get(self):
        my_print("Request: %s" % self.request.uri)
        self.render(html_pages.get(self.request.uri.split('/')[1], 'html/' + self.request.uri.split('/')[1] + ".html"),
                    sparkactivated=args.spark)


class SFPeakMZsHandler(tornado.web.RequestHandler):
    peak_profile_sql = '''select centr_mzs
                       from theor_peaks
                       where db_id = %s and sf_id = %s and adduct = %s'''

    @gen.coroutine
    def get(self, job_id, db_id, sf_id, adduct):
        peaks_dict = self.application.db.query(self.peak_profile_sql, int(db_id), int(sf_id), adduct)[0]
        centr_mzs = peaks_dict['centr_mzs']
        self.write(json.dumps(centr_mzs))
class MinMaxIntHandler(tornado.web.RequestHandler):
    min_max_int_sql = '''SELECT min_int, max_int
                         FROM iso_image
                         WHERE job_id = %s and db_id = %s and sf_id = %s and adduct = %s;'''

    @gen.coroutine
    def get(self, job_id, db_id, sf_id, adduct):
        min_max_row = self.application.db.query(self.min_max_int_sql, int(job_id), int(db_id), int(sf_id), adduct)[0]
        self.write(json.dumps(min_max_row))


class SpectrumLineChartHandler(tornado.web.RequestHandler):
    PEAK_PROFILE_SQL = '''SELECT centr_mzs, centr_ints, prof_mzs, prof_ints
                          FROM theor_peaks
                          WHERE db_id = %s and sf_id = %s and adduct = %s'''
    SAMPLE_INTENS_SQL = '''SELECT pixel_inds, intensities
                           FROM iso_image
                           WHERE job_id = %s and db_id = %s and sf_id = %s and adduct = %s order by peak'''

    @property
    def db(self):
        return self.application.db

    @staticmethod
    def find_closest_inds(mz_grid, mzs):
        return map(lambda mz: (np.abs(mz_grid - mz)).argmin(), mzs)

    @staticmethod
    def to_str(list_of_numbers):
        return map(lambda x: '%.3f' % x, list(list_of_numbers))

    def convert_to_serial(self, centr_mzs, prof_mzs):
        step = mode(np.diff(prof_mzs)).mode[0]
        min_mz = prof_mzs[0] - 0.25
        max_mz = prof_mzs[-1] + 0.25

        points_n = int(np.round((max_mz - min_mz) / step)) + 1
        mz_grid = np.linspace(min_mz, max_mz, points_n)

        centr_inds = self.find_closest_inds(mz_grid, centr_mzs)
        prof_inds = self.find_closest_inds(mz_grid, prof_mzs)

        return min_mz, max_mz, points_n, centr_inds, prof_inds

    # TODO: remove metrics calculation logic from here
    @staticmethod
    def sample_centr_ints_norm(sample_ints_list):
        first_peak_inds = set(sample_ints_list[0]['pixel_inds'])
        sample_centr_ints = []
        for peak_d in sample_ints_list:
            flt_peak_inds_mask = np.array(map(lambda i: i in first_peak_inds, peak_d['pixel_inds']))
            peak_int_sum = np.array(peak_d['intensities'])[flt_peak_inds_mask].sum()
            sample_centr_ints.append(peak_int_sum)

        sample_centr_ints = np.asarray(sample_centr_ints)
        return sample_centr_ints / sample_centr_ints.max() * 100

    @gen.coroutine
    def get(self, job_id, db_id, sf_id, adduct):
        peaks_dict = self.db.query(self.PEAK_PROFILE_SQL, int(db_id), int(sf_id), adduct)[0]
        prof_mzs = np.array(peaks_dict['prof_mzs'])
        prof_ints = np.array(peaks_dict['prof_ints'])
        centr_mzs = np.array(peaks_dict['centr_mzs'])

        min_mz, max_mz, points_n, centr_inds, prof_inds = self.convert_to_serial(centr_mzs, prof_mzs)

        sample_ints_list = self.db.query(self.SAMPLE_INTENS_SQL, int(job_id), int(db_id), int(sf_id), adduct)
        sample_centr_ints_norm = self.sample_centr_ints_norm(sample_ints_list)

        self.write(json.dumps({
            'mz_grid': {
                'min_mz': min_mz,
                'max_mz': max_mz,
                'points_n': points_n,
            },
            'sample': {
                'inds': centr_inds,
                'ints': self.to_str(sample_centr_ints_norm)
            },
            'theor': {
                'inds': prof_inds,
                'ints': self.to_str(prof_ints)
            }
        }))






