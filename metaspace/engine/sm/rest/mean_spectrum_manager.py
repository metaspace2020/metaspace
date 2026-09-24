"""Mean/sum spectrum over a region, for the imzML browser's "Mean spectrum" tab.

Read-only QC visualization: pooled peaks from the selected pixels are clustered onto a
reference m/z axis and aggregated. Nothing here is persisted to the dataset and nothing
feeds annotation.

Processed-mode imzML has no shared m/z axis, so the axis is built from the region's own
peaks using MALDIquant's ``binPeaks(method="strict")`` rule (Gibb & Strimmer), with the
engine's instrument-aware ``mass_accuracy_half_width`` in place of a flat ppm constant.
Continuous-mode datasets go through the same path -- repeated identical m/z values
collapse into one cluster under the strict rule, so no separate code path is needed.

No recalibration, no drift correction, no SNR peak picking: peaks are clustered for
display only.
"""

import hashlib
import json
import logging
import threading
import time
from collections import OrderedDict
from typing import NamedTuple, Optional, Tuple

import numpy as np

from sm.engine.annotation.isocalc_wrapper import mass_accuracy_half_width
from sm.engine.annotation_lithops.io import deserialize
from sm.engine.config import SMConfig
from sm.engine.db import DB
from sm.engine.image_storage import ImageStorage
from sm.engine.postprocessing.experiment_masks import rasterise_roi_mask
from sm.engine.storage import get_s3_client
from sm.engine.utils.browser_arrays import STREAM_CHUNK_BYTES, BrowserArrays
from sm.engine.utils.dataset_image_data import get_ppm, get_tic_image
from sm.engine.utils.pixel_spectra import (
    pixel_indexes_from_reader,
    read_pixel_spectra,
    region_peak_count,
    sort_like_browser,
)

logger = logging.getLogger('api')

# Peak-count caps. The region cap applies to the selected ROI's own peaks (read straight from
# the .ibd, so cost scales with the region); the whole-dataset cap applies to the streaming
# pass over the browser arrays.
MEAN_SPECTRUM_MAX_REGION_PEAKS = 30_000_000
MEAN_SPECTRUM_WHOLE_DS_MAX_PEAKS = 10_000_000

# Cap on points returned to the client. A whole-dataset axis can hold 10^5-10^6 clusters,
# which no browser chart will render usefully.
MEAN_SPECTRUM_MAX_POINTS = 20_000

# Minimum fraction of region pixels a cluster must be supported by to survive, with an
# absolute floor so that small ROIs are not over-filtered. 0.01 follows the published MSI
# application of the strict-clustering method.
MIN_SUPPORT_FRAC = 0.01
MIN_SUPPORT_PIXELS = 3

CACHE_TTL_S = 86_400
CACHE_MAX_ENTRIES = 64
# Bump to invalidate every cached result after an algorithm change.
ALGO_VERSION = 1

WHOLE_DATASET = 'whole'

_cache: 'OrderedDict[str, Tuple[float, dict]]' = OrderedDict()
_cache_lock = threading.Lock()


def _cache_get(key: str) -> Optional[dict]:
    with _cache_lock:
        entry = _cache.get(key)
        if entry is None:
            return None
        expires_at, result = entry
        if expires_at < time.monotonic():
            del _cache[key]
            return None
        _cache.move_to_end(key)
        return result


def _cache_put(key: str, result: dict):
    with _cache_lock:
        _cache[key] = (time.monotonic() + CACHE_TTL_S, result)
        _cache.move_to_end(key)
        while len(_cache) > CACHE_MAX_ENTRIES:
            _cache.popitem(last=False)


def _format_peak_count(n: int) -> str:
    """Round to a legible magnitude for user-facing messages.

    102_216_984 -> 'over 100 million'; 30_000_000 -> '30 million'; 8_432_100 -> 'over 8 million'.
    """
    if n < 1_000_000:
        return f'{n:,}'
    millions = n // 1_000_000
    if millions >= 100:
        millions = millions // 10 * 10
    label = f'{millions} million'
    return label if n == millions * 1_000_000 else f'over {label}'


def _previous_same_pixel(pix) -> np.ndarray:
    """For each position, the previous position holding the same pixel, or -1.

    A slice ``[start, end)`` contains a repeated pixel exactly when some member's previous
    occurrence is also inside it, i.e. ``prev[start:end].max() >= start``. Computed once,
    it replaces a sort per candidate cluster.
    """
    pix = np.asarray(pix)
    n = len(pix)
    order = np.lexsort((np.arange(n), pix))
    sorted_pix = pix[order]
    prev = np.full(n, -1, dtype=np.int64)
    same_as_before = sorted_pix[1:] == sorted_pix[:-1]
    prev[order[1:][same_as_before]] = order[:-1][same_as_before]
    return prev


