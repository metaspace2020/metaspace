"""Range-read access to the imzML browser arrays.

``mzs.npy``, ``ints.npy`` and ``sp_idxs.npy`` are raw float32 arrays globally sorted by m/z;
``mz_index.npy`` holds every ``INDEX_STEP``-th m/z (see ``load_ds._upload_imzml_browser_files``).
"""
from concurrent.futures import ThreadPoolExecutor
from typing import Iterator, Optional, Tuple

import numpy as np

from sm.engine.utils.byte_ranges import coalesce_ranges

RECORD_BYTES = 4
INDEX_STEP = 1024
COALESCE_GAP_BYTES = 64 * 1024
DEFAULT_WORKERS = 4
# Bytes per array per request when streaming the whole file or dense window sets.
STREAM_CHUNK_BYTES = 32 * 1024 * 1024
ARRAY_NAMES = ('mzs', 'ints', 'sp_idxs')

Chunk = Tuple[np.ndarray, np.ndarray, np.ndarray]
Window = Tuple[int, np.ndarray, np.ndarray, np.ndarray]


class BrowserArrays:
    def __init__(self, s3_client, bucket: str, uuid: str):
        self._s3 = s3_client
        self.bucket = bucket
        self.uuid = uuid
        self._n_records = None
        self._mz_index = None

    def _key(self, name: str) -> str:
        return f'{self.uuid}/{name}.npy'

    def peak_count(self) -> int:
        if self._n_records is None:
            head = self._s3.head_object(Bucket=self.bucket, Key=self._key('mzs'))
            self._n_records = int(head['ContentLength']) // RECORD_BYTES
        return self._n_records

    def mz_index(self) -> np.ndarray:
        if self._mz_index is None:
            body = self._s3.get_object(Bucket=self.bucket, Key=self._key('mz_index'))['Body']
            self._mz_index = np.frombuffer(body.read(), dtype='f')
        return self._mz_index

    def _read_records(self, name: str, start: int, end: int) -> np.ndarray:
        if end <= start:
            return np.empty(0, dtype='f')
        byte_range = f'bytes={start * RECORD_BYTES}-{end * RECORD_BYTES - 1}'
        body = self._s3.get_object(Bucket=self.bucket, Key=self._key(name), Range=byte_range)
        return np.frombuffer(body['Body'].read(), dtype='f')

    def read_range(self, start: int, end: int) -> Chunk:
        mzs, ints, sp_idxs = (self._read_records(name, start, end) for name in ARRAY_NAMES)
        return mzs, ints, sp_idxs

    def iter_chunks(self, chunk_bytes: int) -> Iterator[Chunk]:
        step = max(1, int(chunk_bytes) // RECORD_BYTES)
        n_records = self.peak_count()
        for start in range(0, n_records, step):
            yield self.read_range(start, min(start + step, n_records))

    def window_record_bounds(self, mz_lo, mz_hi) -> Tuple[np.ndarray, np.ndarray]:
        """Record ranges ``[start, end)`` containing every record with ``mz_lo <= mz <= mz_hi``.

        The last index entry strictly below ``mz_lo`` and the first strictly above ``mz_hi``
        bound the range, so a ``searchsorted`` inside it equals the full-array result even
        when the bounds coincide with duplicated m/z values.
        """
        index = self.mz_index()
        n_records = self.peak_count()
        starts = (np.searchsorted(index, mz_lo, side='left') - 1).clip(0) * INDEX_STEP
        ends = np.minimum(np.searchsorted(index, mz_hi, side='right') * INDEX_STEP, n_records)
        return starts.astype(np.int64), ends.astype(np.int64)

    def iter_mz_windows(
        self,
        mz_lo,
        mz_hi,
        chunk_bytes: int,
        workers: int = DEFAULT_WORKERS,
        executor: Optional[ThreadPoolExecutor] = None,
    ) -> Iterator[Window]:
        """Yield ``(window_index, mzs, ints, sp_idxs)`` for each ``[mz_lo[i], mz_hi[i]]``.

        Each slice equals ``full[searchsorted(full, lo, 'left'):searchsorted(full, hi, 'right')]``.
        Near windows share one request of at most ``chunk_bytes`` per array (a single wider
        window is read whole); ``workers`` requests are in flight at a time.
        """
        mz_lo = np.asarray(mz_lo, dtype=np.float64)
        mz_hi = np.asarray(mz_hi, dtype=np.float64)
        starts, ends = self.window_record_bounds(mz_lo, mz_hi)

        for i in np.where(ends <= starts)[0]:
            yield int(i), np.empty(0, 'f'), np.empty(0, 'f'), np.empty(0, 'f')

        max_bytes = max(INDEX_STEP, int(chunk_bytes) // RECORD_BYTES) * RECORD_BYTES
        ranges = [
            (int(starts[i]) * RECORD_BYTES, int(ends[i]) * RECORD_BYTES, int(i))
            for i in np.where(ends > starts)[0]
        ]
        requests = coalesce_ranges(ranges, COALESCE_GAP_BYTES, max_bytes)

        def fetch(request):
            req_start, req_end, _ = request
            return self.read_range(req_start // RECORD_BYTES, req_end // RECORD_BYTES)

        def slices(request, arrays):
            req_start, _, members = request
            mzs, ints, sp_idxs = arrays
            for start, end, i in members:
                a = (start - req_start) // RECORD_BYTES
                stop = (end - req_start) // RECORD_BYTES
                left = a + int(np.searchsorted(mzs[a:stop], mz_lo[i], side='left'))
                right = a + int(np.searchsorted(mzs[a:stop], mz_hi[i], side='right'))
                yield i, mzs[left:right], ints[left:right], sp_idxs[left:right]

        workers = max(1, int(workers))
        own_executor = executor is None
        executor = executor or ThreadPoolExecutor(workers)
        try:
            for batch_start in range(0, len(requests), workers):
                batch = requests[batch_start : batch_start + workers]
                for request, arrays in zip(batch, executor.map(fetch, batch)):
                    yield from slices(request, arrays)
        finally:
            if own_executor:
                executor.shutdown()


def browser_arrays_for_dataset(db, s3_client, sm_config, ds_id: str) -> BrowserArrays:
    res = db.select_one('SELECT input_path FROM dataset WHERE id = %s', params=(ds_id,))
    if not res:
        raise ValueError(f'Dataset {ds_id} does not exist')
    return BrowserArrays(
        s3_client, sm_config['imzml_browser_storage']['bucket'], res[0].split('/')[-1]
    )
