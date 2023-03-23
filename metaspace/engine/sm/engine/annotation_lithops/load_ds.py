from __future__ import annotations

import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Dict, List, Tuple, Union

import numpy as np
import pandas as pd
from ibm_boto3.s3.transfer import TransferConfig, MB
from lithops.storage import Storage
from lithops.storage.utils import CloudObject

from sm.engine.annotation.imzml_reader import LithopsImzMLReader
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import CObj, load_cobj, save_cobj
from sm.engine.config import SMConfig
from sm.engine.storage import get_s3_client
from sm.engine.utils.perf_profile import SubtaskProfiler

logger = logging.getLogger('annotation-pipeline')


def _print_times(start, name):
    end = datetime.now().replace(microsecond=0)
    print(f'{end.isoformat(" ")} - {name} - {(end - start).total_seconds()} sec')


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

    start = datetime.now().replace(microsecond=0)
    with ThreadPoolExecutor(4) as executor:
        for _ in executor.map(read_spectrum_chunk, spectrum_chunks):
            pass

    _print_times(start, '_load_spectra')
    return np.concatenate(mz_arrays), np.concatenate(int_arrays), sp_lens


def _sort_spectra(imzml_reader, mzs, ints, sp_lens):
    # Mergesort is used for 2 reasons:
    # * It's much faster than the default quicksort, because m/z data is already partially sorted
    #   and the underlying "Timsort" implementation is optimized for partially-sorted data.
    # * It's a "stable sort", meaning it will preserve the ordering by spectrum index if mz values
    #   are equal. The order of pixels affects some metrics, so this stability is important.
    start_t = datetime.now().replace(microsecond=0)
    by_mz = np.argsort(mzs, kind='mergesort')
    _print_times(start_t, 'by_mz')

    # The existing `mzs` and `ints` arrays can't be garbage-collected because the calling function
    # holds references to them. Overwrite the original arrays with the temp sorted arrays so that
    # the temp arrays can be freed instead.
    start_t = datetime.now().replace(microsecond=0)
    mzs[:] = mzs[by_mz]
    _print_times(start_t, 'sort mzs')

    start_t = datetime.now().replace(microsecond=0)
    ints[:] = ints[by_mz]
    _print_times(start_t, 'sort ints')

    # Build sp_idxs after sorting mzs. Sorting mzs uses the most memory, so it's best to keep
    # sp_idxs in a compacted form with sp_lens until the last minute.
    start_t = datetime.now().replace(microsecond=0)
    sp_idxs = np.empty(len(ints), np.uint32)
    sp_lens = np.insert(np.cumsum(sp_lens), 0, 0)
    for sp_idx, start, end in zip(imzml_reader.pixel_indexes, sp_lens[:-1], sp_lens[1:]):
        sp_idxs[start:end] = sp_idx
    sp_idxs = sp_idxs[by_mz]
    _print_times(start_t, 'sort sp_idxs')

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

    start_t = datetime.now().replace(microsecond=0)
    with ThreadPoolExecutor(4) as executor:
        ds_segms_cobjs = list(executor.map(upload_segm, segm_ranges))
    _print_times(start_t, 'upload_segm')

    return ds_segms_cobjs, ds_segments_bounds, ds_segm_lens


def _upload_imzml_browser_files_to_cos(storage, imzml_cobject, imzml_reader, mzs, ints, sp_idxs):
    """Save imzml browser files on COS"""

    def upload_file(data, key):
        return storage.put_cloudobject(data.astype('f').tobytes(), key=key)

    prefix = f'imzml_browser/{imzml_cobject.key.split("/")[1]}'
    keys = [f'{prefix}/{var}.npy' for var in ['mzs', 'ints', 'sp_idxs']]
    start_t = datetime.now().replace(microsecond=0)
    with ThreadPoolExecutor(3) as executor:
        cobjs = list(executor.map(upload_file, [mzs, ints, sp_idxs], keys))
    _print_times(start_t, 'upload_imzml_files')

    chunk_records_number = 1024
    data = mzs[::chunk_records_number].astype('f')
    cobjs.append(storage.put_cloudobject(data.tobytes(), key=f'{prefix}/mz_index.npy'))

    data = imzml_reader.imzml_reader
    cobjs.append(save_cobj(storage, data, key=f'{prefix}/portable_spectrum_reader.pickle'))

    return cobjs


def _get_hash(
    storage: Storage, imzml_cobject: CloudObject, ibd_cobject: CloudObject
) -> Dict[str, str]:
    """Calculate md5 hash of imzML/ibd files"""

    def calc_hash(file_object: CloudObject, chunk_size: int = 8 * 1024 * 1024) -> str:
        md5_hash = hashlib.md5()
        chunk = file_object.read(chunk_size)
        while chunk:
            md5_hash.update(chunk)
            chunk = file_object.read(chunk_size)

        return md5_hash.hexdigest()

    start_t = datetime.now().replace(microsecond=0)
    hash_sum = {
        'imzml': calc_hash(storage.get_cloudobject(imzml_cobject, stream=True)),
        'ibd': calc_hash(storage.get_cloudobject(ibd_cobject, stream=True)),
    }
    _print_times(start_t, 'calc_hash')

    return hash_sum