def _cluster_bounds_strict(  # pylint: disable=too-many-locals
    mzs, pix, instrument, ppm
) -> np.ndarray:
    """Return cluster start offsets for m/z-sorted ``mzs`` under MALDIquant's strict rule.

    A cluster is accepted when its m/z span fits inside the instrument's mass-accuracy
    half-width at the cluster mean AND no pixel contributes to it twice; otherwise it is
    split at its largest internal gap and both halves are reconsidered.

    Clusters are always contiguous ranges of the sorted input, so they are returned as
    start offsets (the implicit final bound is ``len(mzs)``).
    """
    n = len(mzs)
    if n == 0:
        return np.empty(0, dtype=np.int64)

    # Vectorised pre-pass: split at every gap that provably cannot lie inside a valid
    # cluster. A valid cluster containing the gap accepts only if its span fits its
    # tolerance, and its mean is at most `right + tol(mean)` since every member lies
    # within one tolerance of the minimum. mass_accuracy_half_width is monotonically
    # increasing in m/z for all three instrument laws, so tol(mean) is bounded above by
    # the tolerance a little past `right`; a gap wider than that bound can never sit
    # inside an accepted cluster, and the recursion below would have been forced to split
    # there anyway. This makes the otherwise worst-case-quadratic largest-gap recursion
    # linear on dense, scattered input by reducing it to many small independent blocks.
    if n > 1:
        gaps = np.diff(mzs)
        right = mzs[1:]
        tol_bound = mass_accuracy_half_width(
            right + 2 * mass_accuracy_half_width(right, instrument, ppm), instrument, ppm
        )
        forced = np.flatnonzero(gaps > tol_bound) + 1
    else:
        forced = np.empty(0, dtype=np.int64)

    block_starts = np.concatenate(([0], forced))
    block_ends = np.concatenate((forced, [n]))

    prev_same = _previous_same_pixel(pix)
    starts = []
    stack = list(zip(block_starts.tolist(), block_ends.tolist()))
    while stack:
        start, end = stack.pop()
        if end - start == 1:
            starts.append(start)
            continue

        sub_mzs = mzs[start:end]
        # same arithmetic as sub_mzs.mean(): pairwise sum, one division
        mean = np.add.reduce(sub_mzs) / (end - start)
        tol = mass_accuracy_half_width(float(mean), instrument, ppm)
        within_tol = (sub_mzs[-1] - sub_mzs[0]) <= tol
        # "strict": a single pixel must not contribute two peaks to one cluster
        no_dup_pixels = prev_same[start:end].max() < start

        if within_tol and no_dup_pixels:
            starts.append(start)
            continue

        split_at = start + int(np.argmax(np.diff(sub_mzs))) + 1
        stack.append((start, split_at))
        stack.append((split_at, end))

    starts.sort()
    return np.array(starts, dtype=np.int64)


