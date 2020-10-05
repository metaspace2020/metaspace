from itertools import repeat
from concurrent.futures import ThreadPoolExecutor
import pandas as pd
import hashlib
import math

from sm.engine.serverless.formula_parser import safe_generate_ion_formula
from sm.engine.serverless.utils import (
    logger,
    PipelineStats,
    serialise,
    deserialise,
    read_cloud_object_with_retry,
)

DECOY_ADDUCTS = [
    '+He',
    '+Li',
    '+Be',
    '+B',
    '+C',
    '+N',
    '+O',
    '+F',
    '+Ne',
    '+Mg',
    '+Al',
    '+Si',
    '+P',
    '+S',
    '+Cl',
    '+Ar',
    '+Ca',
    '+Sc',
    '+Ti',
    '+V',
    '+Cr',
    '+Mn',
    '+Fe',
    '+Co',
    '+Ni',
    '+Cu',
    '+Zn',
    '+Ga',
    '+Ge',
    '+As',
    '+Se',
    '+Br',
    '+Kr',
    '+Rb',
    '+Sr',
    '+Y',
    '+Zr',
    '+Nb',
    '+Mo',
    '+Ru',
    '+Rh',
    '+Pd',
    '+Ag',
    '+Cd',
    '+In',
    '+Sn',
    '+Sb',
    '+Te',
    '+I',
    '+Xe',
    '+Cs',
    '+Ba',
    '+La',
    '+Ce',
    '+Pr',
    '+Nd',
    '+Sm',
    '+Eu',
    '+Gd',
    '+Tb',
    '+Dy',
    '+Ho',
    '+Ir',
    '+Th',
    '+Pt',
    '+Os',
    '+Yb',
    '+Lu',
    '+Bi',
    '+Pb',
    '+Re',
    '+Tl',
    '+Tm',
    '+U',
    '+W',
    '+Au',
    '+Er',
    '+Hf',
    '+Hg',
    '+Ta',
]
N_FORMULAS_SEGMENTS = 256
N_HASH_CHUNKS = 32  # should be less than N_FORMULAS_SEGMENTS


def calculate_centroids(fexec, formula_cobjects, ds_config):
    polarity = ds_config['polarity']
    isocalc_sigma = ds_config['isocalc_sigma']

    def calculate_peaks_for_formula(formula_i, formula):
        mzs, ints = isocalc_wrapper.centroids(formula)
        if mzs is not None:
            return list(zip(repeat(formula_i), range(len(mzs)), mzs, ints))
        else:
            return []

    def calculate_peaks_chunk(segm_i, segm_cobject, storage):
        print(f'Calculating peaks from formulas chunk {segm_i}')
        chunk_df = deserialise(storage.get_cobject(segm_cobject, stream=True))
        peaks = [
            peak
            for formula_i, formula in chunk_df.items()
            for peak in calculate_peaks_for_formula(formula_i, formula)
        ]
        peaks_df = pd.DataFrame(peaks, columns=['formula_i', 'peak_i', 'mz', 'int'])
        peaks_df.set_index('formula_i', inplace=True)

        print(f'Storing centroids chunk {id}')
        peaks_cobject = storage.put_cobject(serialise(peaks_df))

        return peaks_cobject, peaks_df.shape[0]

    from sm.engine.serverless.isocalc_wrapper import (
        IsocalcWrapper,
    )  # Import lazily so that the rest of the pipeline still works if the dependency is missing

    isocalc_wrapper = IsocalcWrapper(
        {
            # These instrument settings are usually customized on a per-dataset basis out of a set of
            # 18 possible combinations, but most of EMBL's datasets are compatible with the following settings:
            'charge': {'polarity': polarity, 'n_charges': 1,},
            'isocalc_sigma': float(
                f"{isocalc_sigma:f}"
            ),  # Rounding to match production implementation
        }
    )

    memory_capacity_mb = 2048
    futures = fexec.map(
        calculate_peaks_chunk, list(enumerate(formula_cobjects)), runtime_memory=memory_capacity_mb
    )
    results = fexec.get_result(futures)
    PipelineStats.append_pywren(futures, memory_mb=memory_capacity_mb, cloud_objects_n=len(futures))

    num_centroids = sum(count for cobj, count in results)
    n_centroids_chunks = len(results)
    peaks_cobjects = [cobj for cobj, count in results]
    logger.info(f'Calculated {num_centroids} centroids in {n_centroids_chunks} chunks')
    return peaks_cobjects


def upload_mol_dbs_from_dir(storage, databases_paths):
    def _upload(path):
        mol_sfs = sorted(set(pd.read_csv(path).sf))
        return storage.put_cobject(serialise(mol_sfs))

    with ThreadPoolExecutor() as pool:
        mol_dbs_cobjects = list(pool.map(_upload, databases_paths))

    return mol_dbs_cobjects


