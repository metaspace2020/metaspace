from __future__ import annotations

import logging
import os
import shutil
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Tuple, List

import numpy as np
import pandas as pd
from lithops.storage import Storage
from lithops.storage.utils import CloudObject
from pyimzml.ImzMLParser import ImzMLParser, PortableSpectrumReader

from sm.engine.annotation_lithops.annotate import read_ds_segment
from sm.engine.annotation_lithops.io import (
    serialise_to_file,
    deserialise_from_file,
    save_cobj,
    CObj,
)
from sm.engine.annotation_lithops.utils import logger
from sm.engine.utils.perf_profile import SubtaskPerf


def download_dataset(imzml_cobject, ibd_cobject, local_path, storage):
    # Decide destination paths
    Path(local_path).mkdir(exist_ok=True)
    imzml_path = local_path / 'ds.imzML'
    ibd_path = local_path / 'ds.ibd'

    # Download both files
    def _download(cobj, path):
        with path.open('wb') as f:
            shutil.copyfileobj(storage.get_cobject(cobj, stream=True), f)

    logger.info("Download dataset {} - {} ".format(imzml_cobject.key, imzml_path))
    _download(imzml_cobject, imzml_path)
    logger.info("Download dataset {} - {} ".format(ibd_cobject.key, ibd_path))
    _download(ibd_cobject, ibd_path)

    # Log stats
    imzml_size = imzml_path.stat().st_size / (1024 ** 2)
    ibd_size = ibd_path.stat().st_size / (1024 ** 2)
    logger.debug(f'imzML size: {imzml_size:.2f} mb')
    logger.debug(f'ibd size: {ibd_size:.2f} mb')

    return imzml_path, ibd_path


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


def parse_dataset_chunk(imzml_reader, ibd_path, start, end):
    def get_pixel_indices(coordinates):
        _coord = np.array(coordinates, dtype=np.uint32)
        _coord -= np.min(_coord, axis=0)
        xs, ys = _coord[:, 0], _coord[:, 1]
        return ys * (np.max(xs) + 1) + xs

    sp_id_to_idx = get_pixel_indices(imzml_reader.coordinates)
    sp_inds_list, mzs_list, ints_list = [], [], []

    with open(ibd_path, 'rb') as ibd_file:
        for curr_sp_i in range(start, end):
            mzs_, ints_ = imzml_reader.read_spectrum_from_file(ibd_file, curr_sp_i)
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


def define_ds_segments(imzml_parser, ds_segm_size_mb=5, sample_sp_n=1000):
    sp_n = len(imzml_parser.coordinates)
    sample_ratio = sample_sp_n / sp_n

    def spectra_sample_gen(imzml_parser, sample_ratio):
        sample_size = int(sp_n * sample_ratio)
        sample_sp_inds = np.random.choice(np.arange(sp_n), sample_size)
        for sp_idx in sample_sp_inds:
            mzs, ints = imzml_parser.getspectrum(sp_idx)
            yield sp_idx, mzs, ints

    spectra_sample = list(spectra_sample_gen(imzml_parser, sample_ratio=sample_ratio))

    spectra_mzs = np.array([mz for sp_id, mzs, ints in spectra_sample for mz in mzs])
    total_n_mz = spectra_mzs.shape[0] / sample_ratio

    row_size = (4 if imzml_parser.mzPrecision == 'f' else 8) + 4 + 4
    segm_n = int(np.ceil(total_n_mz * row_size / (ds_segm_size_mb * 2 ** 20)))

    segm_bounds_q = [i * 1 / segm_n for i in range(0, segm_n + 1)]
    segm_lower_bounds = [np.quantile(spectra_mzs, q) for q in segm_bounds_q]
    ds_segments_bounds = np.array(list(zip(segm_lower_bounds[:-1], segm_lower_bounds[1:])))

    max_mz_value = 10 ** 5
    ds_segments_bounds[0, 0] = 0
    ds_segments_bounds[-1, 1] = max_mz_value

    logger.debug(f'Defined {len(ds_segments_bounds)} segments')
    return ds_segments_bounds


def segment_spectra_chunk(chunk_i, sp_mz_int_buf, ds_segments_bounds, ds_segments_path):
    def _segment(args):
        segm_i, (l, r) = args
        segm_start, segm_end = np.searchsorted(sp_mz_int_buf.mz.values, (l, r))
        segm = sp_mz_int_buf.iloc[segm_start:segm_end]
        serialise_to_file(segm, ds_segments_path / f'ds_segm_{segm_i:04}_{chunk_i:04}')
        return segm_i, len(segm)

    with ThreadPoolExecutor(4) as pool:
        return list(pool.map(_segment, enumerate(ds_segments_bounds)))


