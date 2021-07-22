from __future__ import annotations

import json
import logging
from contextlib import contextmanager, ExitStack
from typing import List, Dict

import pandas as pd
from lithops.storage import Storage
from lithops.storage.utils import CloudObject, StorageNoSuchKeyError

from sm.engine.annotation_lithops.build_moldb import (
    build_moldb,
    InputMolDb,
    DbFDRData,
)
from sm.engine.annotation_lithops.calculate_centroids import (
    calculate_centroids,
    validate_centroids,
)
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import (
    CObj,
    save_cobj,
    iter_cobjects_with_prefetch,
    deserialize,
)
from sm.engine.annotation_lithops.utils import jsonhash
from sm.engine.utils.db_mutex import DBMutex
from sm.engine.ds_config import DSConfig
from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper

logger = logging.getLogger('annotation-pipeline')


class CentroidsCacheEntry:
    def __init__(
        self, executor: Executor, sm_storage: Dict, ds_config: DSConfig, moldbs: List[InputMolDb]
    ):
        ds_hash_params = ds_config.copy()
        self.ds_config = {
            **ds_hash_params,  # type: ignore # https://github.com/python/mypy/issues/4122
            # Include the `targeted` value of databases so that a new cache entry is made if
            # someone manually changes that field
            'databases': [(moldb['id'], moldb['targeted']) for moldb in moldbs],
        }
        # Remove database_ids as it may be in a different order to moldbs
        del self.ds_config['database_ids']

        self.ds_hash = jsonhash(self.ds_config)

        self.executor = executor
        self.storage = executor.storage
        self.bucket, raw_prefix = sm_storage['centroids']
        self.prefix = f"{raw_prefix}/{self.ds_hash}"
        self.config_key = f'{self.prefix}/ds_config.json'
        self.meta_key = f'{self.prefix}/meta'

    @contextmanager
    def lock(self):
        with DBMutex().lock(self.ds_hash, timeout=3600):
            yield

    def load(self):
        try:
            db_data_cobjs, peaks_cobjs = deserialize(
                self.storage.get_object(self.bucket, self.meta_key)
            )
            return db_data_cobjs, peaks_cobjs
        except StorageNoSuchKeyError:
            return None

    def save(self, db_data_cobjs: List[CObj[DbFDRData]], peaks_cobjs: List[CObj[pd.DataFrame]]):
        def batch_copy(src_cobjs: List[CloudObject], dest_prefix: str, *, storage: Storage):
            # If Lithops' storage supported Copy Object operations, this could be easily optimized.
            # Not sure if it's worth the effort yet
            result_cobjs = []
            for i, data in enumerate(iter_cobjects_with_prefetch(storage, src_cobjs)):
                dest_key = f'{dest_prefix}/{i:06}'
                result_cobjs.append(storage.put_cloudobject(data, dest_bucket, dest_key))
            return result_cobjs

        dest_bucket = self.bucket
        # Copy cobjs to the cache dir
        new_db_data_cobjs, new_peaks_cobjs = self.executor.map(
            batch_copy,
            [(db_data_cobjs, f'{self.prefix}/db_data'), (peaks_cobjs, f'{self.prefix}/peaks')],
            runtime_memory=1024,
        )

        # Save config in case it's needed for debugging
        self.storage.put_cloudobject(
            json.dumps(self.ds_config, indent=4), self.bucket, self.config_key
        )
        # Save list of cobjects. This list would be easy to reconstruct by listing keys, but
        # saving a separate object as the last step of the process is helpful to confirm that
        # the cache item is complete, and didn't partially fail to copy.
        save_cobj(self.storage, (new_db_data_cobjs, new_peaks_cobjs), self.bucket, self.meta_key)

        return new_db_data_cobjs, new_peaks_cobjs

    def clear(self):
        keys = self.storage.list_keys(self.bucket, self.prefix)
        if keys:
            logger.info(f'Clearing centroids cache {self.prefix}')
            self.storage.delete_objects(self.bucket, keys)


def get_moldb_centroids(
    executor: Executor,
    sm_storage: Dict,
    ds_config: DSConfig,
    moldbs: List[InputMolDb],
    debug_validate=False,
    use_cache=True,
    use_db_mutex=True,
):
    moldb_cache = CentroidsCacheEntry(executor, sm_storage, ds_config, moldbs)

    with ExitStack() as stack:
        if use_db_mutex:
            stack.enter_context(moldb_cache.lock())

        if use_cache:
            cached_val = moldb_cache.load()
        else:
            cached_val = None
            moldb_cache.clear()

        if cached_val:
            db_data_cobjs, peaks_cobjs = cached_val
            logger.info(
                f'Loaded {len(db_data_cobjs)} DBs, {len(peaks_cobjs)} peak segms from cache'
            )
        else:
            formula_cobjs, db_data_cobjs = build_moldb(executor, ds_config, moldbs)
            isocalc_wrapper = IsocalcWrapper(ds_config)
            peaks_cobjs = calculate_centroids(executor, formula_cobjs, isocalc_wrapper)
            if debug_validate:
                validate_centroids(executor, peaks_cobjs)

            moldb_cache.save(db_data_cobjs, peaks_cobjs)
            logger.info(f'Saved {len(db_data_cobjs)} DBs, {len(peaks_cobjs)} peak segms to cache')

    return db_data_cobjs, peaks_cobjs
