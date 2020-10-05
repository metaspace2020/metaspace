from itertools import chain
import lithops
from lithops.storage import Storage
import pandas as pd

from sm.engine.serverless.check_results import get_reference_results, check_results, log_bad_results
from sm.engine.serverless.fdr import calculate_fdrs_vm
from sm.engine.serverless.image import create_process_segment
from sm.engine.serverless.molecular_db import (
    upload_mol_dbs_from_dir,
    calculate_centroids,
    validate_formula_cobjects,
    validate_peaks_cobjects,
)
from sm.engine.serverless.molecular_db_local import build_database_local
from sm.engine.serverless.segment import (
    segment_centroids,
    clip_centr_df,
    define_centr_segments,
    validate_centroid_segments,
    validate_ds_segments,
)
from sm.engine.serverless.cache import PipelineCacher
from sm.engine.serverless.segment_ds_vm import load_and_split_ds_vm
from sm.engine.serverless.utils import (
    PipelineStats,
    logger,
    deserialise,
    read_cloud_object_with_retry,
)


class Pipeline(object):
    def __init__(self, config, ds_config, db_config, use_db_cache=True, use_ds_cache=True):
        self.config = config
        self.ds_config = ds_config
        self.db_config = db_config
        self.use_db_cache = use_db_cache
        self.use_ds_cache = use_ds_cache

        self.fexec = lithops.function_executor(config=self.config, runtime_memory=2048)
        self.vmexec = lithops.docker_executor(
            config=self.config, storage_backend=self.config['pywren']['storage_backend']
        )

        self.storage = Storage(
            lithops_config=self.config, storage_backend=self.config['pywren']['storage_backend']
        )

        self.cacher = PipelineCacher(
            self.fexec, 'vm', self.ds_config["name"], self.db_config["name"]
        )
        if not self.use_db_cache or not self.use_ds_cache:
            self.cacher.clean(database=not self.use_db_cache, dataset=not self.use_ds_cache)

        stats_path_cache_key = ':ds/:db/stats_path.cache'
        if self.cacher.exists(stats_path_cache_key):
            self.stats_path = self.cacher.load(stats_path_cache_key)
            PipelineStats.path = self.stats_path
            logger.info(f'Using cached {self.stats_path} for statistics')
        else:
            PipelineStats.init()
            self.stats_path = PipelineStats.path
            self.cacher.save(self.stats_path, stats_path_cache_key)
            logger.info(f'Initialised {self.stats_path} for statistics')

        self.ds_segm_size_mb = 128
        self.image_gen_config = {"q": 99, "do_preprocessing": False, "nlevels": 30, "ppm": 3.0}

    def __call__(self, task='all', debug_validate=False):

        if task == 'all' or task == 'db':
            self.upload_molecular_databases()
            self.build_database(debug_validate=debug_validate)
            self.calculate_centroids(debug_validate=debug_validate)

        if task == 'all' or task == 'ds':
            self.segment_ds(debug_validate=debug_validate)
            self.segment_centroids(debug_validate=debug_validate)
            self.annotate()
            self.run_fdr()

            if debug_validate and self.ds_config['metaspace_id']:
                self.check_results()

    def upload_molecular_databases(self, use_cache=True):
        cache_key = ':db/upload_molecular_databases.cache'

        if use_cache and self.cacher.exists(cache_key):
            self.mols_dbs_cobjects = self.cacher.load(cache_key)
            logger.info(f'Loaded {len(self.mols_dbs_cobjects)} molecular databases from cache')
        else:
            self.mols_dbs_cobjects = upload_mol_dbs_from_dir(
                self.storage, self.db_config['databases']
            )
            logger.info(f'Uploaded {len(self.mols_dbs_cobjects)} molecular databases')
            self.cacher.save(self.mols_dbs_cobjects, cache_key)

    def build_database(self, use_cache=True, debug_validate=False):
        cache_key = ':ds/:db/build_database.cache'
        if use_cache and self.cacher.exists(cache_key):
            self.formula_cobjects, self.db_data_cobjects = self.cacher.load(cache_key)
            logger.info(
                f'Loaded {len(self.formula_cobjects)} formula segments and'
                f' {len(self.db_data_cobjects)} db_data objects from cache'
            )
        else:
            self.vmexec.call_async(
                build_database_local, (self.db_config, self.ds_config, self.mols_dbs_cobjects)
            )
            (
                self.formula_cobjects,
                self.db_data_cobjects,
                build_db_exec_time,
            ) = self.vmexec.get_result()
            PipelineStats.append_vm(
                'build_database', build_db_exec_time, cloud_objects_n=len(self.formula_cobjects)
            )
            logger.info(
                f'Built {len(self.formula_cobjects)} formula segments and'
                f' {len(self.db_data_cobjects)} db_data objects'
            )
            self.cacher.save((self.formula_cobjects, self.db_data_cobjects), cache_key)

        if debug_validate:
            validate_formula_cobjects(self.storage, self.formula_cobjects)

    def calculate_centroids(self, use_cache=True, debug_validate=False):
        cache_key = ':ds/:db/calculate_centroids.cache'

        if use_cache and self.cacher.exists(cache_key):
            self.peaks_cobjects = self.cacher.load(cache_key)
            logger.info(f'Loaded {len(self.peaks_cobjects)} centroid chunks from cache')
        else:
            self.peaks_cobjects = calculate_centroids(
                self.fexec, self.formula_cobjects, self.ds_config
            )
            logger.info(f'Calculated {len(self.peaks_cobjects)} centroid chunks')
            self.cacher.save(self.peaks_cobjects, cache_key)

        if debug_validate:
            validate_peaks_cobjects(self.fexec, self.peaks_cobjects)

    def segment_ds(self, use_cache=True, debug_validate=False):
        cache_key = ':ds/segment_ds.cache'

        if use_cache and self.cacher.exists(cache_key):
            result = self.cacher.load(cache_key)
            logger.info(f'Loaded {len(result[2])} dataset segments from cache')
        else:
            sort_memory = 2 ** 32
            self.vmexec.call_async(
                load_and_split_ds_vm, (self.ds_config, self.ds_segm_size_mb, sort_memory)
            )
            result = self.vmexec.get_result()

            logger.info(f'Segmented dataset chunks into {len(result[2])} segments')
            self.cacher.save(result, cache_key)
        (
            self.imzml_reader,
            self.ds_segments_bounds,
            self.ds_segms_cobjects,
            self.ds_segms_len,
            ds_segm_stats,
        ) = result
        for func_name, exec_time in ds_segm_stats:
            if func_name == 'upload_segments':
                cobjs_n = len(self.ds_segms_cobjects)
            else:
                cobjs_n = 0
            PipelineStats.append_vm(func_name, exec_time, cloud_objects_n=cobjs_n)

        self.ds_segm_n = len(self.ds_segms_cobjects)
        self.is_intensive_dataset = self.ds_segm_n * self.ds_segm_size_mb > 5000

        if debug_validate:
            validate_ds_segments(
                self.fexec,
                self.imzml_reader,
                self.ds_segments_bounds,
                self.ds_segms_cobjects,
                self.ds_segms_len,
            )

    def segment_centroids(self, use_cache=True, debug_validate=False):
        mz_min, mz_max = self.ds_segments_bounds[0, 0], self.ds_segments_bounds[-1, 1]
        cache_key = ':ds/:db/segment_centroids.cache'

        if use_cache and self.cacher.exists(cache_key):
            self.clip_centr_chunks_cobjects, self.db_segms_cobjects = self.cacher.load(cache_key)
            logger.info(f'Loaded {len(self.db_segms_cobjects)} centroids segments from cache')
        else:
            self.clip_centr_chunks_cobjects, centr_n = clip_centr_df(
                self.fexec, self.peaks_cobjects, mz_min, mz_max
            )
            centr_segm_lower_bounds = define_centr_segments(
                self.fexec,
                self.clip_centr_chunks_cobjects,
                centr_n,
                self.ds_segm_n,
                self.ds_segm_size_mb,
            )

            max_ds_segms_size_per_db_segm_mb = 2560 if self.is_intensive_dataset else 1536
            self.db_segms_cobjects = segment_centroids(
                self.fexec,
                self.clip_centr_chunks_cobjects,
                centr_segm_lower_bounds,
                self.ds_segments_bounds,
                self.ds_segm_size_mb,
                max_ds_segms_size_per_db_segm_mb,
                self.image_gen_config['ppm'],
            )
            logger.info(f'Segmented centroids chunks into {len(self.db_segms_cobjects)} segments')

            self.cacher.save((self.clip_centr_chunks_cobjects, self.db_segms_cobjects), cache_key)

        self.centr_segm_n = len(self.db_segms_cobjects)

        if debug_validate:
            validate_centroid_segments(
                self.fexec,
                self.db_segms_cobjects,
                self.ds_segments_bounds,
                self.image_gen_config['ppm'],
            )

    def annotate(self, use_cache=True):
        cache_key = ':ds/:db/annotate.cache'

        if use_cache and self.cacher.exists(cache_key):
            self.formula_metrics_df, self.images_cloud_objs = self.cacher.load(cache_key)
            logger.info(f'Loaded {self.formula_metrics_df.shape[0]} metrics from cache')
        else:
            logger.info('Annotating...')
            memory_capacity_mb = 2048 if self.is_intensive_dataset else 1024
            process_centr_segment = create_process_segment(
                self.ds_segms_cobjects,
                self.ds_segments_bounds,
                self.ds_segms_len,
                self.imzml_reader,
                self.image_gen_config,
                memory_capacity_mb,
                self.ds_segm_size_mb,
            )

            futures = self.fexec.map(
                process_centr_segment, self.db_segms_cobjects, runtime_memory=memory_capacity_mb
            )
            formula_metrics_list, images_cloud_objs = zip(*self.fexec.get_result(futures))
            self.formula_metrics_df = pd.concat(formula_metrics_list)
            self.images_cloud_objs = list(chain(*images_cloud_objs))
            PipelineStats.append_pywren(
                futures, memory_mb=memory_capacity_mb, cloud_objects_n=len(self.images_cloud_objs)
            )
            logger.info(f'Metrics calculated: {self.formula_metrics_df.shape[0]}')
            self.cacher.save((self.formula_metrics_df, self.images_cloud_objs), cache_key)

    def run_fdr(self, use_cache=True):
        cache_key = ':ds/:db/run_fdr.cache'

        if use_cache and self.cacher.exists(cache_key):
            self.fdrs = self.cacher.load(cache_key)
            logger.info('Loaded fdrs from cache')
        else:
            self.vmexec.call_async(
                calculate_fdrs_vm, (self.formula_metrics_df, self.db_data_cobjects)
            )
            self.fdrs, fdr_exec_time = self.vmexec.get_result()

            PipelineStats.append_vm('calculate_fdrs', fdr_exec_time)
            self.cacher.save(self.fdrs, cache_key)

        logger.info('Number of annotations at with FDR less than:')
        for fdr_step in [0.05, 0.1, 0.2, 0.5]:
            logger.info(f'{fdr_step*100:2.0f}%: {(self.fdrs.fdr < fdr_step).sum()}')

    def get_results(self):
        results_df = self.formula_metrics_df.merge(self.fdrs, left_index=True, right_index=True)
        results_df = results_df[~results_df.adduct.isna()]
        results_df = results_df.sort_values('fdr')
        self.results_df = results_df
        return results_df

    def get_images(self):
        # Only download interesting images, to prevent running out of memory
        targets = set(self.results_df.index[self.results_df.fdr <= 0.5])

        def get_target_images(images_cobject, storage):
            images = {}
            segm_images = read_cloud_object_with_retry(storage, images_cobject, deserialise)
            for k, v in segm_images.items():
                if k in targets:
                    images[k] = v
            return images

        futures = self.fexec.map(get_target_images, self.images_cloud_objs, runtime_memory=1024)
        all_images = {}
        for image_set in self.fexec.get_result(futures):
            all_images.update(image_set)

        return all_images

    def check_results(self):
        results_df = self.get_results()
        metaspace_options = self.config.get('metaspace_options', {})
        reference_results = get_reference_results(metaspace_options, self.ds_config['metaspace_id'])

        checked_results = check_results(results_df, reference_results)

        log_bad_results(**checked_results)
        return checked_results

    def clean(self, hard=False):
        self.cacher.clean(hard=hard)
