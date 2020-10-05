from itertools import product, repeat
import os
import numpy as np
import pandas as pd
from time import time
from concurrent.futures.thread import ThreadPoolExecutor

from sm.engine.serverless.formula_parser import safe_generate_ion_formula
from sm.engine.serverless.molecular_db import DECOY_ADDUCTS
from sm.engine.serverless.utils import (
    logger,
    PipelineStats,
    serialise,
    deserialise,
    read_cloud_object_with_retry,
)


def _get_random_adduct_set(size, adducts, offset):
    r = np.random.RandomState(123)
    idxs = (r.random_integers(0, len(adducts), size) + offset) % len(adducts)
    return np.array(adducts)[idxs]


def build_fdr_rankings(
    pw, config_ds, config_db, mol_dbs_cobjects, formula_to_id_cobjects, formula_scores_df
):
    mol_db_path_to_cobj = dict(zip(config_db['databases'], mol_dbs_cobjects))

    def build_ranking(group_i, ranking_i, database, modifier, adduct, id, storage):
        print("Building ranking...")
        print(f'job_i: {id}')
        print(f'ranking_i: {ranking_i}')
        print(f'database: {database}')
        print(f'modifier: {modifier}')
        print(f'adduct: {adduct}')
        # For every unmodified formula in `database`, look up the MSM score for the molecule
        # that it would become after the modifier and adduct are applied
        mols = read_cloud_object_with_retry(storage, mol_db_path_to_cobj[database], deserialise)
        if adduct is not None:
            # Target rankings use the same adduct for all molecules
            mol_formulas = list(
                map(safe_generate_ion_formula, mols, repeat(modifier), repeat(adduct))
            )
        else:
            # Decoy rankings use a consistent random adduct for each molecule, chosen so that it doesn't overlap
            # with other decoy rankings for this molecule
            adducts = _get_random_adduct_set(len(mols), decoy_adducts, ranking_i)
            mol_formulas = list(map(safe_generate_ion_formula, mols, repeat(modifier), adducts))

        formula_to_id = {}
        for cobject in formula_to_id_cobjects:
            formula_to_id_chunk = read_cloud_object_with_retry(storage, cobject, deserialise)

            for formula in mol_formulas:
                if formula_to_id_chunk.get(formula) is not None:
                    formula_to_id[formula] = formula_to_id_chunk.get(formula)

        formula_is = [formula and formula_to_id.get(formula) for formula in mol_formulas]
        msm = [formula_i and msm_lookup.get(formula_i) for formula_i in formula_is]
        if adduct is not None:
            ranking_df = pd.DataFrame({'mol': mols, 'msm': msm}, index=formula_is)
            ranking_df = ranking_df[~ranking_df.msm.isna()]
        else:
            # Specific molecules don't matter in the decoy rankings, only their msm distribution
            ranking_df = pd.DataFrame({'msm': msm})
            ranking_df = ranking_df[~ranking_df.msm.isna()]

        return id, storage.put_cobject(serialise(ranking_df))

    decoy_adducts = sorted(set(DECOY_ADDUCTS).difference(config_db['adducts']))
    n_decoy_rankings = config_ds.get('num_decoys', len(decoy_adducts))
    msm_lookup = (
        formula_scores_df.msm.to_dict()
    )  # Ideally this data would stay in COS so it doesn't have to be reuploaded

    # Create a job for each list of molecules to be ranked
    ranking_jobs = []
    for group_i, (database, modifier) in enumerate(
        product(config_db['databases'], config_db['modifiers'])
    ):
        # Target and decoy rankings are treated differently. Decoy rankings are identified by not having an adduct.
        ranking_jobs.extend(
            (group_i, ranking_i, database, modifier, adduct)
            for ranking_i, adduct in enumerate(config_db['adducts'])
        )
        ranking_jobs.extend(
            (group_i, ranking_i, database, modifier, None) for ranking_i in range(n_decoy_rankings)
        )

    memory_capacity_mb = 1536
    futures = pw.map(build_ranking, ranking_jobs, runtime_memory=memory_capacity_mb)
    ranking_cobjects = [cobject for job_i, cobject in sorted(pw.get_result(futures))]
    PipelineStats.append_pywren(futures, memory_mb=memory_capacity_mb, cloud_objects_n=len(futures))

    rankings_df = pd.DataFrame(
        ranking_jobs, columns=['group_i', 'ranking_i', 'database_path', 'modifier', 'adduct']
    )
    rankings_df = rankings_df.assign(
        is_target=~rankings_df.adduct.isnull(), cobject=ranking_cobjects
    )

    return rankings_df


