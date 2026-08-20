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
from typing import Optional, Tuple

import numpy as np

from sm.engine.annotation.isocalc_wrapper import mass_accuracy_half_width
from sm.engine.config import SMConfig
from sm.engine.db import DB
from sm.engine.image_storage import ImageStorage
from sm.engine.postprocessing.experiment_masks import rasterise_roi_mask
from sm.engine.storage import get_s3_client
from sm.engine.utils.dataset_image_data import get_imzml_browser_arrays, get_ppm, get_tic_image

logger = logging.getLogger('api')

# NOTE: The peak-count caps below are provisional. They are deliberately expressed in
# peaks rather than pixels because the browser arrays are globally m/z-sorted, so every
# request -- ROI or whole-dataset -- pays the same full download and membership scan.
# Total peak count, not pixel count, is the cost driver. Re-tune these against real data,
# including a densely-scattered processed-mode dataset (e.g. Waters MRT/Xevo), before
# treating them as final.
MEAN_SPECTRUM_MAX_PEAKS = 30_000_000
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


def _cluster_bounds_strict(mzs, pix, instrument, ppm) -> np.ndarray:
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

    starts = []
    stack = list(zip(block_starts.tolist(), block_ends.tolist()))
    while stack:
        start, end = stack.pop()
        if end - start == 1:
            starts.append(start)
            continue

        sub_mzs = mzs[start:end]
        tol = mass_accuracy_half_width(float(sub_mzs.mean()), instrument, ppm)
        within_tol = (sub_mzs[-1] - sub_mzs[0]) <= tol
        # "strict": a single pixel must not contribute two peaks to one cluster
        no_dup_pixels = len(np.unique(pix[start:end])) == (end - start)

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


