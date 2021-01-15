from __future__ import annotations

import logging
import os
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Tuple, List

import numpy as np
import pandas as pd
from lithops.storage import Storage
from lithops.storage.utils import CloudObject
from pyimzml.ImzMLParser import ImzMLParser, PortableSpectrumReader

from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import (
    serialize_to_file,
    deserialize_from_file,
    save_cobj,
    CObj,
    get_ranges_from_cobject,
    load_cobj,
)
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
        yield sp_idx, mzs, ints


def plan_dataset_chunks(imzml_reader, max_size=512 * 1024 ** 2):
    item_size = np.dtype(imzml_reader.mzPrecision).itemsize + 4 + 4
    coord_sizes = np.array(imzml_reader.mzLengths) * item_size

    chunk_ranges = []
    chunk_start = 0
    chunk_size = 0
    for (i, size) in enumerate(coord_sizes):
        if chunk_size + size > max_size:
            chunk_ranges.append((chunk_start, i))
            chunk_start = i
            chunk_size = 0
        chunk_size += size
    chunk_ranges.append((chunk_start, len(coord_sizes)))
    return chunk_ranges


def parse_dataset_chunk(storage, imzml_reader, ibd_cobject, start, end):
    def get_pixel_indices(coordinates):
        _coord = np.array(coordinates, dtype=np.uint32)
        _coord -= np.min(_coord, axis=0)
        xs, ys = _coord[:, 0], _coord[:, 1]
        return ys * (np.max(xs) + 1) + xs

    sp_id_to_idx = get_pixel_indices(imzml_reader.coordinates)
    sp_inds_list, mzs_list, ints_list = [], [], []

    spectra = get_spectra(storage, imzml_reader, ibd_cobject, list(range(start, end)))
    for curr_sp_i, mzs_, ints_ in spectra:
        ints_ = ints_.astype(np.float32)
        sp_idx = np.ones_like(mzs_, dtype=np.uint32) * sp_id_to_idx[curr_sp_i]
        mzs_list.append(mzs_)
        ints_list.append(ints_)
        sp_inds_list.append(sp_idx)

    mzs = np.concatenate(mzs_list)
    by_mz = np.argsort(mzs)
    return pd.DataFrame(
        {
            'mz': mzs[by_mz],
            'int': np.concatenate(ints_list)[by_mz].astype(np.float32),
            'sp_i': np.concatenate(sp_inds_list)[by_mz],
        }
    )


def define_ds_segments(
    storage: Storage,
    imzml_reader: PortableSpectrumReader,
    ibd_cobject: CloudObject,
    ds_segm_size_mb=5,
    sample_sp_n=100,
):
    sample_size = min(sample_sp_n, len(imzml_reader.coordinates))
    sample_sp_inds = np.random.choice(np.arange(len(imzml_reader.coordinates)), sample_size)
    sample_mzs = np.concatenate(
        [mz for sp_idx, mz, ints in get_spectra(storage, imzml_reader, ibd_cobject, sample_sp_inds)]
    )

    total_n_mz = np.sum(imzml_reader.mzLengths)

    row_size = (4 if imzml_reader.mzPrecision == 'f' else 8) + 4 + 4
    segm_n = int(np.ceil(total_n_mz * row_size / (ds_segm_size_mb * 2 ** 20)))

    segm_bounds_q = [i * 1 / segm_n for i in range(0, segm_n + 1)]
    segm_lower_bounds = np.quantile(sample_mzs, segm_bounds_q)
    ds_segments_bounds = np.array(list(zip(segm_lower_bounds[:-1], segm_lower_bounds[1:])))

    max_mz_value = 10 ** 5
    ds_segments_bounds[0, 0] = 0
    ds_segments_bounds[-1, 1] = max_mz_value

    logger.debug(f'Defined {len(ds_segments_bounds)} segments')
    return ds_segments_bounds


def segment_spectra_chunk(chunk_i, sp_mz_int_buf, ds_segments_bounds, ds_segments_path):
    def _segment(args):
        segm_i, (lo_idx, hi_idx) = args
        segm_start, segm_end = np.searchsorted(sp_mz_int_buf.mz.values, (lo_idx, hi_idx))
        segm = sp_mz_int_buf.iloc[segm_start:segm_end]
        serialize_to_file(segm, ds_segments_path / f'ds_segm_{segm_i:04}_{chunk_i:04}')
        return segm_i, len(segm)

    with ThreadPoolExecutor(4) as pool:
        return list(pool.map(_segment, enumerate(ds_segments_bounds)))


def parse_and_segment_chunk(args):
    (
        storage_config,
        imzml_reader,
        ibd_cobject,
        chunk_i,
        start,
        end,
        ds_segments_bounds,
        ds_segments_path,
    ) = args
    storage = Storage(storage_config=storage_config)
    sp_mz_int_buf = parse_dataset_chunk(storage, imzml_reader, ibd_cobject, start, end)
    segm_sizes = segment_spectra_chunk(chunk_i, sp_mz_int_buf, ds_segments_bounds, ds_segments_path)
    return segm_sizes