def build_reference_axis_strict(
    mzs,
    ints,
    pix,
    instrument: str,
    ppm: float,
    n_pixels: int,
    min_support_frac: float = MIN_SUPPORT_FRAC,
    min_support_pixels: int = MIN_SUPPORT_PIXELS,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Cluster pooled region peaks onto a reference axis.

    ``mzs``/``ints``/``pix`` are the region's peaks, already sorted by m/z (the imzML
    browser arrays are globally m/z-sorted, so a boolean subset preserves the order).

    Returns ``(ref_mzs, summed_ints, support)`` where ``ref_mzs`` is the
    intensity-weighted centroid of each surviving cluster, ``summed_ints`` its total
    intensity, and ``support`` the number of distinct pixels contributing to it.

    Intensities are returned summed, not averaged: mean and sum differ only by the
    ``n_pixels`` divisor, so the caller derives whichever the user asked for.
    """
    mzs = np.asarray(mzs, dtype=np.float64)
    ints = np.asarray(ints, dtype=np.float64)
    pix = np.asarray(pix)

    empty = np.array([]), np.array([]), np.array([], dtype=np.int64)
    if len(mzs) == 0:
        return empty

    starts = _cluster_bounds_strict(mzs, pix, instrument, ppm)

    # Aggregate with reduceat rather than a per-cluster Python loop -- a whole-dataset
    # axis can run to millions of clusters.
    weighted_mz = np.add.reduceat(mzs * ints, starts)
    summed_ints = np.add.reduceat(ints, starts)
    # Every non-singleton cluster satisfies the no-duplicate-pixel condition by
    # construction and singletons have one pixel, so distinct-pixel support is exactly
    # the cluster size.
    support = np.diff(np.append(starts, len(mzs)))

    with np.errstate(invalid='ignore', divide='ignore'):
        ref_mzs = np.where(summed_ints > 0, weighted_mz / summed_ints, mzs[starts])

    required_support = max(min_support_pixels, min_support_frac * n_pixels)
    keep = support >= required_support
    if not keep.any():
        return empty

    return ref_mzs[keep], summed_ints[keep], support[keep].astype(np.int64)


def select_top_peaks(ref_mzs, summed_ints, support, max_points: int = MEAN_SPECTRUM_MAX_POINTS):
    """Keep the ``max_points`` most intense peaks, returned back in m/z order."""
    if len(ref_mzs) <= max_points:
        return ref_mzs, summed_ints, support

    top_idx = np.argpartition(summed_ints, -max_points)[-max_points:]
    top_idx = top_idx[np.argsort(ref_mzs[top_idx])]
    return ref_mzs[top_idx], summed_ints[top_idx], support[top_idx]


_files_cache: 'OrderedDict[str, DatasetPeakFiles]' = OrderedDict()
FILES_CACHE_MAX_ENTRIES = 16


class DatasetPeakFiles(NamedTuple):
    """Where a dataset's peaks live: browser files by uuid, raw .ibd and its spectrum reader."""

    uuid: str
    upload_bucket: str
    ibd_key: str
    reader: object
    input_path: str  # a re-upload changes it, which invalidates the cache entry


