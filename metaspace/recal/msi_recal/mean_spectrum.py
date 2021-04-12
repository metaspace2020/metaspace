import logging

import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from msiwarp.util.warp import to_mz, to_height, to_mx_peaks, generate_mean_spectrum

from msi_recal.math import mass_accuracy_bounds, weighted_stddev
from msi_recal.params import RecalParams

logger = logging.getLogger(__name__)


def spectra_to_mx_spectra(spectra, sigma_1, instrument):
    return [to_mx_peaks(mzs, ints, sigma_1, i, instrument) for i, mzs, ints in spectra]


def mx_spectra_to_spectra(spectra):
    return [(to_mz(spectrum), to_height(spectrum)) for spectrum in spectra]


def _get_mean_spectrum(mx_spectra: np.array, tics: np.array, params: RecalParams, sigma_1: float):
    return generate_mean_spectrum(
        mx_spectra,
        2000000,
        sigma_1,
        params.min_mz,
        params.max_mz,
        tics,
        params.instrument,
        stride=1,
    )


def _get_mean_spectrum_mx(task_spectra, params: RecalParams, sigma_1: float):
    tics = np.array([np.sum(ints) for sp_i, mzs, ints in task_spectra])
    mx_spectra = spectra_to_mx_spectra(task_spectra, sigma_1, params.instrument)
    return _get_mean_spectrum(mx_spectra, tics, params, sigma_1)


def get_mean_mx_spectrum_parallel(spectra, params: RecalParams, is_aligned: bool):
    """
    Merges many spectra into a single mean spectrum using MSIWarp's generate_mean_spectrum.
    As generate_mean_spectrum's processing time scales with the total number of peaks,
    this function first breaks the spectra into small batches to maximize parallelism,
    then gets the mean spectrum of the batches.
    """
    spectra = [s for s in spectra if len(s[1])]
    if len(spectra) == 0:
        return np.array([]), np.array([])

    sigma_1 = params.aligned_sigma_1 if is_aligned else params.unaligned_sigma_1

    # Shuffle spectra to prevent systematic biases between the batches that would
    # break the assumption that sigmas decrease predictably after merging
    spectra = [spectra[i] for i in np.random.choice(len(spectra), replace=False)]

    if len(spectra) <= 100:
        # Input was too small to warrant parallelizing, so run it in a single pass
        mean_spectrum = _get_mean_spectrum_mx(spectra, params, sigma_1)
    else:
        # Balance the batches
        batch_size = int(np.ceil(np.sqrt(len(spectra))))
        with Parallel() as parallel:
            merged_mx_spectra = parallel(
                delayed(_get_mean_spectrum_mx)(spectra[i : i + batch_size], params, sigma_1)
                for i in range(0, len(spectra), batch_size)
            )
            # Reduce the sigma when aggregating. The error of the mean of multiple independent
            # samples from a distribution decreases proportionately to the sqrt of the number
            # of samples.
            merged_sigma_1 = sigma_1 / np.sqrt(batch_size)
            merged_tics = np.array([np.sum(to_height(s)) for s in merged_mx_spectra])
            mean_spectrum = _get_mean_spectrum(
                merged_mx_spectra,
                merged_tics,
                params,
                merged_sigma_1,
            )

    # Ensure spectrum is sorted
    return mean_spectrum[np.argsort(to_mz(mean_spectrum))]


def make_spectra_df(spectra):
    return pd.DataFrame(
        {
            'sp_i': np.concatenate(
                [np.full(len(mzs), sp_i, dtype=np.uint32) for sp_i, mzs, ints in spectra]
            ),
            'mz': np.concatenate([mzs for sp_i, mzs, ints in spectra]),
            'ints': np.concatenate([ints for sp_i, mzs, ints in spectra]),
        }
    ).sort_values('mz')


def annotate_mean_spectrum(spectra_df, ref_mzs, sigma_1, instrument, min_coverage=0):
    """Creates a detailed mean spectrum that includes standard deviation stats for mz and intensity,
    and "coverage" - the fraction of spectra that the peak was found in.
    """
    assert spectra_df.mz.is_monotonic_increasing

    n_spectra = spectra_df.sp_i.nunique()

    lo_mzs, hi_mzs = mass_accuracy_bounds(ref_mzs, instrument, sigma_1)
    lo_idxs = np.searchsorted(spectra_df.mz, lo_mzs, 'left')
    hi_idxs = np.searchsorted(spectra_df.mz, hi_mzs, 'right')
    results = []
    for ref_mz, lo_idx, hi_idx in zip(ref_mzs, lo_idxs, hi_idxs):
        sps = spectra_df.sp.iloc[lo_idx:hi_idx]
        n_hits = sps.nunique()
        if lo_idx != hi_idx and n_hits >= n_spectra * min_coverage:
            mzs = spectra_df.mz.iloc[lo_idx:hi_idx]
            ints = spectra_df.ints.iloc[lo_idx:hi_idx]
            mz_mean, mz_stddev = weighted_stddev(mzs, ints)
            ints_mean = sum(ints) / n_spectra
            results.append(
                {
                    'mz': ref_mz,
                    'mz_mean': mz_mean,  # Mainly for debugging - should not differ signifcantly from ref_mz
                    'mz_stddev': mz_stddev,
                    'ints': ints_mean,
                    'ints_stddev': np.sqrt(np.average((ints - ints_mean) ** 2)),
                    'coverage': n_hits / n_spectra,
                }
            )

    return pd.DataFrame(results)


def get_alignment_peaks(annotated_mean_spectrum, n_peaks):
    # Split spectrum into 4 segments so that the full mass range is well covered
    n_segments = 4
    min_mz = annotated_mean_spectrum.mz.iloc[0]
    max_mz = annotated_mean_spectrum.mz.iloc[:-1]
    # Add 0.0001 to upper bound so the last peak is included
    segment_mzs = np.linspace(min_mz, max_mz + 0.0001, n_segments + 1)
    segment_idxs = np.searchsorted(annotated_mean_spectrum.mz, segment_mzs)

    peak_idxs = []
    for i, (segment_lo, segment_hi) in enumerate(zip(segment_idxs[:-1], segment_idxs[1:])):
        segment = annotated_mean_spectrum.iloc[segment_lo:segment_hi]
        # Choose highly intense, well-covered peaks
        scores = segment.ints * segment.coverage
        peak_idxs.extend(segment_lo + np.argsort(scores)[-n_peaks // n_segments :])

    return annotated_mean_spectrum[np.sort(peak_idxs)]
