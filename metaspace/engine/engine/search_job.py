"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import numpy as np
import json
from datetime import datetime
from pyspark import SparkContext, SparkConf

from engine.db import DB
from engine.dataset import Dataset
from engine.formulas import Formulas
from engine.search_results import SearchResults
from engine.formula_imager import sample_spectra, compute_sf_peak_images, compute_sf_images
from engine.formula_img_validator import filter_sf_images


ds_id_sql = "SELECT id FROM dataset WHERE name = %s"
db_id_sql = "SELECT id FROM formula_db WHERE name = %s"
max_job_id_sql = "SELECT COALESCE(MAX(id), -1) FROM job"
insert_job_sql = "INSERT INTO job VALUES (%s, %s, %s, 'SUCCEEDED', 0, 0, '2000-01-01 00:00:00', %s)"


class SearchJob(object):

    def __init__(self, ds_path, coord_path, ds_config, sm_config):
        self.db = DB(sm_config['db'])
        sconf = (SparkConf()
                 .set("spark.executor.memory", "2g")
                 .set("spark.serializer", "org.apache.spark.serializer.KryoSerializer"))
        self.sc = SparkContext(conf=sconf)

        self.ds = Dataset(self.sc, ds_path, coord_path)
        self.formulas = Formulas(ds_config, self.db)
        self.sm_config, self.ds_config = sm_config, ds_config

        self.db_id = self.db.select_one(db_id_sql, self.formulas.db_name)
        self.job_id = self.db.select_one(max_job_id_sql)[0] + 1

    def run(self):
        search_results = self._search()
        self._store_results(search_results)
        self._store_job_meta()
        self.db.close()

    def _search(self):
        sf_sp_intens = sample_spectra(self.sc, self.ds, self.formulas)
        sf_peak_imgs = compute_sf_peak_images(self.ds, sf_sp_intens)
        sf_images = compute_sf_images(sf_peak_imgs)
        sf_iso_images_map, sf_metrics_map = filter_sf_images(self.sc, self.ds_config, self.ds, self.formulas, sf_images)

        return SearchResults(self.job_id, self.db_id,
                             sf_iso_images_map, sf_metrics_map,
                             self.formulas.get_sf_adduct_peaksn(),
                             self.db)

    def _store_results(self, search_results):
        search_results.save_sf_img_metrics()
        nrows, ncols = self.ds.get_dims()
        search_results.save_sf_iso_images(nrows, ncols)

    def _store_job_meta(self):
        ds_id = self.db.select_one(ds_id_sql, self.ds_config['name'])[0]

        rows = [(self.job_id, self.db_id, ds_id, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))]
        self.db.insert(insert_job_sql, rows)
