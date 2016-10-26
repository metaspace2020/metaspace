"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import time
from os.path import join
from pprint import pformat
from datetime import datetime
from pyspark import SparkContext, SparkConf
import logging

from sm.engine.msm_basic.msm_basic_search import MSMBasicSearch
from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.fdr import FDR
from sm.engine.formulas_segm import FormulasSegm
from sm.engine.imzml_txt_converter import ImzmlTxtConverter
from sm.engine.search_results import SearchResults
from sm.engine.theor_peaks_gen import TheorPeaksGenerator
from sm.engine.util import local_path, proj_root, SMConfig, read_json, sm_log_formatters
from sm.engine.work_dir import WorkDirManager
from sm.engine.es_export import ESExporter


logger = logging.getLogger('sm-engine')

JOB_ID_SEL = "SELECT id FROM job WHERE ds_id = %s"
DB_ID_SEL = "SELECT id FROM formula_db WHERE name = %s"

JOB_INS = ("""INSERT INTO job (db_id, ds_id, status, start, finish) """
           """VALUES (%s, %s, 'SUCCEEDED', %s, '2000-01-01 00:00:00') RETURNING id""")
ADDUCT_INS = 'INSERT INTO adduct VALUES (%s, %s)'


class SearchJob(object):
    """ Main class responsible for molecule search. Uses other modules of the engine.

    Args
    ----------
    ds_id : string
        A technical identifier for the dataset
    ds_name : string
        A dataset name
    input_path : string
        Path to the dataset folder with .imzML and .ibd files
    sm_config_path : string
        Path to the sm-engine config file
    """
    def __init__(self, ds_id, ds_name, drop, input_path, sm_config_path):
        self.ds_id = ds_id
        self.ds_name = ds_name
        self.drop = drop
        self.input_path = input_path

        self.sm_config = None
        self.ds_config = None
        self.job_id = None
        self.sf_db_id = None
        self.sc = None
        self.db = None
        self.ds = None
        self.fdr = None
        self.formulas = None
        self.wd_manager = None
        self.es = None

        SMConfig.set_path(sm_config_path)
        self.sm_config = SMConfig.get_conf()
        logger.debug('Using SM config:\n%s', pformat(self.sm_config))

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

    # TODO: add tests
    def store_job_meta(self):
        """ Store search job metadata in the database """
        logger.info('Storing job metadata')
        rows = [(self.sf_db_id, self.ds_id, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))]
        self.job_id = self.db.insert_return(JOB_INS, rows)[0]

    def _run_job(self, sf_db_name):
        self.sf_db_id = self.db.select_one(DB_ID_SEL, sf_db_name)[0]
        self.store_job_meta()

        logger.info("Processing ds_id: %s, ds_name: %s, db_name: %s ...", self.ds.id, self.ds.name, sf_db_name)

        theor_peaks_gen = TheorPeaksGenerator(self.sc, self.sm_config, self.ds.ds_config)
        theor_peaks_gen.run()

        target_adducts = self.ds.ds_config['isotope_generation']['adducts']
        self.fdr = FDR(self.job_id, self.sf_db_id, decoy_sample_size=20, target_adducts=target_adducts, db=self.db)
        self.fdr.decoy_adduct_selection()
        self.formulas = FormulasSegm(self.job_id, self.sf_db_id, self.ds.ds_config, self.db)

        search_alg = MSMBasicSearch(self.sc, self.ds, self.formulas, self.fdr, self.ds.ds_config)
        sf_metrics_df, sf_iso_images = search_alg.search()

        search_results = SearchResults(self.sf_db_id, self.ds_id, self.job_id,
                                       self.formulas.get_sf_adduct_peaksn(),
                                       self.db, self.sm_config, self.ds.ds_config)
        search_results.sf_metrics_df = sf_metrics_df
        search_results.sf_iso_images = sf_iso_images
        search_results.metrics = search_alg.metrics
        search_results.nrows, search_results.ncols = self.ds.get_dims()
        search_results.store()

        self.es.index_ds(self.db, self.ds_id)

        self.db.alter('UPDATE job set finish=%s where id=%s',
                      datetime.now().strftime('%Y-%m-%d %H:%M:%S'), self.job_id)

    def run(self, ds_config_path=None):
        """ Entry point of the engine. Molecule search is completed in several steps:
         * Copying input data to the engine work dir
         * Conversion input data (imzML+ibd) to plain text format. One line - one spectrum data
         * Generation and saving to the database theoretical peaks for all formulas from the molecule database
         * Molecules search. The most compute intensive part. Spark is used to run it in distributed manner.
         * Saving results (isotope images and their metrics of quality for each putative molecule) to the database

        Args
        -------
        ds_config_path: string
            Path to the dataset config file
        """
        try:
            start = time.time()

            self.wd_manager = WorkDirManager(self.ds_id)
            self._configure_spark()
            self._init_db()
            self.es = ESExporter(self.sm_config)

            self.ds = Dataset(self.sc, self.ds_id, self.ds_name, self.drop, self.input_path,
                              self.wd_manager, self.db, self.es)
            self.ds.copy_read_data()

            logger.info('Dataset config:\n%s', pformat(self.ds.ds_config))

            for sf_db_name in {self.ds.ds_config['database']['name'], 'HMDB'}:
                self._run_job(sf_db_name)

            logger.info("All done!")
            time_spent = time.time() - start
            logger.info('Time spent: %d mins %d secs', *divmod(int(round(time_spent)), 60))

        except Exception:
            logger.error('Job failed', exc_info=True)
            raise
        finally:
            if self.fdr:
                self.fdr.clean_target_decoy_table()
            if self.sc:
                self.sc.stop()
            if self.db:
                self.db.close()
            if self.wd_manager:
                self.wd_manager.clean()
            logger.info('*' * 150)
