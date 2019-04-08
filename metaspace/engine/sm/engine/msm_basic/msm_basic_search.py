from collections import OrderedDict
from itertools import product
from pathlib import Path

import numpy as np
import pandas as pd
import logging

from sm.engine.fdr import FDR
from sm.engine.formula_parser import generate_ion_formula
from sm.engine.formula_centroids import CentroidsGenerator
from sm.engine.isocalc_wrapper import IsocalcWrapper, ISOTOPIC_PEAK_N
from sm.engine.util import SMConfig
from sm.engine.msm_basic.formula_img_validator import formula_image_metrics
from sm.engine.utils import ds_sample_gen, define_mz_segments, segment_centroids, segment_spectra, \
    create_process_segment

logger = logging.getLogger('engine')


def init_fdr(moldbs, target_adducts):
    """ Randomly select decoy adducts for each moldb and target adduct
    """
    moldb_fdr_list = []
    for moldb in moldbs:
        fdr = FDR(decoy_sample_size=20, target_adducts=target_adducts)
        target_ions = list(product(moldb.formulas, target_adducts))
        fdr.decoy_adducts_selection(target_ions)
        moldb_fdr_list.append((moldb, fdr))
    return moldb_fdr_list


def collect_ion_formulas(moldb_fdr_list):
    """ Collect all ion formulas that need to be searched for
    """
    ion_formula_map_list = []
    for moldb, fdr in moldb_fdr_list:
        for formula, adduct in fdr.ion_tuples():
            try:
                ion_formula = generate_ion_formula(formula, adduct)
                ion_formula_map_list.append((moldb.id, ion_formula, formula, adduct))
            except Exception as e:
                logger.debug(e)
    return pd.DataFrame(ion_formula_map_list,
                        columns=['moldb_id', 'ion_formula', 'formula', 'adduct'])


def compute_fdr(fdr, formula_metrics_df, formula_map_df, max_fdr=0.5):
    """ Compute fdr and filter formulas
    """
    moldb_ion_metrics_df = formula_metrics_df.join(formula_map_df.set_index('ion_formula'),
                                                   on='ion_formula', how='inner')
    formula_fdr_df = fdr.estimate_fdr(moldb_ion_metrics_df.set_index(['formula', 'adduct']).msm)
    moldb_ion_metrics_df = moldb_ion_metrics_df.join(formula_fdr_df, on=['formula', 'adduct'])
    moldb_ion_metrics_df = moldb_ion_metrics_df[moldb_ion_metrics_df.fdr <= max_fdr]

    return moldb_ion_metrics_df


# def segment_centroids(centr_df, mz_segments):
#     formula_segments = {}
#     for segm_i in range(len(mz_segments))[::-1]:
#         segm_min_mz, segm_max_mz = mz_segments[segm_i]
#
#         segm_df = centr_df[(~centr_df.formula_i.isin(formula_segments))
#                            & (centr_df.mz > segm_min_mz)
#                            & (centr_df.mz < segm_max_mz)]
#
#         by_fi = segm_df.groupby('formula_i').peak_i
#         formula_min_peak = by_fi.min()
#         formula_max_peak = by_fi.max()
#
#         formula_inds = set(formula_min_peak[formula_min_peak == 0].index)
#         formula_inds &= set(formula_max_peak[formula_max_peak > 0].index)
#
#         for f_i in formula_inds:
#             formula_segments[f_i] = segm_i
#     return formula_segments


class MSMSearch(object):

    def __init__(self, sc, imzml_parser, moldbs, ds_config):
        self._sc = sc
        self._ds_config = ds_config
        self._imzml_parser = imzml_parser
        self._moldbs = moldbs
        self._sm_config = SMConfig.get_conf()

        self._image_gen_config = ds_config['image_generation']
        self._target_adducts = ds_config['isotope_generation']['adducts']
        self._isotope_gen_config = self._ds_config['isotope_generation']

    def _fetch_formula_centroids(self, ion_formula_map_df):
        """ Generate/load centroids for all ions formulas
        """
        isocalc = IsocalcWrapper(self._isotope_gen_config)
        centroids_gen = CentroidsGenerator(sc=self._sc, isocalc=isocalc)
        ion_formulas = np.unique(ion_formula_map_df.ion_formula.values)
        return centroids_gen.generate_if_not_exist(formulas=ion_formulas.tolist())

    def search(self):
        """ Search, score, and compute FDR for all MolDB formulas

        Returns
        -----
            tuple[sm.engine.mol_db.MolecularDB, pandas.DataFrame, pyspark.rdd.RDD]
            (moldb, ion metrics, ion images)
        """
        logger.info('Running molecule search')

        moldb_fdr_list = init_fdr(self._moldbs, self._target_adducts)
        ion_formula_map_df = collect_ion_formulas(moldb_fdr_list)

        formula_centroids = self._fetch_formula_centroids(ion_formula_map_df)
        centroids_df = formula_centroids.centroids_df()
        formulas_df = formula_centroids.formulas_df
        logger.debug(f'formula_centroids_df size: {centroids_df.shape}')

        target_formulas_mask = ion_formula_map_df.adduct.isin(self._isotope_gen_config['adducts'])
        target_formulas = set(ion_formula_map_df[target_formulas_mask].ion_formula.values)
        target_formula_inds = set(formulas_df[formulas_df.formula.isin(target_formulas)].index)

        coordinates = [coo[:2] for coo in self._imzml_parser.coordinates]
        mz_segments = define_mz_segments(self._imzml_parser, centroids_df)

        mz_min, mz_max = mz_segments[0, 0], mz_segments[-1, 1]
        centr_df = (centroids_df[(mz_min < centroids_df.mz) & (centroids_df.mz < mz_max)]
                    .copy().reset_index())

        data_path = Path('/tmp/intsco')
        centr_segm_path = data_path / 'centr_segments'
        segment_centroids(centr_df, mz_segments, centr_segm_path)

        ds_segments_path = data_path / 'spectra_segments'
        segment_spectra(self._imzml_parser, coordinates, mz_segments, ds_segments_path)

        process_segment = create_process_segment(ds_segments_path, centr_segm_path,
                                                 coordinates, self._image_gen_config, target_formula_inds)
        segm_n = len(mz_segments)
        segm_rdd = self._sc.parallelize(range(segm_n), numSlices=segm_n)
        logger.info('Processing segments...')
        process_results = segm_rdd.map(process_segment).collect()

        formula_metrics_list, formula_images_list = zip(*process_results)
        formula_metrics_df = pd.concat(formula_metrics_list)
        formula_images = {}
        for images in formula_images_list:
            formula_images.update(images)

        formula_metrics_df = formula_metrics_df.join(formula_centroids.formulas_df, how='left')
        formula_metrics_df = formula_metrics_df.rename({'formula': 'ion_formula'}, axis=1)

        # Compute fdr for each moldb search results
        for moldb, fdr in moldb_fdr_list:
            moldb_formula_map_df = (ion_formula_map_df[ion_formula_map_df.moldb_id == moldb.id]
                                    .drop('moldb_id', axis=1))
            moldb_ion_metrics_df = compute_fdr(fdr, formula_metrics_df, moldb_formula_map_df, max_fdr=0.5)

            moldb_ion_images = {f_i: formula_images[f_i] for f_i in moldb_ion_metrics_df.index}

            yield moldb, moldb_ion_metrics_df, moldb_ion_images