def validate_formula_cobjects(storage, formula_cobjects):
    segms = [deserialise(storage.get_cobject(co, stream=True)) for co in formula_cobjects]

    formula_sets = []
    index_sets = []
    # Check format
    for segm_i, segm in enumerate(segms):
        if not isinstance(segm, pd.Series):
            print(f'formula_cobjects[{segm_i}] is not a pd.Series')
        else:
            if segm.empty:
                print(f'formula_cobjects[{segm_i}] is empty')
            if segm.name != "ion_formula":
                print(f'formula_cobjects[{segm_i}].name != "ion_formula"')
            if not isinstance(segm.index, pd.RangeIndex):
                print(f'formula_cobjects[{segm_i}] is not a pd.RangeIndex')
            if segm.index.name != "formula_i":
                print(f'formula_cobjects[{segm_i}].index.name != "formula_i"')
            if (segm == '').any():
                print(f'formula_cobjects[{segm_i}] contains an empty string')
            if any(not isinstance(s, str) for s in segm):
                print(f'formula_cobjects[{segm_i}] contains non-string values')
            duplicates = segm[segm.duplicated()]
            if not duplicates.empty:
                print(f'formula_cobjects[{segm_i}] contains {len(duplicates)} duplicate values')

            formula_sets.append(set(segm))
            index_sets.append(set(segm.index))

    if sum(len(fs) for fs in formula_sets) != len(set().union(*formula_sets)):
        print(f'formula_cobjects contains values that are included in multiple segments')
    if sum(len(idxs) for idxs in index_sets) != len(set().union(*index_sets)):
        print(f'formula_cobjects contains formula_i values that are included in multiple segments')

    n_formulas = sum(len(fs) for fs in formula_sets)
    print(f'Found {n_formulas} formulas across {len(segms)} segms')

    # __import__('__main__').db_segms = db_segms


def validate_peaks_cobjects(fexec, peaks_cobjects):
    def get_segm_stats(storage, segm_cobject):
        segm = deserialise(storage.get_cobject(segm_cobject, stream=True))
        n_peaks = segm.groupby(level='formula_i').peak_i.count()
        formula_is = segm.index.unique()
        stats = pd.Series(
            {
                'min_mz': segm.mz.min(),
                'max_mz': segm.mz.max(),
                'min_formula_i': segm.index.min(),
                'max_formula_i': segm.index.max(),
                'avg_n_peaks': n_peaks.mean(),
                'min_n_peaks': n_peaks.min(),
                'max_n_peaks': n_peaks.max(),
                'max_int': segm.int.max(),
                'missing_peaks': (
                    segm.loc[n_peaks.index[n_peaks != 4]]
                    .groupby(level='formula_i')
                    .peak_i.apply(lambda peak_is: len(set(range(len(peak_is))) - set(peak_is)))
                    .sum()
                ),
                'n_formulas': len(formula_is),
                'n_peaks': len(segm),
            }
        )
        return formula_is, stats

    futures = fexec.map(get_segm_stats, peaks_cobjects, runtime_memory=1024)
    results = fexec.get_result(futures)
    segm_formula_is = [formula_is for formula_is, stats in results]
    stats_df = pd.DataFrame([stats for formula_is, stats in results])

    try:
        __import__('__main__').peaks_cobjects = stats_df
        logger.info('validate_peaks_cobjects debug info written to "peaks_cobjects" variable')
    except:
        pass

    with pd.option_context(
        'display.max_rows', None, 'display.max_columns', None, 'display.width', 1000
    ):
        # Report cases with fewer peaks than expected (indication that formulas are being split between multiple segments)
        wrong_n_peaks = stats_df[
            (stats_df.avg_n_peaks < 3.9) | (stats_df.min_n_peaks < 2) | (stats_df.max_n_peaks > 4)
        ]
        if not wrong_n_peaks.empty:
            logger.warning(
                'segment_centroids produced segments with unexpected peaks-per-formula (should be almost always 4, occasionally 2 or 3):'
            )
            logger.warning(wrong_n_peaks)

        # Report missing peaks
        missing_peaks = stats_df[stats_df.missing_peaks > 0]
        if not missing_peaks.empty:
            logger.warning('segment_centroids produced segments with missing peaks:')
            logger.warning(missing_peaks)

    formula_in_segms_df = pd.DataFrame(
        [
            (formula_i, segm_i)
            for segm_i, formula_is in enumerate(segm_formula_is)
            for formula_i in formula_is
        ],
        columns=['formula_i', 'segm_i'],
    )
    formulas_in_multiple_segms = (formula_in_segms_df.groupby('formula_i').segm_i.count() > 1)[
        lambda s: s
    ].index
    formulas_in_multiple_segms_df = formula_in_segms_df[
        lambda df: df.formula_i.isin(formulas_in_multiple_segms)
    ].sort_values('formula_i')

    n_per_segm = formula_in_segms_df.groupby('segm_i').formula_i.count()
    if not formulas_in_multiple_segms_df.empty:
        logger.warning('segment_centroids produced put the same formula in multiple segments:')
        logger.warning(formulas_in_multiple_segms_df)

    print(
        f'Found {stats_df.n_peaks.sum()} peaks for {stats_df.n_formulas.sum()} formulas across {len(peaks_cobjects)} segms'
    )
    print(f'Segm sizes range from {n_per_segm.min()} to {n_per_segm.max()}')