def upload_segments(storage, ds_segments_path, chunks_n, segments_n):
    def _upload(segm_i):
        segm = pd.concat(
            [
                deserialize_from_file(ds_segments_path / f'ds_segm_{segm_i:04}_{chunk_i:04}')
                for chunk_i in range(chunks_n)
            ],
            ignore_index=True,
            sort=False,
        )
        segm.sort_values('mz', inplace=True)
        segm.reset_index(drop=True, inplace=True)
        cobj = save_cobj(storage, segm)

        if logger.isEnabledFor(logging.DEBUG):
            head = storage.head_object(cobj.bucket, cobj.key)
            print(head)
            nbytes = storage.head_object(cobj.bucket, cobj.key)['content-length']
            logger.debug(f'Uploaded segment {segm_i}: {nbytes} bytes')

        return cobj

    with ThreadPoolExecutor(os.cpu_count()) as pool:
        ds_segms_cobjs = list(pool.map(_upload, range(segments_n)))

    assert len(ds_segms_cobjs) == len(
        set(co.key for co in ds_segms_cobjs)
    ), 'Duplicate CloudObjects in ds_segms_cobjs'

    return ds_segms_cobjs


def make_segments(
    storage: Storage,
    imzml_reader: PortableSpectrumReader,
    ibd_cobject: CloudObject,
    ds_segments_bounds: np.ndarray,
    segments_dir: Path,
    sort_memory: int,
):
    n_cpus = os.cpu_count() or 1
    ds_size = sum(imzml_reader.mzLengths) * (np.dtype(imzml_reader.mzPrecision).itemsize + 4 + 4)
    # TODO: Tune chunk_size to ensure no OOMs are caused
    chunk_size_to_fit_in_memory = sort_memory // 4 // n_cpus
    chunk_size_to_use_all_cpus = ds_size * 1.1 // n_cpus
    chunk_size = min(chunk_size_to_fit_in_memory, chunk_size_to_use_all_cpus)
    chunk_ranges = plan_dataset_chunks(imzml_reader, max_size=chunk_size)
    chunks_n = len(chunk_ranges)
    logger.debug(f'Reading dataset in {chunks_n} chunks: {chunk_ranges}')

    segm_sizes = []
    with ProcessPoolExecutor(n_cpus) as executor:
        chunk_tasks = [
            (
                storage.storage_config,
                imzml_reader,
                ibd_cobject,
                chunk_i,
                start,
                end,
                ds_segments_bounds,
                segments_dir,
            )
            for chunk_i, (start, end) in enumerate(chunk_ranges)
        ]
        for chunk_segm_sizes in executor.map(parse_and_segment_chunk, chunk_tasks):
            segm_sizes.extend(chunk_segm_sizes)

    ds_segm_lens = (
        pd.DataFrame(segm_sizes, columns=['segm_i', 'segm_size'])
        .groupby('segm_i')
        .segm_size.sum()
        .sort_index()
        .values
    )

    return chunks_n, ds_segm_lens


def _load_ds(
    imzml_cobject: CloudObject,
    ibd_cobject: CloudObject,
    ds_segm_size_mb: int,
    sort_memory: int,
    *,
    storage: Storage,
    perf: SubtaskProfiler,
) -> Tuple[
    PortableSpectrumReader, np.ndarray, List[CObj[pd.DataFrame]], np.ndarray,
]:
    with TemporaryDirectory() as tmp_dir:
        logger.info("Temp dir is {}".format(tmp_dir))
        imzml_dir = Path(tmp_dir) / 'imzml'
        imzml_dir.mkdir()
        logger.info(f"Create {imzml_dir}")
        segments_dir = Path(tmp_dir) / 'segments'
        segments_dir.mkdir()
        logger.info(f"Create {segments_dir}")
        logger.info('Loading .imzML file...')
        imzml_reader = load_portable_spectrum_reader(storage, imzml_cobject)
        perf.record_entry('loaded imzml')

        logger.info('Defining segments bounds...')
        ds_segments_bounds = define_ds_segments(
            storage, imzml_reader, ibd_cobject, ds_segm_size_mb=ds_segm_size_mb
        )
        segments_n = len(ds_segments_bounds)
        perf.record_entry('defined segments', segments_n=segments_n)

        logger.info('Segmenting...')
        chunks_n, ds_segm_lens = make_segments(
            storage, imzml_reader, ibd_cobject, ds_segments_bounds, segments_dir, sort_memory
        )
        perf.record_entry('made segments')

        logger.info('Uploading segments...')
        ds_segms_cobjs = upload_segments(storage, segments_dir, chunks_n, segments_n)
        perf.record_entry('uploaded segments')

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

    if ibd_size_mb < 1536:
        logger.debug(f'Found {ibd_size_mb}MB .ibd file. Trying serverless load_ds')
        runtime_memory = 4096
        sort_memory = 3.5 * (2 ** 30)
    else:
        logger.debug(f'Found {ibd_size_mb}MB .ibd file. Using VM-based load_ds')
        runtime_memory = 32768
        sort_memory = 30 * (2 ** 30)

    imzml_reader, ds_segments_bounds, ds_segms_cobjs, ds_segm_lens = executor.call(
        _load_ds,
        (imzml_cobject, ibd_cobject, ds_segm_size_mb, sort_memory),
        runtime_memory=runtime_memory,
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
