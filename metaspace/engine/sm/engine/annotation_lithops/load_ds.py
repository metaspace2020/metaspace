from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Tuple, List

import numpy as np
import pandas as pd
from lithops.storage import Storage
from lithops.storage.utils import CloudObject

from sm.engine.annotation.imzml_reader import LithopsImzMLReader
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import CObj, load_cobj, save_cobj
from sm.engine.utils.perf_profile import SubtaskProfiler

logger = logging.getLogger('annotation-pipeline')


def _load_spectra(storage, imzml_reader):
    # Pre-allocate lists of mz & int arrays
    mz_arrays = [np.array([], dtype=imzml_reader.mz_precision)] * imzml_reader.n_spectra
    int_arrays = [np.array([], dtype=np.float32)] * imzml_reader.n_spectra
    sp_lens = np.empty(imzml_reader.n_spectra, np.int64)

    def read_spectrum_chunk(start_end):
        for sp_i, mzs, ints in imzml_reader.iter_spectra(storage, list(range(*start_end))):
            mz_arrays[sp_i] = mzs
            int_arrays[sp_i] = ints.astype(np.float32)
            sp_lens[sp_i] = len(ints)

    # Break into approx. 100MB chunks to read in parallel
    n_peaks = np.sum(imzml_reader.imzml_reader.mzLengths)
    n_chunks = min(int(np.ceil(n_peaks / (10 * 2 ** 20))), imzml_reader.n_spectra)
    chunk_bounds = np.linspace(0, imzml_reader.n_spectra, n_chunks + 1, dtype=np.int64)
    spectrum_chunks = zip(chunk_bounds, chunk_bounds[1:])

    with ThreadPoolExecutor(4) as executor:
        for _ in executor.map(read_spectrum_chunk, spectrum_chunks):
            pass

    return np.concatenate(mz_arrays), np.concatenate(int_arrays), sp_lens


def _sort_spectra(imzml_reader, mzs, ints, sp_lens):
    # Mergesort is used for 2 reasons:
    # * It's much faster than the default quicksort, because m/z data is already partially sorted
    #   and the underlying "Timsort" implementation is optimized for partially-sorted data.
    # * It's a "stable sort", meaning it will preserve the ordering by spectrum index if mz values
    #   are equal. The order of pixels affects some metrics, so this stability is important.
    by_mz = np.argsort(mzs, kind='mergesort')

    # The existing `mzs` and `ints` arrays can't be garbage-collected because the calling function
    # holds references to them. Overwrite the original arrays with the temp sorted arrays so that
    # the temp arrays can be freed instead.
    mzs[:] = mzs[by_mz]
    ints[:] = ints[by_mz]
    # Build sp_idxs after sorting mzs. Sorting mzs uses the most memory, so it's best to keep
    # sp_idxs in a compacted form with sp_lens until the last minute.
    sp_idxs = np.empty(len(ints), np.uint32)
    sp_lens = np.insert(np.cumsum(sp_lens), 0, 0)
    for sp_idx, start, end in zip(imzml_reader.pixel_indexes, sp_lens[:-1], sp_lens[1:]):
        sp_idxs[start:end] = sp_idx
    sp_idxs = sp_idxs[by_mz]
    return mzs, ints, sp_idxs


def _upload_segments(storage, ds_segm_size_mb, imzml_reader, mzs, ints, sp_idxs):
    # Split into segments no larger than ds_segm_size_mb
    total_n_mz = len(sp_idxs)
    row_size = (4 if imzml_reader.mz_precision == 'f' else 8) + 4 + 4
    segm_n = int(np.ceil(total_n_mz * row_size / (ds_segm_size_mb * 2 ** 20)))
    segm_bounds = np.linspace(0, total_n_mz, segm_n + 1, dtype=np.int64)
    segm_ranges = list(zip(segm_bounds[:-1], segm_bounds[1:]))
    ds_segm_lens = np.diff(segm_bounds)
    ds_segments_bounds = np.column_stack([mzs[segm_bounds[:-1]], mzs[segm_bounds[1:] - 1]])

    def upload_segm(start_end):
        start, end = start_end
        df = pd.DataFrame(
            {'mz': mzs[start:end], 'int': ints[start:end], 'sp_i': sp_idxs[start:end]},
            index=pd.RangeIndex(start, end),
        )
        return save_cobj(storage, df)

    with ThreadPoolExecutor(2) as executor:
        ds_segms_cobjs = list(executor.map(upload_segm, segm_ranges))
    return ds_segms_cobjs, ds_segments_bounds, ds_segm_lens


