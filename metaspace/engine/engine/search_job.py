"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
from datetime import datetime
from pyspark import SparkContext, SparkConf
from os.path import join, realpath, dirname
from fabric.api import local
from shutil import copytree
from os.path import exists

from engine.db import DB
from engine.dataset import Dataset
from engine.formulas import Formulas
from engine.search_results import SearchResults
from engine.formula_imager import sample_spectra, compute_sf_peak_images, compute_sf_images
from engine.formula_img_validator import filter_sf_images
from engine.theor_peaks_gen import TheorPeaksGenerator
from engine.imzml_txt_converter import ImzmlTxtConverter


ds_id_sql = "SELECT id FROM dataset WHERE name = %s"
db_id_sql = "SELECT id FROM formula_db WHERE name = %s"
max_job_id_sql = "SELECT COALESCE(MAX(id), -1) FROM job"
insert_job_sql = "INSERT INTO job VALUES (%s, %s, %s, 'SUCCEEDED', 0, 0, '2000-01-01 00:00:00', %s)"


class WorkDir(object):

    def __init__(self, ds_config, data_dir_path=None):
        self.ds_config = ds_config
        if data_dir_path:
            self.path = join(data_dir_path, ds_config['name'])
        else:
            self.path = join(dirname(dirname(__file__)), 'data', ds_config['name'])

    def copy_input_data(self, input_data_path):
        if not exists(self.path):
            print 'Copying {} to {}'.format(input_data_path, self.path)
            copytree(input_data_path, self.path)
        else:
            print 'Path {} already exists'.format(self.path)

    @property
    def imzml_path(self):
        return join(self.path, self.ds_config['inputs']['data_file'])

    @property
    def txt_path(self):
        return join(self.path, 'ds.txt')

    @property
    def coord_path(self):
        return join(self.path, 'ds_coord.txt')


class SearchJob(object):

    def __init__(self, ds_config, sm_config):
        self.db = DB(sm_config['db'])
        sconf = (SparkConf()
                 .set("spark.executor.memory", "2g")
                 .set("spark.serializer", "org.apache.spark.serializer.KryoSerializer"))
        self.sc = SparkContext(conf=sconf)

        self.ds = None
        self.formulas = None
        self.sm_config, self.ds_config = sm_config, ds_config

        self.work_dir = WorkDir(self.ds_config, data_dir_path=sm_config['fs']['data_dir'])
        self.imzml_converter = ImzmlTxtConverter(sm_config, ds_config, self.work_dir.imzml_path,
                                                 self.work_dir.txt_path, self.work_dir.coord_path)
        self.theor_peaks_gen = TheorPeaksGenerator(self.sc, sm_config, ds_config)

        self.db_id = self.db.select_one(db_id_sql, ds_config['inputs']['database'])[0]
        self.job_id = self.db.select_one(max_job_id_sql)[0] + 1

    def run(self, input_path):
        self.work_dir.copy_input_data(input_path)

        self.imzml_converter.convert()
        self.ds = Dataset(self.sc, self.work_dir.txt_path, self.work_dir.coord_path)

        self.theor_peaks_gen.run()
        self.formulas = Formulas(self.ds_config, self.db)

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
