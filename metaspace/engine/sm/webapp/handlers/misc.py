# -*- coding: utf8 -*
"""
.. module:: handlers
    :synopsis: Handlers for the webserver.

.. moduleauthor:: Sergey Nikolenko <snikolenko@gmail.com>
"""
import traceback

from sm.engine.isocalc_wrapper import IsocalcWrapper, trim_centroids, ISOTOPIC_PEAK_N

import json
import logging
import numpy as np
import tornado.ioloop
import tornado.web
import tornado.httpserver
from tornado import gen


SF_SELECT = "SELECT sf FROM sum_formula WHERE db_id=%s AND id=%s"

logger = logging.getLogger('sm-web-app')


def clean_adduct(adduct):
    return '' if adduct == 'None' else adduct


class IndexHandler(tornado.web.RequestHandler):
    """Tornado handler for the index page."""

    @gen.coroutine
    def get(self):
        self.render("index.html")

def dataset_config(db, ds_id):
    DS_CONF_SEL = 'SELECT config FROM dataset where id = %s'
    return db.query(DS_CONF_SEL, ds_id)[0]['config']

class SFPeakMZsHandler(tornado.web.RequestHandler):
    @property
    def db(self):
        return self.application.db

    def write_error(self, status_code, **kwargs):
        logger.error('{} - {}'.format(status_code, ''.join(traceback.format_exception(*kwargs['exc_info']))))

    @gen.coroutine
    def get(self, ds_id, db_id, sf_id, adduct):
        ds_config = dataset_config(self.db, ds_id)
        isocalc = IsocalcWrapper(ds_config['isotope_generation'])
        sf = self.db.query(SF_SELECT, db_id, sf_id)[0].sf
        centroids = isocalc.isotope_peaks(sf, clean_adduct(adduct))
        centr_mzs, _ = trim_centroids(centroids.mzs, centroids.ints, ISOTOPIC_PEAK_N)
        self.write(json.dumps(centr_mzs.tolist()))


class MinMaxIntHandler(tornado.web.RequestHandler):
    MIN_MAX_INT_SEL = '''SELECT min_int, max_int
                         FROM iso_image
                         WHERE job_id = %s and db_id = %s and sf_id = %s and adduct = %s;'''

    def write_error(self, status_code, **kwargs):
        logger.error('{} - {}'.format(status_code, ''.join(traceback.format_exception(*kwargs['exc_info']))))

    def get_current_user(self):
        return self.get_secure_cookie('client_id')

    @gen.coroutine
    def get(self, job_id, db_id, sf_id, adduct):
        job_id, db_id, sf_id, adduct = int(job_id), int(db_id), int(sf_id), clean_adduct(adduct)
        if self.current_user:
            logger.debug('USER_ID={} tries to access the DB'.format(self.current_user))
        else:
            logger.debug('Not authenticated USER_ID tries to access the DB')
        min_max_rs = self.application.db.query(self.MIN_MAX_INT_SEL, job_id, db_id, sf_id, adduct)
        min_max_dict = min_max_rs[0] if min_max_rs else {'min_int': 0, 'max_int': 0}
        self.write(json.dumps(min_max_dict))


class SpectrumLineChartHandler(tornado.web.RequestHandler):
    SAMPLE_INTENS_SQL = '''SELECT pixel_inds, intensities
                           FROM iso_image
                           WHERE job_id = %s and db_id = %s and sf_id = %s and adduct = %s
                           ORDER by peak'''

    def write_error(self, status_code, **kwargs):
        logger.error('{} - {}'.format(status_code, ''.join(traceback.format_exception(*kwargs['exc_info']))))

    @property
    def db(self):
        return self.application.db

    # TODO: move metric calculation logic to the engine
    @staticmethod
    def sample_centr_ints_norm(sample_ints_list):
        first_peak_inds = set(sample_ints_list[0]['pixel_inds'])
        sample_centr_ints = []
        for peak_d in sample_ints_list:
            peak_int_sum = 0
            first_peak_inds_mask = np.array([i in first_peak_inds for i in peak_d['pixel_inds']])
            if first_peak_inds_mask.size > 0:
                peak_int_sum = np.array(peak_d['intensities'])[first_peak_inds_mask].sum()
            sample_centr_ints.append(peak_int_sum)

        sample_centr_ints = np.asarray(sample_centr_ints)
        return sample_centr_ints / sample_centr_ints.max() * 100

    @gen.coroutine
    def get(self, ds_id, job_id, db_id, sf_id, adduct):
        ds_id, job_id, db_id, sf_id, adduct = ds_id, int(job_id), int(db_id), int(sf_id), clean_adduct(adduct)
        ds_config = dataset_config(self.db, ds_id)
        isocalc = IsocalcWrapper(ds_config['isotope_generation'])

        sf = self.db.query(SF_SELECT, db_id, sf_id)[0].sf
        chart = isocalc.isotope_peaks(sf, adduct).spectrum_chart()

        sample_centr_ints_norm = []
        sample_ints_list = self.db.query(self.SAMPLE_INTENS_SQL, job_id, db_id, sf_id, adduct)
        if sample_ints_list:
            sample_centr_ints_norm = self.sample_centr_ints_norm(sample_ints_list)

        chart['ppm'] = ds_config['image_generation']['ppm']
        chart['sample'] = {
            'mzs': chart['theor']['centroid_mzs'],
            'ints': sample_centr_ints_norm.tolist()
        }

        self.write(json.dumps(chart))
