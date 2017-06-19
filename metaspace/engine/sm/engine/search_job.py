"""

:synopsis: Molecular search job driver

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
from __future__ import unicode_literals
import time
import sys
from pprint import pformat
from datetime import datetime
from pyspark import SparkContext, SparkConf
import logging

from sm.engine.msm_basic.msm_basic_search import MSMBasicSearch
from sm.engine.dataset_manager import DatasetManager, Dataset, DatasetStatus
from sm.engine.dataset_reader import DatasetReader
from sm.engine.db import DB
from sm.engine.fdr import FDR
from sm.engine.search_results import SearchResults
from sm.engine.theor_peaks_gen import TheorPeaksGenerator
from sm.engine.util import proj_root, SMConfig, read_json, sm_log_formatters
from sm.engine.work_dir import WorkDirManager, local_path
from sm.engine.es_export import ESExporter
from sm.engine.mol_db import MolecularDB, MolDBServiceWrapper
from sm.engine.errors import JobFailedError

logger = logging.getLogger('sm-engine')

JOB_ID_MOLDB_ID_SEL = "SELECT id, db_id FROM job WHERE ds_id = %s"
JOB_INS = "INSERT INTO job (db_id, ds_id, status, start) VALUES (%s, %s, %s, %s) RETURNING id"
JOB_UPD = "UPDATE job set status=%s, finish=%s where id=%s"
DELETE_TARGET_DECOY_ADD = 'DELETE FROM target_decoy_add where job_id = %s'


class SearchJob(object):
    """ Main class responsible for molecule search. Uses other modules of the engine.

    Args
    ----
    sm_config_path : string
        Path to the sm-engine config file
    no_clean : bool
        Don't delete interim data files
    """
    def __init__(self, sm_config_path, no_clean=False):
        self.no_clean = no_clean

        self._job_id = None
        self._sc = None
        self._db = None
        self._ds = None
        self._ds_man = None
        self._fdr = None
        self._wd_manager = None
        self._es = None

        SMConfig.set_path(sm_config_path)
        self._sm_config = SMConfig.get_conf()
        logger.debug('Using SM config:\n%s', pformat(self._sm_config))

    def _configure_spark(self):
        logger.info('Configuring Spark')
        sconf = SparkConf()
        for prop, value in self._sm_config['spark'].items():
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

    def clean_target_decoy_table(self):
        self._db.alter(DELETE_TARGET_DECOY_ADD, self._job_id)

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

            self._es.index_ds(self._ds.id, mol_db)
        except Exception as e:
            self._db.alter(JOB_UPD, 'FAILED', datetime.now().strftime('%Y-%m-%d %H:%M:%S'), self._job_id)
            new_msg = 'Job failed(ds_id={}, mol_db={}): {}'.format(self._ds.id, mol_db, str(e))
            raise JobFailedError(new_msg) from e
        else:
            self._db.alter(JOB_UPD, 'FINISHED', datetime.now().strftime('%Y-%m-%d %H:%M:%S'), self._job_id)

    def prepare_moldb_id_list(self):
        moldb_service = MolDBServiceWrapper(self._sm_config['services']['mol_db'])
        finished_job_moldb_ids = [r[1] for r in self._db.select(JOB_ID_MOLDB_ID_SEL, self._ds.id)]
        moldb_id_list = []
        for mol_db_dict in self._ds.config['databases']:
            data = moldb_service.find_db_by_name_version(mol_db_dict['name'],
                                                         mol_db_dict.get('version', None))
            if data:
                mol_db_id = data[0]['id']
                if mol_db_id not in finished_job_moldb_ids:
                    moldb_id_list.append(mol_db_id)
        return moldb_id_list

    def run(self, ds_id):
        """ Entry point of the engine. Molecule search is completed in several steps:
         * Copying input data to the engine work dir
         * Conversion input data (imzML+ibd) to plain text format. One line - one spectrum data
         * Generation and saving to the database theoretical peaks for all formulas from the molecule database
         * Molecules search. The most compute intensive part. Spark is used to run it in distributed manner.
         * Saving results (isotope images and their metrics of quality for each putative molecule) to the database

        Args
        ----
        ds_id : string
            A technical identifier for the dataset
        """
        try:
            start = time.time()

            self._init_db()
            self._ds = Dataset.load_ds(ds_id, self._db)
            self._ds_man = DatasetManager(self._db, self._es, 'queue')
            self._ds_man.set_ds_status(self._ds, DatasetStatus.STARTED)

            self._wd_manager = WorkDirManager(ds_id)
            self._configure_spark()
            self._es = ESExporter()

            if not self.no_clean:
                self._wd_manager.clean()

            self._ds.reader = DatasetReader(ds_id, self._ds.input_path, self._sc, self._wd_manager)
            self._ds.reader.copy_convert_input_data()

            logger.info('Dataset config:\n%s', pformat(self._ds.config))

            for mol_db_id in self.prepare_moldb_id_list():
                self._run_job(MolecularDB(id=mol_db_id, ds_config=self._ds.config))

            self._ds_man.set_ds_status(self._ds, DatasetStatus.FINISHED)

            logger.info("All done!")
            time_spent = time.time() - start
            logger.info('Time spent: %d mins %d secs', *divmod(int(round(time_spent)), 60))
        except Exception as e:
            if self._ds_man:
                self._ds_man.set_ds_status(self._ds, DatasetStatus.FAILED)
            logger.error(e, exc_info=True)
            raise
        finally:
            if self._sc:
                self._sc.stop()
            if self._db:
                self.clean_target_decoy_table()
                self._db.close()
            if self._wd_manager and not self.no_clean:
                self._wd_manager.clean()
            logger.info('*' * 150)
