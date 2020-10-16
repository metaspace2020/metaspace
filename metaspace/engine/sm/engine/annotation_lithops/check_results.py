from __future__ import annotations
import numpy as np

from sm.engine.annotation_lithops.utils import logger


def get_reference_results(ds_id):
    from metaspace.sm_annotation_utils import SMInstance

    sm = SMInstance()
    ds = sm.dataset(id=ds_id)
    reference_results = (
        ds.results('HMDB-v4')
        .reset_index()
        .rename({'moc': 'chaos', 'rhoSpatial': 'spatial', 'rhoSpectral': 'spectral'}, axis=1)
    )
    return reference_results[['formula', 'adduct', 'chaos', 'spatial', 'spectral', 'msm', 'fdr']]


def check_results(results_df, ref_results):
    def quantize_fdr(fdr):
        if fdr <= 0.05:
            return 1
        if fdr <= 0.1:
            return 2
        if fdr <= 0.2:
            return 3
        if fdr <= 0.5:
            return 4
        return 5

    def find_differing_rows(df, col_a, col_b, max_error=0.001):
        return df.assign(error=np.abs(df[col_a] - df[col_b])).sort_values('error', ascending=False)[
            lambda d: d.error > max_error
        ][[col_a, col_b, 'error']]

    # clean up dataframes for better manual analysis & include only data that should be present in both dataframes
    filtered_results = results_df.rename({'mol': 'formula'}, axis=1)[
        lambda df: (df.database_path == 'metabolomics/db/mol_db1.csv')
        & (df.adduct != '')
        & (df.modifier == '')
    ][['formula', 'adduct', 'chaos', 'spatial', 'spectral', 'msm', 'fdr']]

    merged_results = (
        filtered_results.rename_axis(index='ion_i')
        .reset_index(drop=False)
        .merge(
            ref_results,
            how='outer',
            left_on=['formula', 'adduct'],
            right_on=['formula', 'adduct'],
            suffixes=['', '_ref'],
        )
        .sort_values(['formula', 'adduct'])
        .set_index('ion_i')
    )

    # Validate no missing results (Should be zero as it's not affected by numeric instability)
    missing_results = merged_results[merged_results.fdr.isna() & merged_results.fdr_ref.notna()]

    # Find missing/wrong results for metrics & MSM
    common_results = merged_results[merged_results.fdr.notna() & merged_results.fdr_ref.notna()]
    spatial_wrong = find_differing_rows(common_results, 'spatial', 'spatial_ref')
    spectral_wrong = find_differing_rows(common_results, 'spectral', 'spectral_ref')
    chaos_wrong = find_differing_rows(common_results, 'chaos', 'chaos_ref')
    msm_wrong = find_differing_rows(common_results, 'msm', 'msm_ref')

    # Validate FDR (Results often go up/down one level due to random factor)
    fdr_level = merged_results.fdr.apply(quantize_fdr)
    fdr_ref_level = merged_results.fdr_ref.apply(quantize_fdr)

    fdr_error = merged_results.assign(fdr_error=(fdr_level - fdr_ref_level).abs())
    fdr_error = fdr_error[fdr_error.fdr_error > 0]

    return {
        'merged_results': merged_results,
        'missing_results': missing_results,
        'spatial_wrong': spatial_wrong,
        'spectral_wrong': spectral_wrong,
        'chaos_wrong': chaos_wrong,
        'msm_wrong': msm_wrong,
        'fdr_error': fdr_error,
    }


def log_bad_results(
    merged_results,
    missing_results,
    spatial_wrong,
    spectral_wrong,
    chaos_wrong,
    msm_wrong,
    fdr_error,
):
    fdr_any_error = fdr_error[lambda df: df.fdr_error > 0]
    fdr_big_error = fdr_error[lambda df: df.fdr_error > 1]
    results = [
        # Name, Maximum allowed, Actual value, Extra data
        ('Missing annotations', 0, len(missing_results), missing_results.head()),
        # A small number of results are off by up to 1% due to an algorithm change since they were processed
        # Annotations with fewer than 4 ion images now have slightly higher spatial and spectral score than before
        ('Incorrect spatial metric', 2, len(spatial_wrong), spatial_wrong.head()),
        ('Incorrect spectral metric', 5, len(spectral_wrong), spectral_wrong.head()),
        ('Incorrect chaos metric', 0, len(chaos_wrong), chaos_wrong.head()),
        ('Incorrect MSM', 2, len(msm_wrong), msm_wrong.head()),
        # FDR can vary significantly depending on which decoy adducts were chosen.
        ('FDR changed', len(merged_results) * 0.25, len(fdr_any_error), fdr_any_error.head()),
        (
            'FDR changed significantly',
            len(merged_results) * 0.1,
            len(fdr_big_error),
            fdr_big_error.head(),
        ),
    ]
    failed_results = []
    for result_name, threshold, value, data in results:
        if value <= threshold:
            logger.info(f'{result_name}: {value} (PASS)')
        else:
            logger.error(f'{result_name}: {value} (FAIL)')
            failed_results.append((result_name, data))

    for result_name, data in failed_results:
        logger.error(f'{result_name} extra info:\n{str(data)}\n')

    if not failed_results:
        logger.info('All checks pass')
    else:
        logger.error(f'{len(failed_results)} checks failed')
