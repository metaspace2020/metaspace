import logging

import numpy as np
import pandas as pd
from msiwarp.util.warp import to_mz, to_height, to_mx_peaks, generate_mean_spectrum

from msi_recal.join_by_mz import join_by_mz
from msi_recal.math import (
    mass_accuracy_bounds,
    weighted_stddev,
    peak_width,
    mass_accuracy_bound_indices,
)
from msi_recal.params import InstrumentType

logger = logging.getLogger(__name__)


def _get_mean_spectrum(
    mx_spectra: np.array,
    instrument: InstrumentType,
    sigma_1: float,
):
    tics = np.array([np.sum(to_height(s)) for s in mx_spectra])
    # min_mz = np.floor(np.min([s[0].mz for s in mx_spectra if len(s)]))
    # max_mz = np.ceil(np.max([s[-1].mz for s in mx_spectra if len(s)]))
    min_mz = np.floor(np.min([np.min(to_mz(s)) for s in mx_spectra if len(s)]))
    max_mz = np.ceil(np.max([np.max(to_mz(s)) for s in mx_spectra if len(s)]))

    # MSIWarp's generate_mean_spectrum needs a temporary array to store a fuzzy histogram of peaks
    # with a distribution function that ensures the peak width is a constant number of bins
    # throughout the m/z range. The formula for this is different for each instrument.
    # n_points specifies how big the temporary array should be. If it's set too low, the function
    # silently fails. If it's set too high, it takes longer to run and there are console warnings.
    # Predict the required number of n_points so that neither of these conditions are hit.
    # A buffer of 10% + 1000 is added to compensate for numerical error
    exp = {'tof': 1, 'orbitrap': 1.5, 'ft-icr': 2}[instrument]
    density_samples = np.linspace(min_mz, max_mz, 100) ** exp * 0.25 * sigma_1
    n_points = int(
        (max_mz - min_mz) / np.average(density_samples, weights=1 / density_samples) * 1.1 + 1000
    )

    return generate_mean_spectrum(
        mx_spectra,
        n_points,
        sigma_1,
        min_mz,
        max_mz,
        tics,
        instrument,
        stride=1,
    )


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


def representative_spectrum(
    spectra_df: pd.DataFrame,
    mean_spectrum: pd.DataFrame,
    instrument: InstrumentType,
    sigma_1: float,
    denoise=False,
):
    """Finds the single spectrum that is most similar to the mean spectrum"""

    orig_mean_spectrum = mean_spectrum

    if denoise:
        # Exclude peaks that only exist in small number of spectra, have high m/z variability
        # (which suggests that multiple peaks were grouped together), or are near other more
        # intense peaks
        mean_spectrum = mean_spectrum[mean_spectrum.n_hits > 1]
        _ints = mean_spectrum.ints.values
        _mz = mean_spectrum.mz.values
        local_lo, local_hi = mass_accuracy_bound_indices(_mz, _mz, instrument, sigma_1 * 2)
        local_maximum_score = np.array(
            [
                lo >= hi - 1 or i == lo + np.argmax(_ints[lo:hi])
                for i, (lo, hi) in enumerate(zip(local_lo, local_hi))
            ]
        )

        peak_score = (
            mean_spectrum.coverage
            * (0.1 + local_maximum_score)
            * (1 - np.clip(mean_spectrum.mz_stddev / mean_spectrum.mz_tol, 0, 1))
        )

        mean_spectrum = sample_across_mass_range(mean_spectrum, peak_score, n_per_bin=500)
        logger.debug(
            f'Denoising reduced peaks from {len(orig_mean_spectrum)} to {len(mean_spectrum)}'
        )

    # Find the spectrum that's most similar to the background spectrum
    mean_spectrum = mean_spectrum.rename(columns={'mz': 'mean_mz', 'ints': 'mean_ints'})
    spectrum_scores = {}
    processed_spectra = {}
    for sp, grp in spectra_df.groupby('sp'):
        joined = join_by_mz(mean_spectrum, 'mean_mz', grp, 'mz', instrument, sigma_1, how='left')
        mz_tol = peak_width(joined.mz, instrument, sigma_1) / 2
        joined['mz_err'] = np.clip((joined.mean_mz - joined.mz.fillna(0)) / mz_tol, -1, 1)
        a = joined.mean_ints
        b = joined.ints.fillna(0)
        mz_err = max(joined.mz_err.abs().sum(), 0.0001)
        # score = cosine_similarity(mean_ints, ints) / mz_err.sum()
        spectrum_scores[sp] = np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)) / mz_err
        if denoise:
            processed_spectra[sp] = joined[['sp', 'mz', 'ints']][~joined.ints.isna()]
        else:
            processed_spectra[sp] = grp

    # Return the best scoring spectrum
    best_sp = pd.Series(spectrum_scores).idxmax()
    logger.debug(f'Choose representative spectrum: {best_sp}')
    return processed_spectra[best_sp].sort_values('mz')


