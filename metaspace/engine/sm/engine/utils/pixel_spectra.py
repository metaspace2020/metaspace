"""Read a set of pixels' spectra straight from the uploaded ``.ibd``.

The ``.ibd`` is pixel-ordered and ``portable_spectrum_reader.pickle`` holds every spectrum's
byte offsets, so a region costs a few coalesced range requests proportional to its size.
The output matches what slicing the m/z-sorted browser arrays would give: zero-intensity
peaks are dropped as at ingestion (``ImzMLReader._process_spectrum``) and
``sort_like_browser`` applies the same stable sort and float32 cast as ``load_ds``.
"""
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Tuple

import numpy as np

from sm.engine.utils.byte_ranges import coalesce_ranges

COALESCE_GAP_BYTES = 64 * 1024
MAX_REQUEST_BYTES = 32 * 1024 * 1024
MZ = 0
INT = 1


def pixel_indexes_from_reader(reader) -> np.ndarray:
    """Spectrum index -> flat pixel index, the same ``y * w + x`` as ``ImzMLReader``."""
    coords = np.array(reader.coordinates)[:, :2]
    coords = coords - np.min(coords, axis=0)
    width = int(np.max(coords[:, 0])) + 1
    return (coords[:, 1] * width + coords[:, 0]).astype(np.int64)


def region_peak_count(reader, pixel_mask: np.ndarray) -> int:
    """Stored peak count over the pixels in ``pixel_mask`` (zero-intensity peaks included)."""
    pix = pixel_indexes_from_reader(reader)
    lengths = np.asarray(reader.mzLengths, dtype=np.int64)
    valid = pix < len(pixel_mask)
    inside = np.zeros(len(pix), dtype=bool)
    inside[valid] = np.asarray(pixel_mask, dtype=bool)[pix[valid]]
    return int(lengths[inside].sum())


def read_pixel_spectra(  # pylint: disable=too-many-locals, too-many-arguments
    s3_client,
    bucket: str,
    ibd_key: str,
    reader,
    spectrum_indices,
    max_request_bytes: int = MAX_REQUEST_BYTES,
    workers: int = 4,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """``(mzs, ints, pix)`` of the given spectra, concatenated in ascending spectrum order.

    m/z keeps the stored precision, intensities are float32, ``pix`` is the int32 flat
    pixel index. Zero-intensity peaks are removed per spectrum.
    """
    spectrum_indices = np.unique(np.asarray(spectrum_indices, dtype=np.int64))
    mz_dtype = np.dtype(reader.mzPrecision)
    int_dtype = np.dtype(reader.intensityPrecision)
    pixel_indexes = pixel_indexes_from_reader(reader)

    ranges = []
    for pos, sp_idx in enumerate(spectrum_indices):
        mz_start = int(reader.mzOffsets[sp_idx])
        int_start = int(reader.intensityOffsets[sp_idx])
        ranges.append(
            (mz_start, mz_start + int(reader.mzLengths[sp_idx]) * mz_dtype.itemsize, (pos, MZ))
        )
        ranges.append(
            (
                int_start,
                int_start + int(reader.intensityLengths[sp_idx]) * int_dtype.itemsize,
                (pos, INT),
            )
        )
    requests = coalesce_ranges(ranges, COALESCE_GAP_BYTES, max_request_bytes)

    def fetch(request):
        req_start, req_end, members = request
        body = s3_client.get_object(
            Bucket=bucket, Key=ibd_key, Range=f'bytes={req_start}-{req_end - 1}'
        )['Body'].read()
        if len(body) != req_end - req_start:
            raise ValueError(f'Incomplete .ibd read: {len(body)} of {req_end - req_start} bytes')
        pieces = {}
        for start, end, (pos, kind) in members:
            dtype = mz_dtype if kind == MZ else int_dtype
            # copy so the request buffer is freed as soon as fetch returns
            pieces[(pos, kind)] = np.frombuffer(
                body[start - req_start : end - req_start], dtype=dtype
            ).copy()
        return pieces

    parts: Dict[Tuple[int, int], np.ndarray] = {}
    with ThreadPoolExecutor(max(1, workers)) as executor:
        for pieces in executor.map(fetch, requests):
            parts.update(pieces)

    mz_out, int_out, pix_out = [], [], []
    for pos, sp_idx in enumerate(spectrum_indices):
        mzs, ints = parts[(pos, MZ)], parts[(pos, INT)]
        if len(mzs) != len(ints):
            raise ValueError(
                f'Spectrum {sp_idx}: {len(mzs)} m/z values but {len(ints)} intensities'
            )
        nonzero = ints > 0
        if not np.all(nonzero):
            mzs, ints = mzs[nonzero], ints[nonzero]
        mz_out.append(mzs)
        int_out.append(ints.astype(np.float32, copy=False))
        pix_out.append(np.full(len(mzs), pixel_indexes[sp_idx], dtype=np.int32))

    if not mz_out:
        return np.empty(0, mz_dtype), np.empty(0, np.float32), np.empty(0, np.int32)
    return np.concatenate(mz_out), np.concatenate(int_out), np.concatenate(pix_out)


def sort_like_browser(mzs, ints, pix) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Stable m/z sort in the stored precision, then the float32 cast the browser files carry."""
    order = np.argsort(mzs, kind='mergesort')
    return (
        np.asarray(mzs)[order].astype(np.float32),
        np.asarray(ints)[order].astype(np.float32),
        np.asarray(pix)[order].astype(np.int32),
    )
