from collections import OrderedDict
from itertools import product
import numpy as np
import pandas as pd
import logging

from sm.engine.fdr import FDR
from sm.engine.formula_parser import generate_ion_formula
from sm.engine.formula_centroids import CentroidsGenerator
from sm.engine.isocalc_wrapper import IsocalcWrapper, ISOTOPIC_PEAK_N
from sm.engine.util import SMConfig
from sm.engine.msm_basic.formula_imager_segm import gen_iso_images
from sm.engine.msm_basic.formula_img_validator import formula_image_metrics

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


def segment_centroids(centr_df, mz_segments):
    formula_segments = {}
    for segm_i in range(len(mz_segments))[::-1]:
        segm_min_mz, segm_max_mz = mz_segments[segm_i]

        segm_df = centr_df[(~centr_df.formula_i.isin(formula_segments))
                           & (centr_df.mz > segm_min_mz)
                           & (centr_df.mz < segm_max_mz)]

        by_fi = segm_df.groupby('formula_i').peak_i
        formula_min_peak = by_fi.min()
        formula_max_peak = by_fi.max()

        formula_inds = set(formula_min_peak[formula_min_peak == 0].index)
        formula_inds &= set(formula_max_peak[formula_max_peak > 0].index)

        for f_i in formula_inds:
            formula_segments[f_i] = segm_i
    return formula_segments


class MSMSearch(object):

    def __init__(self, sc, ds_reader, moldbs, ds_config):
        self._sc = sc
        self._ds_config = ds_config
        self._ds_reader = ds_reader
        self._moldbs = moldbs
        self._sm_config = SMConfig.get_conf()

        self._ppm = ds_config['image_generation']['ppm']
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
        logger.debug(f'formula_centroids_df size: {formula_centroids.centroids_df().shape}')

        search_images_compute_metrics

        # Run ion formula search
        # formula_images = compute_formula_images(
        #     self._sc, self._ds_reader, formula_centroids.centroids_df(), ppm=self._ppm)
        # sp_indices_brcast = self._sc.broadcast(self._ds_reader.get_norm_img_pixel_inds())
        # centroids_df_brcast = self._sc.broadcast(formula_centroids.centroids_df())
        # nrows, ncols = self._ds_reader.get_dims()

        # spectra_rdd = self._ds_reader.get_spectra()
        # spectra = spectra_rdd.collect()


        # formula_metrics_df, formula_images = \
        #     formula_image_metrics(formula_images_gen, formula_centroids, self._ds_config, self._ds_reader, self._sc)

        # Score all ion formula images
        # centroids_ints = formula_centroids.centroids_ints()
        # formula_metrics_df = formula_image_metrics(
        #     formula_images_gen=formula_images_gen,
        #     formula_centroids=formula_centroids,
        #     ds_config=self._ds_config, ds_reader=self._ds_reader, sc=self._sc)
        # valid_formula_inds = set(formula_metrics_df.index)
        # formula_images = formula_images.filter(
        #     lambda formula_i_images: formula_i_images[0] in valid_formula_inds)
        # formula_images.cache()

        formula_metrics_df = formula_metrics_df.join(formula_centroids.formulas_df, how='left')
        formula_metrics_df = formula_metrics_df.rename({'formula': 'ion_formula'}, axis=1)

        # Compute fdr for each moldb search results
        for moldb, fdr in moldb_fdr_list:
            moldb_formula_map_df = (ion_formula_map_df[ion_formula_map_df.moldb_id == moldb.id]
                                    .drop('moldb_id', axis=1))
            moldb_ion_metrics_df = compute_fdr(fdr, formula_metrics_df, moldb_formula_map_df, max_fdr=0.5)

            moldb_ion_images = {f_i: formula_images[f_i] for f_i in moldb_ion_metrics_df.index}

            yield moldb, moldb_ion_metrics_df, moldb_ion_images