class MeanSpectrumManager:
    """Loads region peaks for a dataset, builds the reference axis, caches the result."""

    def __init__(self, db: Optional[DB] = None):
        self._db = db or DB()
        self._sm_config = SMConfig.get_conf()
        self._s3_client = get_s3_client(sm_config=self._sm_config)
        self._image_storage = ImageStorage()
        self._browser_bucket = self._sm_config['imzml_browser_storage']['bucket']

    def _dataset_uuid(self, ds_id: str) -> str:
        res = self._db.select_one('SELECT input_path FROM dataset WHERE id = %s', params=(ds_id,))
        if not res:
            raise ValueError(f'Dataset {ds_id} does not exist')
        return res[0].split('/')[-1]

    def _instrument(self, ds_id: str) -> str:
        res = self._db.select_one(
            "SELECT config->'isotope_generation'->>'instrument' FROM dataset WHERE id = %s",
            params=(ds_id,),
        )
        if not res:
            raise ValueError(f'Dataset {ds_id} does not exist')
        # Datasets processed before the instrument config field existed have no value;
        # default to TOF, matching IsocalcWrapper's convention.
        return res[0] or 'TOF'

    def peak_count(self, ds_id: str) -> int:
        """Total peaks in the dataset, from the size of mzs.npy. No download."""
        uuid = self._dataset_uuid(ds_id)
        head = self._s3_client.head_object(Bucket=self._browser_bucket, Key=f'{uuid}/mzs.npy')
        return int(head['ContentLength']) // np.dtype('f').itemsize

    def availability(self, ds_id: str) -> dict:
        """Whether the tab, and the whole-dataset option within it, can be offered."""
        try:
            total_peaks = self.peak_count(ds_id)
        except Exception as e:  # pylint: disable=broad-except
            logger.warning(f'Mean spectrum unavailable for {ds_id}: {e}')
            return {
                'available': False,
                'whole_dataset_available': False,
                'reason': 'imzML browser files are not available for this dataset',
                'total_peaks': 0,
            }

        if total_peaks > MEAN_SPECTRUM_MAX_PEAKS:
            return {
                'available': False,
                'whole_dataset_available': False,
                'reason': (
                    f'Dataset has {_format_peak_count(total_peaks)} peaks, above the '
                    f'{_format_peak_count(MEAN_SPECTRUM_MAX_PEAKS)} peak limit for mean spectra'
                ),
                'total_peaks': total_peaks,
            }

        whole_ok = total_peaks <= MEAN_SPECTRUM_WHOLE_DS_MAX_PEAKS
        return {
            'available': True,
            'whole_dataset_available': whole_ok,
            'reason': (
                None
                if whole_ok
                else (
                    f'Whole-dataset spectra are unavailable above '
                    f'{_format_peak_count(MEAN_SPECTRUM_WHOLE_DS_MAX_PEAKS)} peaks '
                    f'(this dataset has {_format_peak_count(total_peaks)})'
                )
            ),
            'total_peaks': total_peaks,
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

    def region_mask(self, ds_id: str, roi_id) -> np.ndarray:
        """Flat boolean mask over pixel indices, indexed the same way as ``sp_idxs``.

        Only acquired pixels count: the ROI polygon is intersected with the TIC>0
        footprint so that a loosely-drawn polygon, or a non-rectangular acquisition,
        does not deflate the mean with pixels that never held a spectrum.
        """
        tic_image = get_tic_image(self._db, self._image_storage, ds_id)
        height, width = tic_image.shape
        acquired = (tic_image > 0).ravel()

        if roi_id is None:
            return acquired

        geojson = self._roi_geojson(ds_id, roi_id)
        roi_mask = rasterise_roi_mask(geojson, int(roi_id), width, height)
        if roi_mask is None:
            raise ValueError(f'ROI {roi_id} has no usable polygon')
        return acquired & roi_mask.astype(bool).ravel()

    def _cache_key(self, ds_id: str, roi_id, instrument: str, ppm: float) -> str:
        if roi_id is None:
            region_hash = WHOLE_DATASET
        else:
            # ROIs are edited in place (updateRoi rewrites roi.geojson) and carry no
            # version column, so the key has to hash the polygon itself.
            geojson = self._roi_geojson(ds_id, roi_id)
            canonical = json.dumps(geojson, sort_keys=True, separators=(',', ':'))
            region_hash = f'{roi_id}:{hashlib.sha256(canonical.encode()).hexdigest()[:16]}'
        return f'mean_spectrum:v{ALGO_VERSION}:{ds_id}:{region_hash}:{instrument}:{ppm}'

    def _compute_uncached(self, ds_id: str, roi_id, instrument: str, ppm: float) -> dict:
        mask = self.region_mask(ds_id, roi_id)
        n_pixels = int(mask.sum())
        if n_pixels == 0:
            raise ValueError('The selected region contains no acquired pixels')

        mzs, ints, sp_idxs = get_imzml_browser_arrays(
            self._db, self._s3_client, self._sm_config, ds_id
        )
        pix = sp_idxs.astype(np.int64)
        # sp_idx is a flattened pixel index; guard against indices outside the TIC grid
        in_region = (pix >= 0) & (pix < len(mask)) & mask[np.clip(pix, 0, len(mask) - 1)]

        ref_mzs, summed_ints, support = build_reference_axis_strict(
            mzs[in_region], ints[in_region], pix[in_region], instrument, ppm, n_pixels
        )
        total_peaks = len(ref_mzs)
        ref_mzs, summed_ints, support = select_top_peaks(ref_mzs, summed_ints, support)

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
        """Reference axis and summed intensities for the region. Cached in-process.

        The result is stat-independent -- mean and sum differ only by ``n_pixels`` -- so
        the aggregation stat is deliberately not part of the cache key. The cache is
        consulted before the availability check: an entry can only exist because it was
        computed under the peak limits, so a hit skips the S3 head request entirely.
        """
        instrument = self._instrument(ds_id)
        ppm = get_ppm(self._db, ds_id)
        cache_key = self._cache_key(ds_id, roi_id, instrument, ppm)

        cached = _cache_get(cache_key)
        if cached is not None:
            logger.info(f'Mean spectrum cache hit for {cache_key}')
            return cached

        availability = self.availability(ds_id)
        if not availability['available']:
            raise ValueError(availability['reason'])
        if roi_id is None and not availability['whole_dataset_available']:
            raise ValueError(availability['reason'])

        result = self._compute_uncached(ds_id, roi_id, instrument, ppm)
        _cache_put(cache_key, result)
        return result
