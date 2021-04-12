from pathlib import Path
import logging

import numpy as np
import pandas as pd
from msiwarp.util.warp import to_mz, to_mx_peaks

from msi_recal.math import mass_accuracy_bounds, get_centroid_peaks
from msi_recal.params import RecalParams

logger = logging.getLogger(__name__)


def join_by_mz(left, left_mz_col, right, right_mz_col, instrument, sigma_1, how='inner'):
    """Joins two DataFrames by m/z value, using the given m/z tolerance"""

    if not right[right_mz_col].is_monotonic_increasing:
        right = right.sort_values(right_mz_col)
    lo_mz, hi_mz = mass_accuracy_bounds(left[left_mz_col].values, instrument, sigma_1)

    lo_idx = np.searchsorted(right[right_mz_col], lo_mz, 'l')
    hi_idx = np.searchsorted(right[right_mz_col], hi_mz, 'r')
    mask = lo_idx != hi_idx

    joiner = pd.DataFrame(
        [
            (left_i, right_i)
            for left_i, lo, hi in zip(left.index[mask], lo_idx[mask], hi_idx[mask])
            for right_i in range(lo, hi)
        ],
        columns=['left_i', 'right_i'],
    )

    return (
        left.merge(joiner, left_index=True, right_on='left_i', how=how)
        .merge(right, left_on='right_i', right_index=True, how=how)
        .drop(columns=['left_i', 'right_i'])
    )


def _spectral_score(ref_ints: np.ndarray, ints: np.ndarray):
    """Calculates a spectral score based on the relative intensities of isotopic peaks."""
    if len(ref_ints) > 1:
        # Sort peaks by decreasing predicted intensity and normalize relative to the first peak
        order = np.argsort(ref_ints)[::-1]
        ints = ints[order[1:]] / ints[order[0]]
        ref_ints = ref_ints[order[1:]] / ref_ints[order[0]]

        ints_ratio_error = np.abs(ints / (ints + ref_ints) - 0.5) * 2
        return 1 - np.average(ints_ratio_error, weights=ref_ints)
    else:
        return 0


def calc_spectral_scores(spectrum, db_hits, params: RecalParams, sigma_1: float) -> pd.Series:
    """For each DB match, searches for isotopic peaks with the same approximate mass error and
    calculates a spectral score"""

    # Make list of expected isotopic peaks for each DB hit
    spectral_peaks = []
    for db_hit in db_hits.itertuples():
        min_abundance = params.limit_of_detection / db_hit.ints
        mol_peaks = get_centroid_peaks(
            db_hit.formula,
            db_hit.adduct,
            db_hit.charge,
            min_abundance,
            params.instrument_model,
        )
        # Recalc error as centroid may be slightly different to monoisotopic peak
        mz_error = db_hit.mz - mol_peaks[0][0]
        for mz, ref_ints in mol_peaks:
            spectral_peaks.append((db_hit[0], mz + mz_error, ref_ints))

    # Search for peaks in the spectrum
    spectral_peaks = pd.DataFrame(spectral_peaks, columns=['hit_index', 'ref_mz', 'ref_ints'])
    spectral_hits = join_by_mz(
        spectral_peaks, 'ref_mz', spectrum, 'mz', params.instrument, sigma_1, how='left'
    )
    spectral_hits['ints'] = spectral_hits['ints'].fillna(0)

    # Calculate score
    spectral_scores = spectral_hits.groupby('hit_index').apply(
        lambda grp: _spectral_score(grp.ref_ints.values, grp.ints.values)
    )
    return spectral_scores


def get_recal_candidates(mean_spectrum, mz_lo, mz_hi, adducts, charge, recal_ppm=3):
    peaks = pd.DataFrame(
        [(s.mz, s.height, s.sigma_mz) for s in mean_spectrum], columns=['mz', 'ints', 'sigma']
    )

    candidate_dfs = []
    for db_path in Path('./dbs').glob('*.csv'):
        for adduct in adducts:
            db_name = db_path.stem + adduct
            db = pd.read_csv(db_path).assign(db=db_name)[['db', 'formula']].drop_duplicates()
            formulas = db.formula.unique()
            mzs = pd.Series(
                {formula: get_centroid_peaks(formula, adduct, charge)[0] for formula in formulas}
            )
            db['adduct'] = adduct
            db['db_mz'] = mzs[db.formula].values
            db = db[(db.db_mz >= mz_lo) & (db.db_mz <= mz_hi)]
            db_hits = join_by_mz(db, 'db_mz', peaks, 'mz', recal_ppm)
            spectral_scores = calc_spectral_scores(peaks, db_hits, charge)
            db_hits = db_hits.join(spectral_scores)
            db_hits = db_hits[db_hits.n_ref_peaks > 1]
            sum_spectral_score = (
                db_hits.sort_values('spectral_score', ascending=False)
                .drop_duplicates('formula')
                .spectral_score.sum()
            )
            db_weight = sum_spectral_score / len(db)
            db_hits['weight'] = db_hits.spectral_score * db_weight
            candidate_dfs.append(db_hits)

            logger.info(
                f'{db_name}: {db_hits.formula.nunique()} of {len(db)} formulas in m/z range matched, weight: {db_weight}'
            )

    candidate_df = pd.concat(candidate_dfs)
    candidate_df['weight'] /= candidate_df.weight.max()

    return candidate_df


def get_recal_mx_spectrum(candidate_peaks, n_nodes):
    # Align only - use up to 25 most intense peaks from each quarter of the m/z range as reference
    chunk_edges = np.linspace(np.min(candidate_peaks.mz), np.max(candidate_peaks.mz), n_nodes)
    s_ref = []
    for chunk_lo, chunk_hi in zip(chunk_edges[:-1], chunk_edges[1:]):
        chunk_peaks = candidate_peaks[candidate_peaks.mz.between(chunk_lo, chunk_hi)]
        best_peaks = chunk_peaks.sort_values('weight', ascending=False)[:25]

        s_ref.append(to_mx_peaks(best_peaks.mz.values, best_peaks.ints.values, sigma_1))
    s_ref = np.concatenate(s_ref)

    return s_ref[np.argsort(to_mz(s_ref))]
