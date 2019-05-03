import time
from importlib import import_module
from pathlib import Path
from pprint import pformat
from datetime import datetime
from shutil import copytree, rmtree

import boto3
from pyimzml.ImzMLParser import ImzMLParser
from pyspark import SparkContext, SparkConf
import logging

from sm.engine.colocalization import Colocalization
from sm.engine.msm_basic.formula_imager import make_sample_area_mask
from sm.engine.msm_basic.formula_validator import METRICS
from sm.engine.msm_basic.msm_basic_search import MSMSearch
from sm.engine.db import DB
from sm.engine.search_results import SearchResults
from sm.engine.util import SMConfig, split_s3_path
from sm.engine.es_export import ESExporter
from sm.engine.mol_db import MolecularDB
from sm.engine.errors import JobFailedError
from sm.engine.queue import QueuePublisher, SM_DS_STATUS

logger = logging.getLogger('engine')

JOB_ID_MOLDB_ID_SEL = "SELECT id, db_id FROM job WHERE ds_id = %s AND status='FINISHED'"
JOB_INS = "INSERT INTO job (db_id, ds_id, status, start) VALUES (%s, %s, %s, %s) RETURNING id"
JOB_UPD_STATUS_FINISH = "UPDATE job set status=%s, finish=%s where id=%s"
JOB_UPD_FINISH = "UPDATE job set finish=%s where id=%s"
TARGET_DECOY_ADD_DEL = 'DELETE FROM target_decoy_add tda WHERE tda.job_id IN (SELECT id FROM job WHERE ds_id = %s)'


class JobStatus(object):
    RUNNING = 'RUNNING'
    FINISHED = 'FINISHED'
    FAILED = 'FAILED'


