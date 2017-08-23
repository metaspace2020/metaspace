"""

:synopsis: Molecular search job driver

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import time
from pprint import pformat
from datetime import datetime
from pyspark import SparkContext, SparkConf
import logging

from sm.engine.msm_basic.msm_basic_search import MSMBasicSearch
from sm.engine.dataset import DatasetStatus
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
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.queue import QueuePublisher

logger = logging.getLogger('sm-engine')

JOB_ID_MOLDB_ID_SEL = "SELECT id, db_id FROM job WHERE ds_id = %s"
JOB_INS = "INSERT INTO job (db_id, ds_id, status, start) VALUES (%s, %s, %s, %s) RETURNING id"
JOB_UPD = "UPDATE job set status=%s, finish=%s where id=%s"
TARGET_DECOY_ADD_DEL = 'DELETE FROM target_decoy_add tda WHERE tda.job_id IN (SELECT id FROM job WHERE ds_id = %s)'


class SearchJob(object):
    """ Main class responsible for molecule search. Uses other modules of the engine.

    Args
    ----
    sm_config_path : string
        Path to the sm-engine config file
    no_clean : bool
        Don't delete interim data files
    """
    def __init__(self, no_clean=False):
        self.no_clean = no_clean

        self._job_id = None
        self._sc = None
        self._db = None
        self._ds = None
        self._ds_reader = None
        self._queue = None
        self._fdr = None
        self._wd_manager = None
        self._es = None

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

    def store_job_meta(self, mol_db_id):
        """ Store search job metadata in the database """
        logger.info('Storing job metadata')
        rows = [(mol_db_id, self._ds.id, 'STARTED', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))]
        self._job_id = self._db.insert_return(JOB_INS, rows)[0]

    # TODO: stop storing target-decoy adduct combinations in the database
    def clean_target_decoy_table(self):
        self._db.alter(TARGET_DECOY_ADD_DEL, self._ds.id)

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

            search_alg = MSMBasicSearch(self._sc, self._ds, self._ds_reader, mol_db, self._fdr, self._ds.config)
            ion_metrics_df, ion_iso_images = search_alg.search()

            mz_img_store = ImageStoreServiceWrapper(self._sm_config['services']['iso_images'])
            search_results = SearchResults(mol_db.id, self._job_id, search_alg.metrics.keys())
            mask = self._ds_reader.get_2d_sample_area_mask()
            search_results.store(ion_metrics_df, ion_iso_images, mask, self._db, mz_img_store)

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

    def run(self, ds):
        """ Entry point of the engine. Molecule search is completed in several steps:
            * Copying input data to the engine work dir
            * Conversion input data (imzML+ibd) to plain text format. One line - one spectrum data
            * Generation and saving to the database theoretical peaks for all formulas from the molecule database
            * Molecules search. The most compute intensive part. Spark is used to run it in distributed manner.
            * Saving results (isotope images and their metrics of quality for each putative molecule) to the database

        Args
        ----
            ds : sm.engine.dataset_manager.Dataset
        """
        try:
            start = time.time()

            self._init_db()
            self._es = ESExporter(self._db)
            self._ds = ds
            ds.set_status(self._db, self._es, self._queue, DatasetStatus.STARTED)

            if self._sm_config['rabbitmq']:
                self._queue = QueuePublisher(self._sm_config['rabbitmq'])
            else:
                self._queue = None

            self._wd_manager = WorkDirManager(ds.id)
            self._configure_spark()

            if not self.no_clean:
                self._wd_manager.clean()

            self._ds_reader = DatasetReader(self._ds.input_path, self._sc, self._wd_manager)
            self._ds_reader.copy_convert_input_data()

            logger.info('Dataset config:\n%s', pformat(self._ds.config))

            for mol_db_id in self.prepare_moldb_id_list():
                self._run_job(MolecularDB(id=mol_db_id, iso_gen_config=self._ds.config['isotope_generation']))

            ds.set_status(self._db, self._es, self._queue, DatasetStatus.FINISHED)

            logger.info("All done!")
            time_spent = time.time() - start
            logger.info('Time spent: %d mins %d secs', *divmod(int(round(time_spent)), 60))
        except Exception as e:
            if self._ds:
                ds.set_status(self._db, self._es, self._queue, DatasetStatus.FAILED)
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