def hybrid_mean_spectrum(spectra_df, instrument, sigma_1, min_coverage=0):
    from msiwarp.util.warp import to_mz

    if not spectra_df.mz.is_monotonic_increasing:
        spectra_df = spectra_df.sort_values('mz')

    n_spectra = spectra_df.sp.nunique()
    mx_spectra = [
        to_mx_peaks(grp.mz, grp.ints, sigma_1, sp, instrument)
        for sp, grp in spectra_df.groupby('sp')
    ]
    logger.debug(f'Converted {sum(map(len, mx_spectra))} peaks to mx.peak')

    mean_spectrum = _get_mean_spectrum(mx_spectra, instrument, sigma_1)
    mean_spectrum_df = pd.DataFrame(
        {'mz': to_mz(mean_spectrum), 'ints': np.float32(to_height(mean_spectrum))}
    ).sort_values('mz')
    logger.debug(f'MSIWarp generate_mean_spectrum returned {len(mean_spectrum_df)} peaks')

    lo_mzs, hi_mzs = mass_accuracy_bounds(mean_spectrum_df.mz.values, instrument, sigma_1)

    lo_idxs = np.searchsorted(spectra_df.mz, lo_mzs, 'left')
    hi_idxs = np.searchsorted(spectra_df.mz, hi_mzs, 'right')
    results = []
    for lo_idx, hi_idx, mz_tol, mx_mz, mx_ints, lo_mz, hi_mz in zip(
        lo_idxs,
        hi_idxs,
        hi_mzs - lo_mzs,
        mean_spectrum_df.mz,
        mean_spectrum_df.ints,
        lo_mzs,
        hi_mzs,
    ):
        # if np.abs(mx_mz - 211.010248) < 0.005:
        #     print(lo_idx, hi_idx, mz_tol, mx_mz, mx_ints, lo_mz, hi_mz)
        #     sp_ids = spectra_df.sp.iloc[lo_idx:hi_idx].unique()
        #     print(f'sp_ids ({len(sp_ids)}):', sp_ids)
        #     print('n_spectra:', n_spectra)
        if hi_idx != lo_idx and hi_idx - lo_idx >= n_spectra * min_coverage:
            n_hits = spectra_df.sp.iloc[lo_idx:hi_idx].nunique()
            if n_hits >= n_spectra * min_coverage:
                mzs = spectra_df.mz.iloc[lo_idx:hi_idx]
                ints = spectra_df.ints.iloc[lo_idx:hi_idx]
                mz_mean, mz_stddev = weighted_stddev(mzs, ints)
                ints_mean = sum(ints) / n_spectra
                results.append(
                    {
                        'mz': mz_mean,
                        'mz_stddev': mz_stddev,
                        'mz_mx': mx_mz,
                        'mz_tol': mz_tol,
                        'ints': ints_mean,
                        'ints_stddev': np.sqrt(np.average((ints - ints_mean) ** 2)),
                        'ints_mx': mx_ints,
                        'coverage': n_hits / n_spectra,
                        'n_hits': n_hits,
                    }
                )

    logger.debug(f'Hybrid_mean_spectrum returned {len(results)} peaks (sigma_1: {sigma_1})')

    return pd.DataFrame(results)


def sample_across_mass_range(spectrum: pd.DataFrame, scores, n_bins=4, n_per_bin=250):
    """For ensuring an even distribution of peaks across the mass range, get split the mass range
    into `n_bins` even bins and take the highest-scored `n_per_bin` from each bin."""
    assert len(spectrum) == len(scores)
    bin_edges = np.histogram_bin_edges(spectrum.mz.values, n_bins)
    bins = []
    for i in range(n_bins):
        bin_mask = spectrum.mz.between(bin_edges[i], bin_edges[i + 1])
        idxs = np.argsort(scores[bin_mask])[-n_per_bin:]
        logger.debug(f'Chose {len(idxs)} peaks from {bin_edges[i]:.0f}-{bin_edges[i + 1]:.0f}')
        bins.append(spectrum[bin_mask].iloc[idxs])

    return pd.concat(bins).sort_values('mz')
