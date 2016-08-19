"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import json
from os.path import join
import sys
import traceback
from pprint import pformat
from datetime import datetime

from pyspark import SparkContext, SparkConf
from sm.engine.msm_basic.msm_basic_search import MSMBasicSearch
from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.fdr import FDR
from sm.engine.formulas_segm import FormulasSegm
from sm.engine.imzml_txt_converter import ImzmlTxtConverter
from sm.engine.search_results import SearchResults
from sm.engine.theor_peaks_gen import TheorPeaksGenerator
from sm.engine.util import local_path, proj_root, SMConfig, logger
from sm.engine.work_dir import WorkDirManager
from sm.engine.es_export import ESExporter


JOB_ID_SEL = "SELECT id FROM job WHERE ds_id = %s"
DB_ID_SEL = "SELECT id FROM formula_db WHERE name = %s"

JOB_INS = "INSERT INTO job (db_id, ds_id, status, start, finish) VALUES (%s, %s, 'SUCCEEDED', %s, '2000-01-01 00:00:00')"
ADDUCT_INS = 'INSERT INTO adduct VALUES (%s, %s)'


class SearchJob(object):
    """ Main class responsible for molecule search. Uses other modules of the engine.

    Args
    ----------
    ds_id : string
        A technical identifier for the dataset
    ds_name : string
        A dataset name
    """
    def __init__(self, ds_id, ds_name):
        self.sm_config = SMConfig.get_conf()
        self.ds_id = ds_id
        self.ds_name = ds_name
        self.job_id = None
        self.sc = None
        self.db = None
        self.ds = None
        self.fdr = None
        self.formulas = None
        self.ds_config = None
        self.wd_manager = None

    def _read_ds_config(self):
        with open(self.wd_manager.ds_config_path) as f:
            self.ds_config = json.load(f)

    def _configure_spark(self):
        logger.info('Configuring Spark')
        sconf = SparkConf()
        for prop, value in self.sm_config['spark'].iteritems():
            if prop.startswith('spark.'):
                sconf.set(prop, value)

        if 'aws' in self.sm_config:
            sconf.set("spark.hadoop.fs.s3a.access.key", self.sm_config['aws']['aws_access_key_id'])
            sconf.set("spark.hadoop.fs.s3a.secret.key", self.sm_config['aws']['aws_secret_access_key'])
            sconf.set("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")

        self.sc = SparkContext(master=self.sm_config['spark']['master'], conf=sconf, appName='SM engine')
        if not self.sm_config['spark']['master'].startswith('local'):
            self.sc.addPyFile(join(local_path(proj_root()), 'sm.zip'))

    def _init_db(self):
        logger.info('Connecting to the DB')
        self.db = DB(self.sm_config['db'])
        self.sf_db_id = self.db.select_one(DB_ID_SEL, self.ds_config['database']['name'])[0]

    # TODO: add tests
    def store_job_meta(self):
        """ Store search job metadata in the database """
        logger.info('Storing job metadata')
        rows = [(self.sf_db_id, self.ds_id, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))]
        self.db.insert(JOB_INS, rows)

        self.job_id = self.db.select_one(JOB_ID_SEL, self.ds_id)[0]

        rows = [(self.job_id, adduct) for adduct in self.ds_config['isotope_generation']['adducts']]
        self.db.insert(ADDUCT_INS, rows)

    def run(self, input_path, ds_config_path, clean=False):
        """ Entry point of the engine. Molecule search is completed in several steps:
         * Copying input data to the engine work dir
         * Conversion input data (imzML+ibd) to plain text format. One line - one spectrum data
         * Generation and saving to the database theoretical peaks for all formulas from the molecule database
         * Molecules search. The most compute intensive part. Spark is used to run it in distributed manner.
         * Saving results (isotope images and their metrics of quality for each putative molecule) to the database

        Args
        -------
        input_path : string
            Path to the dataset folder with .imzML and .ibd files
        ds_config_path: string
            Path to the dataset config file
        clean : bool
            Clean all interim data files before starting molecule search
        """
        try:
            self.wd_manager = WorkDirManager(self.ds_id)
            if clean:
                self.wd_manager.clean()

            self.wd_manager.copy_input_data(input_path, ds_config_path)

            self._read_ds_config()
            logger.info('Dataset config:\n%s', pformat(self.ds_config))

            self._configure_spark()
            self._init_db()

            if not self.wd_manager.exists(self.wd_manager.txt_path):
                imzml_converter = ImzmlTxtConverter(self.wd_manager.local_dir.imzml_path,
                                                    self.wd_manager.local_dir.txt_path,
                                                    self.wd_manager.local_dir.coord_path)
                imzml_converter.convert()

                if not self.wd_manager.local_fs_only:
                    self.wd_manager.upload_to_remote()

            self.ds = Dataset(self.sc, self.ds_id, self.ds_name, input_path, self.ds_config, self.wd_manager, self.db)
            self.ds.save_ds_meta()

            self.store_job_meta()

            theor_peaks_gen = TheorPeaksGenerator(self.sc, self.sm_config, self.ds_config)
            theor_peaks_gen.run()

            target_adducts = self.ds_config['isotope_generation']['adducts']
            self.fdr = FDR(self.job_id, self.sf_db_id, decoy_sample_size=20, target_adducts=target_adducts, db=self.db)
            self.fdr.decoy_adduct_selection()
            self.formulas = FormulasSegm(self.job_id, self.sf_db_id, self.ds_config, self.db)

            search_alg = MSMBasicSearch(self.sc, self.ds, self.formulas, self.fdr, self.ds_config)
            sf_metrics_df, sf_iso_images = search_alg.search()

            search_results = SearchResults(self.sf_db_id, self.ds_id, self.job_id,
                                           self.formulas.get_sf_adduct_peaksn(),
                                           self.db, self.sm_config, self.ds_config)
            # TODO: report number of molecule images saved to the DB
            search_results.sf_metrics_df = sf_metrics_df
            search_results.sf_iso_images = sf_iso_images
            search_results.metrics = search_alg.metrics
            search_results.nrows, search_results.ncols = self.ds.get_dims()
            search_results.store()

            es = ESExporter(self.sm_config)
            es.index_ds(self.db, self.ds_id)

        except Exception:
            exc_type, exc_value, exc_traceback = sys.exc_info()
            logger.error('\n'.join(traceback.format_exception(exc_type, exc_value, exc_traceback)))
            sys.exit(1)
        finally:
            if self.sc:
                # self.sc.show_profiles()
                self.sc.stop()
            if self.db:
                self.db.close()
