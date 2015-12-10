"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
from datetime import datetime
from pyspark import SparkContext, SparkConf
from os.path import join, realpath, dirname
import json

from engine.db import DB
from engine.dataset import Dataset
from engine.formulas import Formulas
from engine.search_results import SearchResults
from engine.formula_imager import sample_spectra, compute_sf_peak_images, compute_sf_images
from engine.formula_img_validator import filter_sf_images
from engine.theor_peaks_gen import TheorPeaksGenerator
from engine.imzml_txt_converter import ImzmlTxtConverter
from engine.work_dir import WorkDir
from engine.util import local_path, hdfs_path, proj_root, hdfs_prefix, cmd_check, cmd, SMConfig

ds_id_sql = "SELECT id FROM dataset WHERE name = %s"
db_id_sql = "SELECT id FROM formula_db WHERE name = %s"
max_ds_id_sql = "SELECT COALESCE(MAX(id), -1) FROM dataset"
insert_job_sql = "INSERT INTO job VALUES (%s, %s, %s, 'SUCCEEDED', 0, 0, '2000-01-01 00:00:00', %s)"


class SearchJob(object):

    def __init__(self, ds_name):
        self.sm_config = SMConfig.get_conf()
        self.ds_name = ds_name
        self.ds_id = None
        self.job_id = None
        self.sc = None
        self.ds = None
        self.formulas = None
        self.ds_config = None
        self.work_dir = None

    def _read_config(self):
        with open(self.work_dir.ds_config_path) as f:
            self.ds_config = json.load(f)

    def _configure_spark(self):
        sconf = SparkConf()
        sconf.set("spark.executor.memory", self.sm_config['spark']['executor.memory'])
        sconf.set("spark.serializer", "org.apache.spark.serializer.KryoSerializer")
        self.sc = SparkContext(master=self.sm_config['spark']['master'], conf=sconf, appName='SM engine')
        self.sc.addPyFile(join(local_path(proj_root()), 'engine.zip'))

    def _choose_ds_job_id(self):
        ds_id_row = self.db.select_one(ds_id_sql, self.ds_name)
        if ds_id_row:
            self.ds_id = ds_id_row[0]
        else:
            self.ds_id = self.db.select_one(max_ds_id_sql)[0] + 1
        # TODO: decide if we need both db_id and job_id
        self.job_id = self.ds_id

    def _init_db(self):
        self.db = DB(self.sm_config['db'])
        self.sf_db_id = self.db.select_one(db_id_sql, self.ds_config['inputs']['database'])[0]
        self._choose_ds_job_id()

    def run(self, input_path):
        self.work_dir = WorkDir(self.ds_name, self.sm_config['fs']['data_dir'])
        self.work_dir.copy_input_data(input_path)
        self._read_config()
        print self.ds_config

        self._configure_spark()
        self._init_db()

        imzml_converter = ImzmlTxtConverter(self.ds_name, self.ds_config, self.work_dir.imzml_path,
                                            self.work_dir.txt_path, self.work_dir.coord_path)
        imzml_converter.convert()
        self._copy_txt_to_hdfs(self.work_dir.txt_path, self.work_dir.txt_path)

        self.ds = Dataset(self.sc, self.work_dir.txt_path, self.work_dir.coord_path, self.sm_config)

        theor_peaks_gen = TheorPeaksGenerator(self.sc, self.sm_config, self.ds_config)
        theor_peaks_gen.run()
        self.formulas = Formulas(self.ds_config, self.db)

        search_results = self._search()
        # TODO: store the first 1k results only
        self._store_results(search_results)
        self._store_job_meta()

        self.db.close()

    def _search(self):
        sf_sp_intens = sample_spectra(self.sc, self.ds, self.formulas)
        sf_peak_imgs = compute_sf_peak_images(self.ds, sf_sp_intens)
        sf_images = compute_sf_images(sf_peak_imgs)
        sf_iso_images_map, sf_metrics_map = filter_sf_images(self.sc, self.ds_config, self.ds, self.formulas, sf_images)

        return SearchResults(self.job_id, self.sf_db_id,
                             sf_iso_images_map, sf_metrics_map,
                             self.formulas.get_sf_adduct_peaksn(),
                             self.db)

    def _copy_txt_to_hdfs(self, localpath, hdfspath):
        if not self.sm_config['fs']['local']:
            print 'Coping DS textfile to HDFS...'
            return_code = cmd(hdfs_prefix() + '-test -e {}', hdfs_path(self.work_dir.path))
            if return_code:
                cmd_check(hdfs_prefix() + '-mkdir -p {}', hdfs_path(self.work_dir.path))
                cmd_check(hdfs_prefix() + '-copyFromLocal {} {}', local_path(localpath), hdfs_path(hdfspath))

    def _store_results(self, search_results):
        search_results.clear_old_results()
        search_results.save_sf_img_metrics()
        nrows, ncols = self.ds.get_dims()
        search_results.save_sf_iso_images(nrows, ncols)

    def _store_job_meta(self):
        print 'Storing job metadata'
        rows = [(self.job_id, self.sf_db_id, self.ds_id, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))]
        self.db.insert(insert_job_sql, rows)
