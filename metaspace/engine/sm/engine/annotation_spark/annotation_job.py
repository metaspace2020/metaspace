import time
from pathlib import Path
from pprint import pformat
from shutil import copytree, rmtree
import logging
from typing import Optional, Dict

from pyspark import SparkContext, SparkConf

from sm.engine.annotation.acq_geometry import make_acq_geometry
from sm.engine.annotation.imzml_parser import ImzMLParserWrapper
from sm.engine.annotation.job import (
    del_jobs,
    insert_running_job,
    update_finished_job,
    get_ds_moldb_ids,
    JobStatus,
)
from sm.engine.annotation_spark.formula_imager import make_sample_area_mask, get_ds_dims
from sm.engine.annotation.formula_validator import METRICS
from sm.engine.annotation_spark.msm_basic_search import MSMSearch
from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.annotation_spark.search_results import SearchResults
from sm.engine.util import split_s3_path
from sm.engine.config import SMConfig
from sm.engine.es_export import ESExporter
from sm.engine import molecular_db, storage
from sm.engine.utils.perf_profile import Profiler

logger = logging.getLogger('engine')

JOB_ID_MOLDB_ID_SEL = "SELECT id, moldb_id FROM job WHERE ds_id = %s AND status='FINISHED'"
TARGET_DECOY_ADD_DEL = (
    'DELETE FROM target_decoy_add tda WHERE tda.job_id IN (SELECT id FROM job WHERE ds_id = %s)'
)


class AnnotationJob:
    """Class responsible for dataset annotation."""

    def __init__(
        self, ds: Dataset, perf: Profiler, sm_config: Optional[Dict] = None,
    ):
        self._sm_config = sm_config or SMConfig.get_conf()
        self._sc = None
        self._db = DB()
        self._ds = ds
        self._perf = perf
        self._es = ESExporter(self._db, self._sm_config)
        self._ds_data_path = None

    def _configure_spark(self):
        logger.info('Configuring Spark')
        sconf = SparkConf()
        for prop, value in self._sm_config['spark'].items():
            if prop.startswith('spark.'):
                sconf.set(prop, value)

        if 'aws' in self._sm_config:
            sconf.set("spark.hadoop.fs.s3a.access.key", self._sm_config['aws']['aws_access_key_id'])
            sconf.set(
                "spark.hadoop.fs.s3a.secret.key", self._sm_config['aws']['aws_secret_access_key']
            )
            sconf.set("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
            sconf.set(
                "spark.hadoop.fs.s3a.endpoint",
                "s3.{}.amazonaws.com".format(self._sm_config['aws']['aws_default_region']),
            )

        self._sc = SparkContext(
            master=self._sm_config['spark']['master'], conf=sconf, appName='SM engine'
        )

    def create_imzml_parser(self):
        logger.info('Parsing imzml')
        return ImzMLParserWrapper(self._ds_data_path)

    def _run_annotation_jobs(self, imzml_parser, moldbs):
        if moldbs:
            logger.info(
                f"Running new job ds_id: {self._ds.id}, ds_name: {self._ds.name}, mol dbs: {moldbs}"
            )

            # FIXME: Total runtime of the dataset should be measured, not separate jobs
            job_ids = [insert_running_job(self._ds.id, moldb.id) for moldb in moldbs]

            search_alg = MSMSearch(
                spark_context=self._sc,
                imzml_parser=imzml_parser,
                moldbs=moldbs,
                ds_config=self._ds.config,
                ds_data_path=self._ds_data_path,
                perf=self._perf,
            )
            search_results_it = search_alg.search()

            for job_id, (moldb_ion_metrics_df, moldb_ion_images_rdd) in zip(
                job_ids, search_results_it
            ):
                # Save results for each moldb
                job_status = JobStatus.FAILED
                try:
                    search_results = SearchResults(
                        ds_id=self._ds.id,
                        job_id=job_id,
                        metric_names=METRICS.keys(),
                        n_peaks=self._ds.config['isotope_generation']['n_peaks'],
                        charge=self._ds.config['isotope_generation']['charge'],
                    )
                    sample_area_mask = make_sample_area_mask(imzml_parser.coordinates)
                    search_results.store(
                        moldb_ion_metrics_df, moldb_ion_images_rdd, sample_area_mask, self._db
                    )
                    job_status = JobStatus.FINISHED
                finally:
                    update_finished_job(job_id, job_status)

    def _save_data_from_raw_ms_file(self, imzml_parser):
        ms_file_path = imzml_parser.filename
        ms_file_type_config = SMConfig.get_ms_file_handler(ms_file_path)
        dims = get_ds_dims(imzml_parser.coordinates)
        acq_geometry = make_acq_geometry(
            ms_file_type_config['type'], ms_file_path, self._ds.metadata, dims
        )
        self._ds.save_acq_geometry(self._db, acq_geometry)

    def _copy_input_data(self, ds):
        logger.info('Copying input data')
        self._ds_data_path = Path(self._sm_config['fs']['spark_data_path']) / ds.id
        if ds.input_path.startswith('s3a://'):
            self._ds_data_path.mkdir(parents=True, exist_ok=True)

            bucket_name, key = split_s3_path(ds.input_path)
            bucket = storage.get_s3_bucket(bucket_name, self._sm_config)
            for obj_sum in bucket.objects.filter(Prefix=key):
                local_file = str(self._ds_data_path / Path(obj_sum.key).name)
                logger.debug(f'Downloading s3a://{bucket_name}/{obj_sum.key} -> {local_file}')
                obj_sum.Object().download_file(local_file)
        else:
            rmtree(self._ds_data_path, ignore_errors=True)
            copytree(src=ds.input_path, dst=self._ds_data_path)

    def cleanup(self):
        if self._sc:
            self._sc.stop()
        logger.debug(f'Cleaning dataset temp dir {self._ds_data_path}')
        rmtree(self._ds_data_path, ignore_errors=True)

    def run(self):
        """Starts dataset annotation job.

        Annotation job consists of several steps:
            * Copy input data to the engine work dir
            * Generate and save to the database theoretical peaks
              for all formulas from the molecule database
            * Molecules search. The most compute intensive part
              that uses most the cluster resources
            * Computing FDR per molecular database and filtering the results
            * Saving the results: metrics saved in the database, images in the Image service
        """
        try:
            logger.info('*' * 150)
            start = time.time()

            self._configure_spark()
            self._perf.record_entry('configured spark')
            self._copy_input_data(self._ds)
            self._perf.record_entry('copied input data')
            imzml_parser = self.create_imzml_parser()
            self._perf.record_entry('parsed imzml file')
            self._save_data_from_raw_ms_file(imzml_parser)

            logger.info(f'Dataset config:\n{pformat(self._ds.config)}')

            finished_moldb_ids = set(get_ds_moldb_ids(self._ds.id, JobStatus.FINISHED))
            new_moldb_ids = set(self._ds.config['database_ids'])
            added_moldb_ids = new_moldb_ids - finished_moldb_ids
            removed_moldb_ids = finished_moldb_ids - new_moldb_ids
            self._perf.add_extra_data(moldb_ids=list(added_moldb_ids))

            if removed_moldb_ids:
                del_jobs(self._ds, removed_moldb_ids)
            self._run_annotation_jobs(imzml_parser, molecular_db.find_by_ids(added_moldb_ids))
            self._perf.record_entry('annotated')

            logger.info("All done!")
            minutes, seconds = divmod(int(round(time.time() - start)), 60)
            logger.info(f'Time spent: {minutes} min {seconds} sec')
        finally:
            self.cleanup()
            logger.info('*' * 150)