def _load_ds(
    imzml_cobject: CloudObject,
    ibd_cobject: CloudObject,
    ds_segm_size_mb: int,
    *,
    storage: Storage,
    perf: SubtaskProfiler,
) -> Tuple[LithopsImzMLReader, np.ndarray, List[CObj[pd.DataFrame]], np.ndarray,]:
    logger.info('Loading .imzML file...')
    imzml_reader = LithopsImzMLReader(storage, imzml_cobject, ibd_cobject)
    perf.record_entry(
        'loaded imzml',
        n_peaks=np.sum(imzml_reader.imzml_reader.intensityLengths),
        mz_dtype=imzml_reader.imzml_reader.mzPrecision,
        int_dtype=imzml_reader.imzml_reader.intensityPrecision,
    )

    logger.info('Reading spectra')
    mzs, ints, sp_lens = _load_spectra(storage, imzml_reader)
    perf.record_entry('read spectra', n_peaks=len(mzs))

    logger.info('Sorting spectra')
    mzs, ints, sp_idxs = _sort_spectra(imzml_reader, mzs, ints, sp_lens)
    perf.record_entry('sorted spectra')

    logger.info('Uploading segments')
    ds_segms_cobjs, ds_segments_bounds, ds_segm_lens = _upload_segments(
        storage, ds_segm_size_mb, imzml_reader, mzs, ints, sp_idxs
    )
    perf.record_entry('uploaded segments', n_segms=len(ds_segms_cobjs))

    return imzml_reader, ds_segments_bounds, ds_segms_cobjs, ds_segm_lens


def load_ds(
    executor: Executor, imzml_cobject: CloudObject, ibd_cobject: CloudObject, ds_segm_size_mb: int
) -> Tuple[LithopsImzMLReader, np.ndarray, List[CObj[pd.DataFrame]], np.ndarray,]:
    try:
        ibd_head = executor.storage.head_object(ibd_cobject.bucket, ibd_cobject.key)
        ibd_size_mb = int(ibd_head['content-length']) / 1024 // 1024
    except Exception:
        logger.warning("Couldn't read ibd size", exc_info=True)
        ibd_size_mb = 1024

    # Guess the amount of memory needed. For the majority of datasets (no zero-intensity peaks,
    # separate m/z arrays per spectrum) approximately 3x the ibd file size is used during the
    # most memory-intense part (sorting the m/z array).
    if ibd_size_mb * 3 + 512 < 32 * 1024:
        logger.info(f'Found {ibd_size_mb}MB .ibd file. Trying serverless load_ds')
        runtime_memory = max(2048, int(2 ** np.ceil(np.log2(ibd_size_mb * 3 + 512))))
    else:
        logger.info(f'Found {ibd_size_mb}MB .ibd file. Using VM-based load_ds')
        runtime_memory = 128 * 1024

    imzml_reader, ds_segments_bounds, ds_segms_cobjs, ds_segm_lens = executor.call(
        _load_ds,
        (imzml_cobject, ibd_cobject, ds_segm_size_mb),
        runtime_memory=runtime_memory,
        timeout=1200,
    )

    logger.info(f'Segmented dataset chunks into {len(ds_segms_cobjs)} segments')

    return imzml_reader, ds_segments_bounds, ds_segms_cobjs, ds_segm_lens


def validate_ds_segments(fexec, imzml_reader, ds_segments_bounds, ds_segms_cobjs, ds_segm_lens):
    def get_segm_stats(cobj, storage):
        segm = load_cobj(storage, cobj)
        assert (
            segm.columns == ['mz', 'int', 'sp_i']
        ).all(), f'Wrong ds_segm columns: {segm.columns}'
        assert isinstance(
            segm.index, pd.RangeIndex
        ), f'ds_segm does not have a RangeIndex {segm.index}'

        assert segm.dtypes[1] == np.float32, 'ds_segm.int should be float32'
        assert segm.dtypes[2] == np.uint32, 'ds_segm.sp_i should be uint32'

        return pd.Series(
            {
                'n_rows': len(segm),
                'min_mz': segm.mz.min(),
                'max_mz': segm.mz.max(),
                'is_sorted': segm.mz.is_monotonic,
            }
        )

    n_segms = len(ds_segms_cobjs)
    assert n_segms == len(ds_segm_lens), (n_segms, len(ds_segm_lens))
    assert ds_segments_bounds.shape == (
        n_segms,
        2,
    ), (ds_segments_bounds.shape, (n_segms, 2))

    args = [(cobj,) for cobj in ds_segms_cobjs]
    results = fexec.map(get_segm_stats, args)

    segms_df = pd.DataFrame(results)
    segms_df['min_bound'] = np.concatenate([[0], ds_segments_bounds[1:, 0]])
    segms_df['max_bound'] = np.concatenate([ds_segments_bounds[:-1, 1], [100000]])
    segms_df['expected_len'] = ds_segm_lens

    with pd.option_context(
        'display.max_rows', None, 'display.max_columns', None, 'display.width', 1000
    ):
        out_of_bounds = segms_df[
            (segms_df.min_mz < segms_df.min_bound) | (segms_df.max_mz > segms_df.max_bound)
        ]
        if not out_of_bounds.empty:
            logger.warning('segment_spectra mz values are outside ds_segments_bounds:')
            logger.warning(out_of_bounds)

        bad_len = segms_df[segms_df.n_rows != segms_df.expected_len]
        if not bad_len.empty:
            logger.warning('segment_spectra lengths don\'t match ds_segm_lens:')
            logger.warning(bad_len)

        unsorted = segms_df[~segms_df.is_sorted]
        if not unsorted.empty:
            logger.warning('segment_spectra produced unsorted segments:')
            logger.warning(unsorted)

        total_len = segms_df.n_rows.sum()
        expected_total_len = np.sum(imzml_reader.imzml_reader.mzLengths)
        if total_len != expected_total_len:
            logger.warning(
                f'segment_spectra output {total_len} peaks, '
                f'but the imzml file contained {expected_total_len}'
            )
