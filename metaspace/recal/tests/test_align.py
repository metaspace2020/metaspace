import numpy as np
import pandas as pd
from numpy.random import default_rng

from msi_recal import RecalParams
from msi_recal.db_peak_match import build_dbs
from msi_recal.math import get_centroid_peaks
from msi_recal.passes.align_msiwarp import AlignMsiwarp


rng = default_rng(42)

MOCK_PARAMS = RecalParams(
    analyzer='orbtrap',
    source='maldi',
    matrix='dhb',
    polarity='positive',
    rp=140000,
    base_mz=200,
    peak_width_ppm=1,
    jitter_ppm=1,
    adducts=['+H'],
    dbs=['matrix_dhb_pos'],
    targeted_dbs=['matrix_dhb_pos'],
    transforms=[''],
)


def make_mock_spectrum(params: RecalParams):
    db = pd.concat([df for name, df, is_targeted in build_dbs(params)])
    mzs = []
    ints = []
    for row in db.itertuples():
        formula_mzs, formula_ints = get_centroid_peaks(
            row.formula, row.adduct, row.charge, 0.01, params.instrument_model
        )
        mzs.extend(formula_mzs)
        ints.extend(formula_ints)

    mzs = np.array(mzs)
    ints = np.array(ints)
    order = np.argsort(mzs)
    return mzs[order], ints[order]


def make_mock_peaks_df(
    params: RecalParams, shift_scale: float, warp_scale: float, jitter_scale: float
):
    "Returns a peaks_df where sp==1 is unwarped, and the rest each have a shift/warp"
    mzs, ints = make_mock_spectrum(params)
    warps = [1, *rng.normal(1, params.jitter_sigma_1 * warp_scale, 15)]
    shifts = [0, *rng.normal(0, params.jitter_sigma_1 * shift_scale, 15)]
    jitters = [
        np.zeros_like(mzs),
        *(rng.normal(0, params.jitter_sigma_1 * jitter_scale, (15, len(mzs)))),
    ]
    df = pd.concat(
        [
            pd.DataFrame(
                {
                    'sp': sp,
                    'mz': mzs * warp + shift + jitter,
                    'ints': ints,
                }
            )
            for sp, (warp, shift, jitter) in enumerate(zip(warps, shifts, jitters))
        ],
        ignore_index=True,
    )
    return df


def compare_spectra_to_ref(ref_df, peaks_df):
    ref_df = ref_df.sort_values('mz')
    sp_errs = []
    for sp, df in peaks_df.groupby('sp'):
        errs = ref_df.mz.values - df.sort_values('mz').mz.values
        sp_errs.append([np.mean(err_chunk) for err_chunk in np.array_split(errs, 3)])
    return pd.DataFrame(sp_errs, columns=['lo', 'mid', 'hi']).describe()


def test_align_msiwarp_with_shift():
    peaks_df = make_mock_peaks_df(MOCK_PARAMS, 1, 1, 0.1)
    ref_df = peaks_df[peaks_df.sp == 0].reset_index()

    align = AlignMsiwarp(MOCK_PARAMS)
    align.fit(peaks_df)
    aligned_df = align.predict(peaks_df)

    print(f'Before:')
    print(compare_spectra_to_ref(ref_df, peaks_df))
    print(f'After:')
    print(compare_spectra_to_ref(ref_df, aligned_df))

    # WIP