def _load_ds(
    imzml_cobject: CloudObject,
    ibd_cobject: CloudObject,
    ds_segm_size_mb: int,
    *,
    storage: Storage,
    perf: SubtaskProfiler,
) -> Tuple[LithopsImzMLReader, np.ndarray, List[CObj[pd.DataFrame]], np.ndarray, List[CObj]]:
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

    logger.info('Uploading related to imzml browser files')
    imzml_browser_cobjs = _upload_imzml_browser_files_to_cos(
        storage, imzml_cobject, imzml_reader, mzs, ints, sp_idxs
    )
    perf.record_entry('uploaded imzml browser files')

    logger.info('Calculating md5 hash of imzML/ibd files')
    md5_hash = _get_hash(storage, imzml_cobject, ibd_cobject)
    perf.record_entry('calculate hash')

    return (
        imzml_reader,
        ds_segments_bounds,
        ds_segms_cobjs,
        ds_segm_lens,
        imzml_browser_cobjs,
        md5_hash,
    )


def _upload_imzml_browser_files(storage: Storage, imzml_browser_cobjs: List[CObj]):
    """Move files from COS to S3"""
    conf = SMConfig.get_conf()
    s3_client = get_s3_client(sm_config=conf)
    transfer_config = TransferConfig(
        multipart_chunksize=20 * MB, max_concurrency=10, io_chunksize=1 * MB
    )

    def upload_file(cobj):
        logger.info(f'Uploading {cobj.key}')
        file_object = storage.get_cloudobject(cobj, stream=True)
        s3_client.upload_fileobj(
            Bucket=conf['imzml_browser_storage']['bucket'],
            Key=cobj.key.split('/', 1)[-1],
            Fileobj=file_object,
            Config=transfer_config,
        )

    with ThreadPoolExecutor(3) as executor:
        for _ in executor.map(upload_file, imzml_browser_cobjs):
            pass


def _get_size_hash(imzml_head, ibd_head, md5_hash, ds_id):
    """Save hash and size only for ServerAnnotationJob (ds_id is not None)"""
    size_hash = {}
    if ds_id:
        size_hash = {
            'imzml_hash': md5_hash['imzml'],
            'ibd_hash': md5_hash['ibd'],
            'imzml_size': int(imzml_head['content-length']),
            'ibd_size': int(ibd_head['content-length']),
        }

    return size_hash


def load_ds(
    executor: Executor,
    imzml_cobject: CloudObject,
    ibd_cobject: CloudObject,
    ds_segm_size_mb: int,
    ds_id: Union[str, None],
) -> Tuple[LithopsImzMLReader, np.ndarray, List[CObj[pd.DataFrame]], np.ndarray,]:
    try:
        imzml_head = executor.storage.head_object(imzml_cobject.bucket, imzml_cobject.key)
        ibd_head = executor.storage.head_object(ibd_cobject.bucket, ibd_cobject.key)
        imzml_size_mb = int(imzml_head['content-length']) / 1024 // 1024
        ibd_size_mb = int(ibd_head['content-length']) / 1024 // 1024
    except Exception:
        logger.warning("Couldn't read ibd or imzml size", exc_info=True)
        ibd_size_mb = 1024

    # Guess the amount of memory needed. For the majority of datasets (no zero-intensity peaks,
    # separate m/z arrays per spectrum) approximately 3x the ibd file size is used during the
    # most memory-intense part (sorting the m/z array). Also for uploading imzml browser files
    # need plus 1x the ibd file size RAM.
    message = f'Found {ibd_size_mb}MB .ibd and {imzml_size_mb}MB .imzML files.'
    if ibd_size_mb * 4 + 512 < 32 * 1024:
        logger.info(f'{message} Trying serverless load_ds')
        runtime_memory = max(2048, int(2 ** np.ceil(np.log2(ibd_size_mb * 3 + 512))))
    else:
        logger.info(f'{message} Using VM-based load_ds')
        runtime_memory = 128 * 1024

    (
        imzml_reader,
        ds_segments_bounds,
        ds_segms_cobjs,
        ds_segm_lens,
        imzml_browser_cobjs,
        md5_hash,
    ) = executor.call(
        _load_ds,
        (imzml_cobject, ibd_cobject, ds_segm_size_mb),
        runtime_memory=runtime_memory,
    )
    logger.info(f'Segmented dataset chunks into {len(ds_segms_cobjs)} segments')

    _upload_imzml_browser_files(executor.storage, imzml_browser_cobjs)
    logger.info('Moved imzml browser files to S3')

    size_hash = _get_size_hash(imzml_head, ibd_head, md5_hash, ds_id)

    return imzml_reader, ds_segments_bounds, ds_segms_cobjs, ds_segm_lens, size_hash


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
