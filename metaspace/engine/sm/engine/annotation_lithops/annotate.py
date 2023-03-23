from __future__ import annotations

import logging
from typing import List, Tuple, Optional, Iterator, Any

import numpy as np
import pandas as pd
from lithops.storage import Storage
from scipy.sparse import coo_matrix

from sm.engine.annotation.formula_validator import (
    compute_and_filter_metrics,
    make_compute_image_metrics,
    Metrics,
    EMPTY_METRICS_DF,
    FormulaImageSet,
)
from sm.engine.annotation.imzml_reader import LithopsImzMLReader
from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import save_cobj, load_cobj, CObj, load_cobjs
from sm.engine.ds_config import DSConfig
from sm.engine.utils.perf_profile import Profiler

ImagesRow = Tuple[int, int, List[coo_matrix]]
logger = logging.getLogger('annotation-pipeline')


class ImagesManager:
    """
    Collects ion images (in sparse coo_matrix format) and formula metrics.
    Images are progressively saved to COS in chunks specified by `chunk_size` to
    prevent using too much memory, and to control the batch size during PNG conversion.
    """

    chunk_size = 50 * 1024 ** 2  # 50MB

    def __init__(self, storage: Storage):

        self._formula_metrics: List[Metrics] = []
        self._images_buffer: List[ImagesRow] = []
        self._images_dfs: List[pd.DataFrame] = []

        self._formula_images_size = 0
        self._storage = storage

    def append(self, f_i: int, f_metrics: Metrics, f_images: Optional[List[coo_matrix]]):
        self._formula_metrics.append(f_metrics)

        if f_images:
            size = ImagesManager.images_size(f_images)
            n_pixels = ImagesManager.n_pixels(f_images)
            if self._formula_images_size + size > self.chunk_size:
                self._flush_images()
            self._images_buffer.append((f_i, n_pixels, f_images))
            self._formula_images_size += size

    @staticmethod
    def images_size(f_images):
        return sum(
            img.data.nbytes + img.row.nbytes + img.col.nbytes for img in f_images if img is not None
        )

    @staticmethod
    def n_pixels(f_images):
        return sum(img.nnz for img in f_images if img is not None)

    def _flush_images(self):
        if self._images_buffer:
            print(f'Saving {len(self._images_buffer)} images')
            cobj_data = dict((f_i, f_images) for f_i, size, f_images in self._images_buffer)
            cloud_obj = save_cobj(self._storage, cobj_data)
            images_df = pd.DataFrame(
                {
                    'formula_i': [f_i for f_i, n_pixels, f_images in self._images_buffer],
                    'n_pixels': [n_pixels for f_i, n_pixels, f_images in self._images_buffer],
                    'cobj': cloud_obj,
                }
            ).set_index('formula_i')
            self._images_dfs.append(images_df)
        else:
            print('No images to save')

        self._images_buffer.clear()
        self._formula_images_size = 0

    def finish(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
        self._flush_images()
        if len(self._formula_metrics) > 0:
            formula_metrics_df = pd.DataFrame(self._formula_metrics)
            unknown_fields = set(self._formula_metrics[0].__dict__.keys()) - set(
                formula_metrics_df.columns
            )
            if unknown_fields:
                print('Unknown fields: ' + "\n".join(sorted(unknown_fields)))
        else:
            formula_metrics_df = EMPTY_METRICS_DF
        formula_metrics_df = formula_metrics_df.set_index('formula_i')

        if len(self._images_dfs) > 0:
            images_df = pd.concat(self._images_dfs)
        else:
            images_df = pd.DataFrame(
                {'n_pixels': pd.Series(dtype='l'), 'cobj': pd.Series(dtype='O')},
                index=pd.Series(name='formula_i', dtype='l'),
            )
        return formula_metrics_df, images_df


def gen_iso_image_sets(
    sp_inds, sp_mzs, sp_ints, centr_df, nrows, ncols, isocalc_wrapper, n_peaks
) -> Iterator[FormulaImageSet]:
    # pylint: disable=too-many-locals
    # assume sp data is sorted by mz order ascending

    def yield_buffer(buffer):
        buffer = sorted(buffer, key=lambda row: row[0].peak_i)
        first_row = buffer[0][0]
        image_set = FormulaImageSet(
            formula_i=first_row.formula_i,
            is_target=first_row.target,
            targeted=first_row.targeted,
            theo_mzs=[0.0] * n_peaks,
            theo_ints=[0.0] * n_peaks,
            images=[None] * n_peaks,
            mz_images=[None] * n_peaks,
        )

        for row, ints_img, mz_img in buffer:
            image_set.theo_mzs[row.peak_i] = row.mz
            image_set.theo_ints[row.peak_i] = row.int
            image_set.images[row.peak_i] = ints_img
            image_set.mz_images[row.peak_i] = mz_img

        return image_set

    if len(sp_inds) > 0:
        centr_df = centr_df.sort_values(['formula_i', 'peak_i'])
        lower_mz, upper_mz = isocalc_wrapper.mass_accuracy_bounds(centr_df.mz.values)
        cols = ['formula_i', 'peak_i', 'int', 'mz', 'target', 'targeted']
        centr_df = centr_df[cols].assign(
            lower_idx=np.searchsorted(sp_mzs, lower_mz, 'l'),
            upper_idx=np.searchsorted(sp_mzs, upper_mz, 'r'),
        )

        buffer: List[Tuple[Any, coo_matrix, coo_matrix]] = []
        for row in centr_df.itertuples(False):
            if len(buffer) != 0 and buffer[0][0].formula_i != row.formula_i:
                yield yield_buffer(buffer)
                buffer = []

            image = None
            mz_image = None
            if row.upper_idx > row.lower_idx:
                # Copy arrays so that these slices don't pin the whole dataset segment in memory
                ints = sp_ints[row.lower_idx : row.upper_idx].astype('f', copy=True)
                mzs = sp_mzs[row.lower_idx : row.upper_idx].astype('f', copy=True)
                inds = sp_inds[row.lower_idx : row.upper_idx]
                row_inds, col_inds = np.divmod(inds, ncols, dtype='i')
                # The row_inds/col_inds can be safely shared between the two coo_matrixes
                image = coo_matrix((ints, (row_inds, col_inds)), shape=(nrows, ncols), copy=False)
                mz_image = coo_matrix((mzs, (row_inds, col_inds)), shape=(nrows, ncols), copy=False)
            buffer.append((row, image, mz_image))

        if len(buffer) != 0:
            yield yield_buffer(buffer)


def read_ds_segments(
    ds_segms_cobjs,
    ds_segm_lens,
    pw_mem_mb,
    ds_segm_size_mb,
    ds_segm_dtype,
    storage,
):

    ds_segms_mb = len(ds_segms_cobjs) * ds_segm_size_mb
    safe_mb = 512

    concat_memory_mb = ds_segms_mb * 3 + safe_mb
    if concat_memory_mb > pw_mem_mb:
        # Memory-conservative method for loading many segments. Instead of loading them all at once,
        # pre-allocate a destination DataFrame and load them into that dataframe one-at-a-time
        # to minimize the amount of temp data needed at any point in time.
        segm_len = sum(ds_segm_lens)
        print(f'Using pre-allocated concatenation (len {segm_len})')
        sp_df = pd.DataFrame(
            {
                'mz': np.zeros(segm_len, dtype=ds_segm_dtype),
                'int': np.zeros(segm_len, dtype=np.float32),
                'sp_i': np.zeros(segm_len, dtype=np.uint32),
            }
        )
        row_start, row_end = 0, 0
        for segm_i, cobj in enumerate(ds_segms_cobjs):
            sub_sp_df = load_cobj(storage, cobj)
            assert sub_sp_df.mz.is_monotonic
            assert len(sub_sp_df) == ds_segm_lens[segm_i], 'unexpected ds_segm length'
            row_end = row_start + len(sub_sp_df)
            print(
                f'populating sp_df range {row_start}:{row_end} '
                f'(m/z {sub_sp_df.mz.min():.6f}-{sub_sp_df.mz.max():.6f} from {cobj.key})'
            )
            # PANDAS! Why do you make it so hard to emplace values into a dataframe?
            sp_df.iloc[row_start:row_end, sp_df.columns.get_loc('mz')] = sub_sp_df.mz.values
            sp_df.iloc[row_start:row_end, sp_df.columns.get_loc('int')] = sub_sp_df.int.values
            sp_df.iloc[row_start:row_end, sp_df.columns.get_loc('sp_i')] = sub_sp_df.sp_i.values
            row_start = row_end
        assert row_end == len(sp_df)
    else:
        sp_df = pd.concat(load_cobjs(storage, ds_segms_cobjs), ignore_index=True, sort=False)

    assert sp_df.mz.is_monotonic

    return sp_df


def choose_ds_segments(ds_segments_bounds, centr_df, isocalc_wrapper):
    centr_segm_min_mz, centr_segm_max_mz = centr_df.mz.agg([np.min, np.max])
    centr_segm_min_mz, _ = isocalc_wrapper.mass_accuracy_bounds(centr_segm_min_mz)
    _, centr_segm_max_mz = isocalc_wrapper.mass_accuracy_bounds(centr_segm_max_mz)

    ds_segm_n = len(ds_segments_bounds)
    first_ds_segm_i = np.searchsorted(ds_segments_bounds[:, 0], centr_segm_min_mz, side='right') - 1
    first_ds_segm_i = max(0, first_ds_segm_i)
    last_ds_segm_i = np.searchsorted(
        ds_segments_bounds[:, 1], centr_segm_max_mz, side='left'
    )  # last included
    last_ds_segm_i = min(ds_segm_n - 1, last_ds_segm_i)
    return first_ds_segm_i, last_ds_segm_i


def process_centr_segments(
    fexec: Executor,
    ds_segms_cobjs: List[CObj[pd.DataFrame]],
    ds_segments_bounds,
    ds_segm_lens: np.ndarray,
    db_segms_cobjs: List[CObj[pd.DataFrame]],
    imzml_reader: LithopsImzMLReader,
    ds_config: DSConfig,
    ds_segm_size_mb: float,
    is_intensive_dataset: bool,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    # pylint: disable=too-many-locals
    # Copy needed fields out of imzml_reader so that the other unneeded fields aren't pulled into
    # the pickled `process_centr_segment` function
    ds_segm_dtype = imzml_reader.mz_precision
    nrows, ncols = imzml_reader.h, imzml_reader.w
    isocalc_wrapper = IsocalcWrapper(ds_config)
    image_gen_config = ds_config['image_generation']
    n_peaks = ds_config['isotope_generation']['n_peaks']
    compute_metrics = make_compute_image_metrics(imzml_reader, ds_config)
    min_px = image_gen_config['min_px']
    # TODO: Get available memory from Lithops somehow so it updates if memory is increased on retry
    pw_mem_mb = 4096 if is_intensive_dataset else 2048

    def process_centr_segment(
        db_segm_cobject: CObj[pd.DataFrame], *, storage: Storage, perf: Profiler
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        print(f'Reading centroids segment {db_segm_cobject.key}')
        # read database relevant part
        centr_df = load_cobj(storage, db_segm_cobject)
        perf.record_entry('loaded db segm', db_segm_len=len(centr_df))

        # find range of datasets
        first_ds_segm_i, last_ds_segm_i = choose_ds_segments(
            ds_segments_bounds, centr_df, isocalc_wrapper
        )
        print(f'Reading dataset segments {first_ds_segm_i}-{last_ds_segm_i}')
        # read all segments in loop from COS
        sp_arr = read_ds_segments(
            ds_segms_cobjs[first_ds_segm_i : last_ds_segm_i + 1],
            ds_segm_lens[first_ds_segm_i : last_ds_segm_i + 1],
            pw_mem_mb,
            ds_segm_size_mb,
            ds_segm_dtype,
            storage,
        )
        perf.record_entry('loaded ds segms', ds_segm_len=len(sp_arr))

        formula_image_set_it = gen_iso_image_sets(
            sp_inds=sp_arr.sp_i.values,
            sp_mzs=sp_arr.mz.values,
            sp_ints=sp_arr.int.values,
            centr_df=centr_df,
            nrows=nrows,
            ncols=ncols,
            isocalc_wrapper=isocalc_wrapper,
            n_peaks=n_peaks,
        )

        images_manager = ImagesManager(storage)
        compute_unused_metrics = ds_config['image_generation'].get('compute_unused_metrics')
        for f_i, f_metrics, f_images in compute_and_filter_metrics(
            formula_image_set_it,
            compute_metrics,
            min_px=min_px,
            compute_unused_metrics=compute_unused_metrics,
        ):
            images_manager.append(f_i, f_metrics, f_images)
        formula_metrics_df, image_lookups = images_manager.finish()

        perf.add_extra_data(metrics_n=len(formula_metrics_df), images_n=len(image_lookups))

        print(f'Centroids segment {db_segm_cobject.key} finished')
        return formula_metrics_df, image_lookups

    logger.info('Annotating...')
    formula_metrics_list, image_lookups_list = fexec.map_unpack(
        process_centr_segment,
        [(co,) for co in db_segms_cobjs],
        runtime_memory=pw_mem_mb,
        max_memory=8196,
        # debug_run_locally=True,
    )
    formula_metrics_df = pd.concat(formula_metrics_list)
    images_df = pd.concat(image_lookups_list)

    return formula_metrics_df, images_df