class AnnotationJob(object):
    """ Main class responsible for molecule search. Uses the other modules of the engine

    Args
    -----
    no_clean : bool
        Don't delete interim data files
    """
    def __init__(self, img_store=None, sm_config=None, no_clean=False):
        self.no_clean = no_clean
        self._img_store = img_store

        self._sc = None
        self._db = None
        self._ds = None
        self._status_queue = None
        self._es = None

        self._sm_config = sm_config or SMConfig.get_conf()
        self._ds_data_path = None

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
            sconf.set("spark.hadoop.fs.s3a.endpoint", "s3.{}.amazonaws.com".format(self._sm_config['aws']['aws_region']))

        self._sc = SparkContext(master=self._sm_config['spark']['master'], conf=sconf, appName='SM engine')

    def _init_db(self):
        logger.info('Connecting to the DB')
        self._db = DB(self._sm_config['db'])

    def _store_job_meta(self, mol_db_id):
        """ Store search job metadata in the database """
        logger.info('Storing job metadata')
        rows = [(mol_db_id, self._ds.id, JobStatus.RUNNING, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))]
        return self._db.insert_return(JOB_INS, rows=rows)[0]

    @property
    def _ds_imzml_path(self):
        return next(str(p) for p in Path(self._ds_data_path).iterdir()
                    if str(p).lower().endswith('.imzml'))

    def _run_annotation_jobs(self, moldb_ids):
        if moldb_ids:
            try:
                moldbs = [MolecularDB(id=id, db=self._db, iso_gen_config=self._ds.config['isotope_generation'])
                          for id in moldb_ids]
                logger.info("Running new job ds_id: %s, ds_name: %s, mol dbs: %s",
                            self._ds.id, self._ds.name, moldbs)

                # FIXME: record runtime of dataset not jobs
                job_ids = [self._store_job_meta(moldb.id) for moldb in moldbs]

                logger.info('Parsing imzml')
                imzml_parser = ImzMLParser(self._ds_imzml_path)

                search_alg = MSMSearch(sc=self._sc, imzml_parser=imzml_parser, moldbs=moldbs,
                                       ds_config=self._ds.config, ds_data_path=self._ds_data_path)
                search_results_it = search_alg.search()

                for job_id, (moldb, moldb_ion_metrics_df, moldb_ion_images_rdd) in zip(job_ids, search_results_it):
                    # Save results for each moldb
                    search_results = SearchResults(moldb.id, job_id, METRICS.keys())
                    img_store_type = self._ds.get_ion_img_storage_type(self._db)
                    coordinates = [coo[:2] for coo in imzml_parser.coordinates]
                    sample_area_mask = make_sample_area_mask(coordinates)
                    search_results.store(moldb_ion_metrics_df, moldb_ion_images_rdd, sample_area_mask,
                                         self._db, self._img_store, img_store_type)
                    self._db.alter(JOB_UPD_STATUS_FINISH, params=(JobStatus.FINISHED,
                                                                  datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                                                  job_id))

                if self._sm_config['colocalization'].get('enabled', False):
                    coloc = Colocalization(self._db)
                    coloc.run_coloc_job(self._ds.id)
            except Exception as e:
                self._db.alter(JOB_UPD_STATUS_FINISH, params=(JobStatus.FAILED,
                                                              datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                                              job_ids[0]))
                msg = 'Job failed(ds_id={}, moldbs={}): {}'.format(self._ds.id, moldbs, str(e))
                raise JobFailedError(msg) from e

    def _remove_annotation_jobs(self, moldb_ids):
        for id in moldb_ids:
            moldb = MolecularDB(id=id, db=self._db, iso_gen_config=self._ds.config['isotope_generation'])
            logger.info("Removing job results ds_id: %s, ds_name: %s, db_name: %s, db_version: %s",
                        self._ds.id, self._ds.name, moldb.name, moldb.version)
            self._db.alter('DELETE FROM job WHERE ds_id = %s and db_id = %s', params=(self._ds.id, moldb.id))
            self._es.delete_ds(self._ds.id, moldb)

    def _moldb_ids(self):
        completed_moldb_ids = {db_id for (_, db_id) in
                               self._db.select(JOB_ID_MOLDB_ID_SEL, params=(self._ds.id,))}
        new_moldb_ids = {MolecularDB(name=moldb_name).id
                         for moldb_name in self._ds.config['databases']}
        return completed_moldb_ids, new_moldb_ids

    def _save_data_from_raw_ms_file(self):
        ms_file_type_config = SMConfig.get_ms_file_handler(self._ds_imzml_path)
        acq_geometry_factory_module = ms_file_type_config['acq_geometry_factory']
        acq_geometry_factory = getattr(import_module(acq_geometry_factory_module['path']),
                                       acq_geometry_factory_module['name'])

        acq_geometry = acq_geometry_factory(self._ds_imzml_path).create()
        self._ds.save_acq_geometry(self._db, acq_geometry)

        self._ds.save_ion_img_storage_type(self._db, ms_file_type_config['img_storage_type'])

    def _copy_input_data(self, ds):
        logger.info('Copying input data')
        self._ds_data_path = Path(self._sm_config['fs']['data_path']) / ds.id
        if ds.input_path.startswith('s3a://'):
            self._ds_data_path.mkdir(parents=True, exist_ok=True)

            session = boto3.session.Session(aws_access_key_id=self._sm_config['aws']['aws_access_key_id'],
                                            aws_secret_access_key=self._sm_config['aws']['aws_secret_access_key'])
            bucket_name, key = split_s3_path(ds.input_path)
            for obj_sum in (session.resource('s3')
                            .Bucket(bucket_name)
                            .objects.filter(Prefix=key)):
                local_file = str(self._ds_data_path / Path(obj_sum.key).name)
                obj_sum.Object().download_file(local_file)
        else:
            rmtree(self._ds_data_path, ignore_errors=True)
            copytree(src=ds.input_path, dst=self._ds_data_path)

    def run(self, ds):
        """ Entry point of the engine. Molecule search is completed in several steps:
            * Copy input data to the engine work dir
            * Convert input mass spec files to plain text format. One line - one spectrum data
            * Generate and save to the database theoretical peaks for all formulas from the molecule database
            * Molecules search. The most compute intensive part. Spark is used to run it in distributed manner
            * Save results (isotope images and their metrics of quality for each formula) to the database

        Args
        -----
            ds : sm.engine.dataset_manager.Dataset
        """
        try:
            logger.info('*' * 150)
            start = time.time()

            self._init_db()
            self._es = ESExporter(self._db)
            self._ds = ds

            if self._sm_config['rabbitmq']:
                self._status_queue = QueuePublisher(config=self._sm_config['rabbitmq'],
                                                    qdesc=SM_DS_STATUS,
                                                    logger=logger)
            else:
                self._status_queue = None

            self._configure_spark()
            self._copy_input_data(ds)
            self._save_data_from_raw_ms_file()
            self._img_store.storage_type = 'fs'

            logger.info('Dataset config:\n%s', pformat(self._ds.config))

            completed_moldb_ids, new_moldb_ids = self._moldb_ids()
            self._remove_annotation_jobs(completed_moldb_ids - new_moldb_ids)
            self._run_annotation_jobs(new_moldb_ids - completed_moldb_ids)

            logger.info("All done!")
            time_spent = time.time() - start
            logger.info('Time spent: %d min %d sec', *divmod(int(round(time_spent)), 60))
        finally:
            if self._sc:
                self._sc.stop()
            if self._db:
                self._db.close()
            logger.info('*' * 150)