def parse_and_segment_chunk(args):
    imzml_reader, ibd_path, chunk_i, start, end, ds_segments_bounds, ds_segments_path = args
    sp_mz_int_buf = parse_dataset_chunk(imzml_reader, ibd_path, start, end)
    segm_sizes = segment_spectra_chunk(chunk_i, sp_mz_int_buf, ds_segments_bounds, ds_segments_path)
    return segm_sizes


def upload_segments(storage, ds_segments_path, chunks_n, segments_n):
    def _upload(segm_i):
        segm = pd.concat(
            [
                deserialise_from_file(ds_segments_path / f'ds_segm_{segm_i:04}_{chunk_i:04}')
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
        ds_segms_cobjects = list(pool.map(_upload, range(segments_n)))

    assert len(ds_segms_cobjects) == len(
        set(co.key for co in ds_segms_cobjects)
    ), 'Duplicate CloudObjects in ds_segms_cobjects'

    return ds_segms_cobjects


def make_segments(imzml_reader, ibd_path, ds_segments_bounds, segments_dir, sort_memory):
    n_cpus = os.cpu_count()
    ds_size = sum(imzml_reader.mzLengths) * (np.dtype(imzml_reader.mzPrecision).itemsize + 4 + 4)
    # TODO: Tune chunk_size to ensure no OOMs are caused
    chunk_size_to_fit_in_memory = sort_memory // 2 // n_cpus
    chunk_size_to_use_all_cpus = ds_size * 1.1 // n_cpus
    chunk_size = min(chunk_size_to_fit_in_memory, chunk_size_to_use_all_cpus)
    chunk_ranges = plan_dataset_chunks(imzml_reader, max_size=chunk_size)
    chunks_n = len(chunk_ranges)
    logger.debug(f'Reading dataset in {chunks_n} chunks: {chunk_ranges}')

    segm_sizes = []
    with ProcessPoolExecutor(n_cpus) as ex:
        chunk_tasks = [
            (imzml_reader, ibd_path, chunk_i, start, end, ds_segments_bounds, segments_dir)
            for chunk_i, (start, end) in enumerate(chunk_ranges)
        ]
        for chunk_segm_sizes in ex.map(parse_and_segment_chunk, chunk_tasks):
            segm_sizes.extend(chunk_segm_sizes)

    ds_segms_len = (
        pd.DataFrame(segm_sizes, columns=['segm_i', 'segm_size'])
        .groupby('segm_i')
        .segm_size.sum()
        .sort_index()
        .values
    )

    return chunks_n, ds_segms_len


def load_ds(
    storage: Storage,
    imzml_cobject: CloudObject,
    ibd_cobject: CloudObject,
    ds_segm_size_mb: int,
    sort_memory: int,
    *,
    perf: SubtaskPerf,
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

        logger.info('Downloading dataset...')
        imzml_path, ibd_path = download_dataset(imzml_cobject, ibd_cobject, imzml_dir, storage)
        perf.mark('downloaded dataset')

        logger.info('Loading parser...')
        imzml_parser = ImzMLParser(str(imzml_path))
        imzml_reader = imzml_parser.portable_spectrum_reader()
        perf.mark('loaded parser')

        logger.info('Defining segments bounds...')
        ds_segments_bounds = define_ds_segments(imzml_parser, ds_segm_size_mb=ds_segm_size_mb)
        segments_n = len(ds_segments_bounds)
        perf.mark('defined segments', segments_n=segments_n)

        logger.info('Segmenting...')
        chunks_n, ds_segms_len = make_segments(
            imzml_reader, ibd_path, ds_segments_bounds, segments_dir, sort_memory
        )
        perf.mark('made segments')

        logger.info('Uploading segments...')
        ds_segms_cobjects = upload_segments(storage, segments_dir, chunks_n, segments_n)
        perf.mark('uploaded segments')

        return imzml_reader, ds_segments_bounds, ds_segms_cobjects, ds_segms_len


def validate_ds_segments(fexec, imzml_reader, ds_segments_bounds, ds_segms_cobjects, ds_segms_len):
    def get_segm_stats(cobject, storage):
        segm = read_ds_segment(cobject, storage)
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

    results = fexec.map(get_segm_stats, ds_segms_cobjects)

    segms_df = pd.DataFrame(results)
    segms_df['min_bound'] = np.concatenate([[0], ds_segments_bounds[1:, 0]])
    segms_df['max_bound'] = np.concatenate([ds_segments_bounds[:-1, 1], [100000]])
    segms_df['expected_len'] = ds_segms_len

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
            logger.warning('segment_spectra lengths don\'t match ds_segms_len:')
            logger.warning(bad_len)

        unsorted = segms_df[~segms_df.is_sorted]
        if not unsorted.empty:
            logger.warning('segment_spectra produced unsorted segments:')
            logger.warning(unsorted)

        total_len = segms_df.n_rows.sum()
        expected_total_len = np.sum(imzml_reader.mzLengths)
        if total_len != expected_total_len:
            logger.warning(
                f'segment_spectra output {total_len} peaks, but the imzml file contained {expected_total_len}'
            )
