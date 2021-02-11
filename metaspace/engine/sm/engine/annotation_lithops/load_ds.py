from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Tuple, List

import numpy as np
import pandas as pd
from lithops.storage import Storage
from lithops.storage.utils import CloudObject
from pyimzml.ImzMLParser import ImzMLParser, PortableSpectrumReader

from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import (
    save_cobj,
    CObj,
    get_ranges_from_cobject,
    load_cobj,
)
from sm.engine.annotation_lithops.utils import get_pixel_indices
from sm.engine.utils.perf_profile import SubtaskProfiler

logger = logging.getLogger('annotation-pipeline')


def load_portable_spectrum_reader(storage: Storage, imzml_cobject: CloudObject):
    stream = storage.get_cloudobject(imzml_cobject, stream=True)

    imzml_parser = ImzMLParser(stream, parse_lib='ElementTree', ibd_file=None)
    return imzml_parser.portable_spectrum_reader()


def get_spectra(
    storage: Storage,
    imzml_reader: PortableSpectrumReader,
    ibd_cobj: CloudObject,
    sp_inds: List[int],
):
    mz_starts = np.array(imzml_reader.mzOffsets)[sp_inds]
    mz_ends = (
        mz_starts
        + np.array(imzml_reader.mzLengths)[sp_inds] * np.dtype(imzml_reader.mzPrecision).itemsize
    )
    mz_ranges = np.stack([mz_starts, mz_ends], axis=1)
    int_starts = np.array(imzml_reader.intensityOffsets)[sp_inds]
    int_ends = (
        int_starts
        + np.array(imzml_reader.intensityLengths)[sp_inds]
        * np.dtype(imzml_reader.intensityPrecision).itemsize
    )
    int_ranges = np.stack([int_starts, int_ends], axis=1)
    ranges_to_read = np.vstack([mz_ranges, int_ranges])
    data_ranges = get_ranges_from_cobject(storage, ibd_cobj, ranges_to_read)
    mz_data = data_ranges[: len(sp_inds)]
    int_data = data_ranges[len(sp_inds) :]
    del data_ranges

    for i, sp_idx in enumerate(sp_inds):
        mzs = np.frombuffer(mz_data[i], dtype=imzml_reader.mzPrecision)
        ints = np.frombuffer(int_data[i], dtype=imzml_reader.intensityPrecision)
        if (ints == 0).any():
            # One imzml exporter includes all m/z values for all spectra, even if intensities are
            # zero. Zero-intensity peaks are useless, so exclude them.
            mzs = mzs[ints != 0]
            ints = ints[ints != 0]

        mz_data[i] = None  # type: ignore # Avoid holding memory longer than necessary
        int_data[i] = None  # type: ignore
        yield sp_idx, mzs.copy(), ints.copy()


def _load_spectra(storage, imzml_reader, ibd_cobject):
    # Pre-allocate lists of mz & int arrays
    n_spectra = len(imzml_reader.coordinates)
    mz_arrays = [np.array([], dtype=imzml_reader.mzPrecision)] * n_spectra
    int_arrays = [np.array([], dtype=np.float32)] * n_spectra
    sp_lens = np.empty(n_spectra, np.int64)

    def read_spectrum_chunk(start_end):
        spectra = get_spectra(storage, imzml_reader, ibd_cobject, list(range(*start_end)))
        for sp_i, mzs, ints in spectra:
            mz_arrays[sp_i] = mzs
            int_arrays[sp_i] = ints.astype(np.float32)
            sp_lens[sp_i] = len(ints)

    # Break into approx. 100MB chunks to read in parallel
    n_peaks = np.sum(imzml_reader.mzLengths)
    n_chunks = min(int(np.ceil(n_peaks / (10 * 2 ** 20))), n_spectra)
    chunk_bounds = np.linspace(0, n_spectra, n_chunks + 1, dtype=np.int64)
    spectrum_chunks = zip(chunk_bounds, chunk_bounds[1:])

    with ThreadPoolExecutor(4) as executor:
        for _ in executor.map(read_spectrum_chunk, spectrum_chunks):
            pass

    return np.concatenate(mz_arrays), np.concatenate(int_arrays), sp_lens