def calculate_fdrs(pw, rankings_df):
    def run_ranking(target_cobject, decoy_cobject, storage):
        target = read_cloud_object_with_retry(storage, target_cobject, deserialise)
        decoy = read_cloud_object_with_retry(storage, decoy_cobject, deserialise)
        merged = pd.concat([target.assign(is_target=1), decoy.assign(is_target=0)], sort=False)
        merged = merged.sort_values('msm', ascending=False)
        decoy_cumsum = (merged.is_target == False).cumsum()
        target_cumsum = merged.is_target.cumsum()
        base_fdr = np.clip(decoy_cumsum / target_cumsum, 0, 1)
        base_fdr[np.isnan(base_fdr)] = 1
        target_fdrs = merged.assign(fdr=base_fdr)[lambda df: df.is_target == 1]
        target_fdrs = target_fdrs.drop('is_target', axis=1)
        target_fdrs = target_fdrs.sort_values('msm')
        target_fdrs = target_fdrs.assign(fdr=np.minimum.accumulate(target_fdrs.fdr))
        target_fdrs = target_fdrs.sort_index()
        return target_fdrs

    def merge_rankings(target_row, decoy_cobjects, storage):
        print("Merging rankings...")
        print(target_row)
        rankings = [
            run_ranking(target_row.cobject, decoy_cobject, storage)
            for decoy_cobject in decoy_cobjects
        ]
        mols = (
            pd.concat(rankings)
            .rename_axis('formula_i')
            .reset_index()
            .groupby('formula_i')
            .agg({'fdr': np.nanmedian, 'mol': 'first'})
            .assign(
                database_path=target_row.database_path,
                adduct=target_row.adduct,
                modifier=target_row.modifier,
            )
        )
        return mols

    ranking_jobs = []
    for group_i, group in rankings_df.groupby('group_i'):
        target_rows = group[group.is_target]
        decoy_rows = group[~group.is_target]

        for i, target_row in target_rows.iterrows():
            ranking_jobs.append([target_row, decoy_rows.cobject.tolist()])

    memory_capacity_mb = 256
    futures = pw.map(merge_rankings, ranking_jobs, runtime_memory=memory_capacity_mb)
    results = pw.get_result(futures)
    PipelineStats.append_pywren(futures, memory_mb=memory_capacity_mb)

    return pd.concat(results)


def calculate_fdrs_vm(storage, formula_scores_df, db_data_cobjects):
    t = time()

    msms_df = formula_scores_df[['msm']]

    def run_fdr(db_data_cobject):
        db, fdr, formula_map_df = read_cloud_object_with_retry(
            storage, db_data_cobject, deserialise
        )

        formula_msm = formula_map_df.merge(
            msms_df, how='inner', left_on='formula_i', right_index=True
        )
        modifiers = fdr.target_modifiers_df[['neutral_loss', 'adduct']].rename(
            columns={'neutral_loss': 'modifier'}
        )
        results_df = (
            fdr.estimate_fdr(formula_msm)
            .assign(database_path=db)
            .set_index('formula_i')
            .rename(columns={'modifier': 'combined_modifier', 'formula': 'mol'})
            .merge(modifiers, left_on='combined_modifier', right_index=True)
            .drop(columns=['combined_modifier'])
        )
        return results_df

    logger.info('Estimating FDRs...')
    with ThreadPoolExecutor(os.cpu_count()) as pool:
        results_dfs = list(pool.map(run_fdr, db_data_cobjects))

    exec_time = time() - t
    return pd.concat(results_dfs), exec_time