class MeanSpectrumManager:
    """Loads region peaks for a dataset, builds the reference axis, caches the result.

    One instance serves one request; per-dataset lookups are memoised on the instance.
    """

    def __init__(self, db: Optional[DB] = None, s3_client=None, image_storage=None, sm_config=None):
        self._db = db or DB()
        self._sm_config = sm_config or SMConfig.get_conf()
        self._s3_client = s3_client or get_s3_client(sm_config=self._sm_config)
        self._image_storage = image_storage or ImageStorage()
        self._browser_bucket = self._sm_config['imzml_browser_storage']['bucket']
        self._input_paths = {}

    def _input_path(self, ds_id: str) -> str:
        if ds_id not in self._input_paths:
            res = self._db.select_one(
                'SELECT input_path FROM dataset WHERE id = %s', params=(ds_id,)
            )
            if not res:
                raise ValueError(f'Dataset {ds_id} does not exist')
            self._input_paths[ds_id] = res[0]
        return self._input_paths[ds_id]

    def _dataset_files(self, ds_id: str) -> DatasetPeakFiles:
        """Locate the .ibd and load the spectrum reader pickle; cached across requests and
        re-validated against ``input_path`` so a re-uploaded dataset is never served stale."""
        input_path = self._input_path(ds_id)
        with _cache_lock:
            cached = _files_cache.get(ds_id)
            if cached is not None and cached.input_path == input_path:
                _files_cache.move_to_end(ds_id)
                return cached

        uuid, upload_bucket = input_path.split('/')[-1], input_path.split('/')[-2]
        listing = self._s3_client.list_objects_v2(Bucket=upload_bucket, Prefix=uuid)
        ibd_keys = [
            o['Key'] for o in listing.get('Contents', []) if o['Key'].lower().endswith('.ibd')
        ]
        if not ibd_keys:
            raise ValueError(f'No .ibd file found for dataset {ds_id}')
        body = self._s3_client.get_object(
            Bucket=self._browser_bucket, Key=f'{uuid}/portable_spectrum_reader.pickle'
        )['Body'].read()
        files = DatasetPeakFiles(uuid, upload_bucket, ibd_keys[-1], deserialize(body), input_path)

        with _cache_lock:
            _files_cache[ds_id] = files
            _files_cache.move_to_end(ds_id)
            while len(_files_cache) > FILES_CACHE_MAX_ENTRIES:
                _files_cache.popitem(last=False)
        return files

    def _browser_arrays(self, ds_id: str) -> BrowserArrays:
        uuid = self._input_path(ds_id).split('/')[-1]
        return BrowserArrays(self._s3_client, self._browser_bucket, uuid)

    def _instrument(self, ds_id: str) -> str:
        res = self._db.select_one(
            "SELECT config->'isotope_generation'->>'instrument' FROM dataset WHERE id = %s",
            params=(ds_id,),
        )
        if not res:
            raise ValueError(f'Dataset {ds_id} does not exist')
        # datasets processed before the instrument field existed default to TOF (IsocalcWrapper)
        return res[0] or 'TOF'

    def peak_count(self, ds_id: str) -> int:
        """Total peaks in the dataset, from the size of mzs.npy. No download."""
        return self._browser_arrays(ds_id).peak_count()

    def _roi_ids(self, ds_id: str):
        rows = self._db.select(
            'SELECT id, name FROM public.roi WHERE dataset_id = %s ORDER BY id', params=(ds_id,)
        )
        return [(int(roi_id), name) for roi_id, name in rows]

    @staticmethod
    def _region_availability(roi_id, peaks: int, cap: int, label: str) -> dict:
        available = peaks <= cap
        return {
            'roi_id': roi_id,
            'peaks': int(peaks),
            'available': available,
            'reason': (
                None
                if available
                else (
                    f'{label} has {_format_peak_count(peaks)} peaks, above the '
                    f'{_format_peak_count(cap)} peak limit for mean spectra'
                )
            ),
        }

    def availability(self, ds_id: str) -> dict:
        """Whether the tab can be offered, and which regions (each ROI, whole dataset) can."""
        try:
            total_peaks = self.peak_count(ds_id)
            files = self._dataset_files(ds_id)
        except Exception as e:  # pylint: disable=broad-except
            logger.warning(f'Mean spectrum unavailable for {ds_id}: {e}')
            return {
                'available': False,
                'whole_dataset_available': False,
                'reason': 'imzML browser files are not available for this dataset',
                'total_peaks': 0,
                'whole': {'roi_id': None, 'peaks': 0, 'available': False, 'reason': None},
                'regions': [],
            }

        whole = self._region_availability(
            None, total_peaks, MEAN_SPECTRUM_WHOLE_DS_MAX_PEAKS, 'The whole dataset'
        )
        regions = []
        acquired_image = self._acquired_image(ds_id)
        for roi_id, _ in self._roi_ids(ds_id):
            try:
                mask = self.region_mask(ds_id, roi_id, acquired_image)
                peaks = region_peak_count(files.reader, mask)
            except ValueError as e:
                regions.append({'roi_id': roi_id, 'peaks': 0, 'available': False, 'reason': str(e)})
                continue
            regions.append(
                self._region_availability(roi_id, peaks, MEAN_SPECTRUM_MAX_REGION_PEAKS, 'Region')
            )
        return {
            'available': True,
            'whole_dataset_available': whole['available'],
            'reason': whole['reason'],
            'total_peaks': total_peaks,
            'whole': whole,
            'regions': regions,
        }

    def _roi_geojson(self, ds_id: str, roi_id) -> dict:
        res = self._db.select_one(
            'SELECT geojson FROM public.roi WHERE id = %s AND dataset_id = %s',
            params=(int(roi_id), ds_id),
        )
        if not res:
            raise ValueError(f'ROI {roi_id} not found for dataset {ds_id}')
        geojson = res[0]
        return json.loads(geojson) if isinstance(geojson, str) else geojson

    def _acquired_image(self, ds_id: str) -> np.ndarray:
        """2-D boolean image of acquired pixels (TIC > 0)."""
        return get_tic_image(self._db, self._image_storage, ds_id) > 0

    def region_mask(
        self,
        ds_id: str,
        roi_id,
        acquired_image: Optional[np.ndarray] = None,
        geojson: Optional[dict] = None,
    ) -> np.ndarray:
        """Flat boolean mask over pixel indices (``y * w + x``): the ROI polygon intersected
        with the acquired (TIC > 0) footprint, so unacquired pixels never deflate the mean."""
        if acquired_image is None:
            acquired_image = self._acquired_image(ds_id)
        height, width = acquired_image.shape
        acquired = acquired_image.ravel()
        if roi_id is None:
            return acquired

        if geojson is None:
            geojson = self._roi_geojson(ds_id, roi_id)
        roi_mask = rasterise_roi_mask(geojson, int(roi_id), width, height)
        if roi_mask is None:
            raise ValueError(f'ROI {roi_id} has no usable polygon')
        return acquired & roi_mask.astype(bool).ravel()

    @staticmethod
    def _cache_key(ds_id: str, roi_id, geojson, instrument: str, ppm: float) -> str:
        if roi_id is None:
            region_hash = WHOLE_DATASET
        else:
            # ROIs are edited in place and carry no version column: hash the polygon itself
            canonical = json.dumps(geojson, sort_keys=True, separators=(',', ':'))
            region_hash = f'{roi_id}:{hashlib.sha256(canonical.encode()).hexdigest()[:16]}'
        return f'mean_spectrum:v{ALGO_VERSION}:{ds_id}:{region_hash}:{instrument}:{ppm}'

    def _region_peaks(self, ds_id: str, roi_id, mask: np.ndarray):
        """The ROI's peaks read from the .ibd, ordered like the browser arrays."""
        files = self._dataset_files(ds_id)
        pixel_indexes = pixel_indexes_from_reader(files.reader)
        in_grid = pixel_indexes < len(mask)
        in_region = np.zeros(len(pixel_indexes), dtype=bool)
        in_region[in_grid] = mask[pixel_indexes[in_grid]]

        peaks = region_peak_count(files.reader, mask)
        cap = MEAN_SPECTRUM_MAX_REGION_PEAKS
        if peaks > cap:
            raise ValueError(self._region_availability(roi_id, peaks, cap, 'Region')['reason'])

        mzs, ints, pix = read_pixel_spectra(
            self._s3_client,
            files.upload_bucket,
            files.ibd_key,
            files.reader,
            np.where(in_region)[0],
        )
        return sort_like_browser(mzs, ints, pix)

    def _whole_dataset_peaks(self, ds_id: str, acquired: np.ndarray):
        """Stream the browser arrays once, keeping peaks that fall on acquired pixels."""
        arrays = self._browser_arrays(ds_id)
        total_peaks = arrays.peak_count()
        cap = MEAN_SPECTRUM_WHOLE_DS_MAX_PEAKS
        if total_peaks > cap:
            raise ValueError(
                self._region_availability(None, total_peaks, cap, 'The whole dataset')['reason']
            )

        mz_parts, int_parts, pix_parts = [], [], []
        for mzs, ints, sp_idxs in arrays.iter_chunks(STREAM_CHUNK_BYTES):
            pix = sp_idxs.astype(np.int32)
            keep = (pix >= 0) & (pix < len(acquired))
            keep[keep] = acquired[pix[keep]]
            mz_parts.append(mzs[keep])
            int_parts.append(ints[keep])
            pix_parts.append(pix[keep])
        mzs = np.concatenate(mz_parts) if mz_parts else np.empty(0, 'f')
        ints = np.concatenate(int_parts) if int_parts else np.empty(0, 'f')
        pix = np.concatenate(pix_parts) if pix_parts else np.empty(0, np.int32)
        return mzs, ints, pix

    def _compute_uncached(self, ds_id: str, roi_id, geojson, instrument: str, ppm: float) -> dict:
        mask = self.region_mask(ds_id, roi_id, geojson=geojson)
        n_pixels = int(mask.sum())
        if n_pixels == 0:
            raise ValueError('The selected region contains no acquired pixels')

        if roi_id is None:
            mzs, ints, pix = self._whole_dataset_peaks(ds_id, mask)
        else:
            mzs, ints, pix = self._region_peaks(ds_id, roi_id, mask)

        ref_mzs, summed_ints, support = build_reference_axis_strict(
            mzs, ints, pix, instrument, ppm, n_pixels
        )
        total_peaks = len(ref_mzs)
        ref_mzs, summed_ints, support = select_top_peaks(ref_mzs, summed_ints, support)
        logger.info(
            f'Mean spectrum for {ds_id} roi={roi_id}: {len(mzs)} peaks -> {total_peaks} clusters'
        )
        return {
            'mzs': ref_mzs,
            'summed_ints': summed_ints,
            'support': support,
            'n_pixels': n_pixels,
            'total_peaks': total_peaks,
            'returned_peaks': len(ref_mzs),
            'instrument': instrument,
            'clustering_ppm': ppm,
        }

    def compute(self, ds_id: str, roi_id=None) -> dict:
        """Reference axis and summed intensities for the region, cached in-process.

        Mean and sum differ only by ``n_pixels``, so the aggregation stat is not part of the
        key. The peak caps apply only on a miss.
        """
        instrument = self._instrument(ds_id)
        ppm = get_ppm(self._db, ds_id)
        geojson = None if roi_id is None else self._roi_geojson(ds_id, roi_id)
        cache_key = self._cache_key(ds_id, roi_id, geojson, instrument, ppm)

        cached = _cache_get(cache_key)
        if cached is not None:
            logger.info(f'Mean spectrum cache hit for {cache_key}')
            return cached

        result = self._compute_uncached(ds_id, roi_id, geojson, instrument, ppm)
        _cache_put(cache_key, result)
        return result
