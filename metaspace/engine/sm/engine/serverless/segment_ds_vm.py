import os
from tempfile import TemporaryDirectory
import requests
from pyimzml.ImzMLParser import ImzMLParser
from concurrent.futures.process import ProcessPoolExecutor
from concurrent.futures.thread import ThreadPoolExecutor
from pathlib import Path
import numpy as np
from time import time
import pandas as pd

from sm.engine.serverless.utils import logger, serialise_to_file, deserialise_from_file, serialise


def download_dataset(imzml_url, ibd_url, local_path, storage):
    def _download(url, path):
        if url.startswith('cos://'):
            bucket, key = url[len('cos://') :].split('/', maxsplit=1)
            storage.get_client().download_file(bucket, key, str(path))
        else:
            with requests.get(url, stream=True) as r:
                r.raise_for_status()
                with path.open('wb') as f:
                    for chunk in r.iter_content():
                        f.write(chunk)

    Path(local_path).mkdir(exist_ok=True)
    imzml_path = local_path / 'ds.imzML'
    ibd_path = local_path / 'ds.ibd'

    # with ThreadPoolExecutor() as ex:
    #     ex.map(_download, [imzml_url, ibd_url], [imzml_path, ibd_path])
    logger.info("Download dataset {} - {} ".format(imzml_url, imzml_path))
    _download(imzml_url, imzml_path)
    logger.info("Download dataset {} - {} ".format(ibd_url, ibd_path))
    _download(ibd_url, ibd_path)

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
        segm = serialise(segm)
        logger.debug(f'Uploading segment {segm_i}: {segm.getbuffer().nbytes} bytes')
        return storage.put_cobject(segm)

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


def load_and_split_ds_vm(storage, ds_config, ds_segm_size_mb, sort_memory):
    stats = []

    with TemporaryDirectory() as tmp_dir:
        logger.info("Temp dir is {}".format(tmp_dir))
        imzml_dir = Path(tmp_dir) / 'imzml'
        res = imzml_dir.mkdir()
        logger.info("Create {} result {}".format(imzml_dir, res))
        segments_dir = Path(tmp_dir) / 'segments'
        res = segments_dir.mkdir()
        logger.info("Create {} result {}".format(segments_dir, res))

        logger.info('Downloading dataset...')
        t = time()
        imzml_path, ibd_path = download_dataset(
            ds_config['imzml_path'], ds_config['ibd_path'], imzml_dir, storage
        )
        stats.append(('download_dataset', time() - t))

        logger.info('Loading parser...')
        t = time()
        imzml_parser = ImzMLParser(str(imzml_path))
        imzml_reader = imzml_parser.portable_spectrum_reader()
        stats.append(('load_parser', time() - t))

        logger.info('Defining segments bounds...')
        t = time()
        ds_segments_bounds = define_ds_segments(imzml_parser, ds_segm_size_mb=ds_segm_size_mb)
        segments_n = len(ds_segments_bounds)
        stats.append(('define_segments', time() - t))

        logger.info('Segmenting...')
        t = time()
        chunks_n, ds_segms_len = make_segments(
            imzml_reader, ibd_path, ds_segments_bounds, segments_dir, sort_memory
        )
        stats.append(('dataset_segmentation', time() - t))

        logger.info('Uploading segments...')
        t = time()
        ds_segms_cobjects = upload_segments(storage, segments_dir, chunks_n, segments_n)
        stats.append(('upload_segments', time() - t))

        return imzml_reader, ds_segments_bounds, ds_segms_cobjects, ds_segms_len, stats