def _sort_spectra(imzml_reader, mzs, ints, sp_lens):
    # Specify mergesort explicitly because numpy often chooses heapsort which is super slow
    by_mz = np.argsort(mzs, kind='mergesort')

    # The existing `mzs` and `ints` arrays can't be garbage-collected because the calling function
    # holds references to them. Overwrite the original arrays with the temp sorted arrays so that
    # the temp arrays can be freed instead.
    mzs[:] = mzs[by_mz]
    ints[:] = ints[by_mz]
    # Build sp_idxs after sorting mzs. Sorting mzs uses the most memory, so it's best to keep
    # sp_idxs in a compacted form with sp_lens until the last minute.
    sp_id_to_idx = get_pixel_indices(imzml_reader.coordinates)
    sp_idxs = np.empty(len(ints), np.uint32)
    sp_lens = np.cumsum(sp_lens)
    for sp_id, (start, end) in enumerate(zip(sp_lens[:-1], sp_lens[1:])):
        sp_idxs[start:end] = sp_id_to_idx[sp_id]
    sp_idxs = sp_idxs[by_mz]
    return mzs, ints, sp_idxs


def _upload_segments(storage, ds_segm_size_mb, imzml_reader, mzs, ints, sp_idxs):
    # Split into segments no larger than ds_segm_size_mb
    total_n_mz = len(sp_idxs)
    row_size = (4 if imzml_reader.mzPrecision == 'f' else 8) + 4 + 4
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
) -> Tuple[
    PortableSpectrumReader, np.ndarray, List[CObj[pd.DataFrame]], np.ndarray,
]:
    logger.info('Loading .imzML file...')
    imzml_reader = load_portable_spectrum_reader(storage, imzml_cobject)
    perf.record_entry(
        'loaded imzml',
        n_peaks=np.sum(imzml_reader.intensityLengths),
        mz_dtype=imzml_reader.mzPrecision,
        int_dtype=imzml_reader.intensityPrecision,
    )

    logger.info('Reading spectra')
    mzs, ints, sp_lens = _load_spectra(storage, imzml_reader, ibd_cobject)
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
):
    try:
        ibd_head = executor.storage.head_object(ibd_cobject.bucket, ibd_cobject.key)
        ibd_size_mb = int(ibd_head['content-length']) / 1024 // 1024
    except Exception:
        logger.warning("Couldn't read ibd size", exc_info=True)
        ibd_size_mb = 1024

    # Guess the amount of memory needed. For the majority of datasets (no zero-intensity peaks,
    # separate m/z arrays per spectrum) approximately 3x the ibd file size is used during the
    # most memory-intense part (sorting the m/z array).
    if ibd_size_mb * 3 + 512 < 4096:
        logger.debug(f'Found {ibd_size_mb}MB .ibd file. Trying serverless load_ds')
        runtime_memory = 4096
    else:
        logger.debug(f'Found {ibd_size_mb}MB .ibd file. Using VM-based load_ds')
        runtime_memory = 32768

    imzml_reader, ds_segments_bounds, ds_segms_cobjs, ds_segm_lens = executor.call(
        _load_ds, (imzml_cobject, ibd_cobject, ds_segm_size_mb), runtime_memory=runtime_memory,
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
    assert ds_segments_bounds.shape == (n_segms, 2,), (ds_segments_bounds.shape, (n_segms, 2))

    results = fexec.map(get_segm_stats, ds_segms_cobjs)

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
        expected_total_len = np.sum(imzml_reader.mzLengths)
        if total_len != expected_total_len:
            logger.warning(
                f'segment_spectra output {total_len} peaks, '
                f'but the imzml file contained {expected_total_len}'
            )
