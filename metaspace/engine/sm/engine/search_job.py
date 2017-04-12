"""

:synopsis: Molecular search job driver

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import time
from os.path import join
from pprint import pformat
from datetime import datetime
from pyspark import SparkContext, SparkConf
import logging

from sm.engine import QueuePublisher
from sm.engine.msm_basic.msm_basic_search import MSMBasicSearch
from sm.engine.dataset_manager import DatasetManager, Dataset
from sm.engine.dataset_reader import DatasetReader
from sm.engine.db import DB
from sm.engine.fdr import FDR
from sm.engine.search_results import SearchResults
from sm.engine.theor_peaks_gen import TheorPeaksGenerator
from sm.engine.util import proj_root, SMConfig, read_json, sm_log_formatters
from sm.engine.work_dir import WorkDirManager, local_path
from sm.engine.es_export import ESExporter
from sm.engine.mol_db import MolecularDB


logger = logging.getLogger('sm-engine')

JOB_ID_SEL = "SELECT id FROM job WHERE ds_id = %s"
JOB_INS = "INSERT INTO job (db_id, ds_id, status, start) VALUES (%s, %s, %s, %s) RETURNING id"
JOB_UPD = "UPDATE job set status=%s, finish=%s where id=%s"


class SearchJob(object):
    """ Main class responsible for molecule search. Uses other modules of the engine.

    Args
    ----
    ds_id : string
        A technical identifier for the dataset
    ds_name : string
        A dataset name
    input_path : string
        Path to the dataset folder with .imzML and .ibd files
    sm_config_path : string
        Path to the sm-engine config file
    """
    def __init__(self, ds_id, sm_config_path, no_clean=False):
        self.ds_id = ds_id
        self.no_clean = no_clean

        self._job_id = None
        self._sc = None
        self._db = None
        self._ds = None
        self._fdr = None
        self._wd_manager = None
        self._es = None

        SMConfig.set_path(sm_config_path)
        self._sm_config = SMConfig.get_conf()
        logger.debug('Using SM config:\n%s', pformat(self._sm_config))

    def _configure_spark(self):
        logger.info('Configuring Spark')
        sconf = SparkConf()
        for prop, value in self._sm_config['spark'].iteritems():
            if prop.startswith('spark.'):
                sconf.set(prop, value)

        if 'aws' in self._sm_config:
            sconf.set("spark.hadoop.fs.s3a.access.key", self._sm_config['aws']['aws_access_key_id'])
            sconf.set("spark.hadoop.fs.s3a.secret.key", self._sm_config['aws']['aws_secret_access_key'])
            sconf.set("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")

        self._sc = SparkContext(master=self._sm_config['spark']['master'], conf=sconf, appName='SM engine')

    def _init_db(self):
        logger.info('Connecting to the DB')
        self._db = DB(self._sm_config['db'])

    # TODO: add tests
    def store_job_meta(self, mol_db_id):
        """ Store search job metadata in the database """
        logger.info('Storing job metadata')
        rows = [(mol_db_id, self._ds.id, 'STARTED', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))]
        self._job_id = self._db.insert_return(JOB_INS, rows)[0]

    def _run_job(self, mol_db):
        try:
            self.store_job_meta(mol_db.id)
            mol_db.set_job_id(self._job_id)

            logger.info("Processing ds_id: %s, ds_name: %s, db_name: %s, db_version: %s ...",
                        self._ds.id, self._ds.name, mol_db.name, mol_db.version)

            theor_peaks_gen = TheorPeaksGenerator(self._sc, mol_db, self._ds.config)
            theor_peaks_gen.run()

            target_adducts = self._ds.config['isotope_generation']['adducts']
            self._fdr = FDR(self._job_id, mol_db,
                            decoy_sample_size=20, target_adducts=target_adducts, db=self._db)
            self._fdr.decoy_adduct_selection()

            search_alg = MSMBasicSearch(self._sc, self._ds, mol_db, self._fdr, self._ds.config)
            ion_metrics_df, ion_iso_images = search_alg.search()

            search_results = SearchResults(mol_db.id, self._job_id, search_alg.metrics.keys(), self._ds, self._db)
            search_results.store(ion_metrics_df, ion_iso_images)

            self._es.index_ds(self.ds_id, mol_db)
        except Exception as e:
            logger.error('Job failed (MolDB name={}, version={})'.format(mol_db.name, mol_db.version), exc_info=True)
            self._db.alter(JOB_UPD, 'FAILED', datetime.now().strftime('%Y-%m-%d %H:%M:%S'), self._job_id)
            raise
        else:
            self._db.alter(JOB_UPD, 'FINISHED', datetime.now().strftime('%Y-%m-%d %H:%M:%S'), self._job_id)

    def run(self):
        """ Entry point of the engine. Molecule search is completed in several steps:
         * Copying input data to the engine work dir
         * Conversion input data (imzML+ibd) to plain text format. One line - one spectrum data
         * Generation and saving to the database theoretical peaks for all formulas from the molecule database
         * Molecules search. The most compute intensive part. Spark is used to run it in distributed manner.
         * Saving results (isotope images and their metrics of quality for each putative molecule) to the database
        """
        try:
            start = time.time()

            self._wd_manager = WorkDirManager(self.ds_id)
            self._configure_spark()
            self._init_db()
            self._es = ESExporter()

            if not self.no_clean:
                self._wd_manager.clean()

            self._ds = Dataset.load_ds(self.ds_id, self._db)
            self._ds.reader = DatasetReader(self.ds_id, self._ds.input_path, self._sc, self._wd_manager)
            self._ds.reader.copy_convert_input_data()

            logger.info('Dataset config:\n%s', pformat(self._ds.config))

            # self._ds.config['databases'].update({'name': 'HMDB', 'version': '2016'})
            for mol_db_dict in self._ds.config['databases']:
                mol_db = MolecularDB(mol_db_dict['name'], mol_db_dict.get('version', None), self._ds.config)
                self._run_job(mol_db)

            logger.info("All done!")
            time_spent = time.time() - start
            logger.info('Time spent: %d mins %d secs', *divmod(int(round(time_spent)), 60))
        finally:
            if self._fdr:
                self._fdr.clean_target_decoy_table()
            if self._sc:
                self._sc.stop()
            if self._db:
                self._db.close()
            if self._wd_manager and not self.no_clean:
                self._wd_manager.clean()
            logger.info('*' * 150)
