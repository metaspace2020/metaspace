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
from sm.engine.msm_basic.formula_imager_segm import compute_formula_images
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


def _complete_image_list(item):
    _, images = item
    return len(images) > 1 and images[0] is not None


def compute_fdr(fdr, formula_metrics_df, formula_images, formula_map_df, max_fdr=0.5):
    """ Compute fdr and filter formulas
    """
    moldb_ion_metrics_df = formula_metrics_df.join(formula_map_df.set_index('ion_formula'),
                                                   on='ion_formula', how='inner')
    formula_fdr_df = fdr.estimate_fdr(moldb_ion_metrics_df.set_index(['formula', 'adduct']).msm)
    moldb_ion_metrics_df = moldb_ion_metrics_df.join(formula_fdr_df, on=['formula', 'adduct'])
    moldb_ion_metrics_df = moldb_ion_metrics_df[moldb_ion_metrics_df.fdr <= max_fdr]

    moldb_ion_images = formula_images.filter(
        lambda formula_i_images: formula_i_images[0] in moldb_ion_metrics_df.index)
    return moldb_ion_metrics_df, moldb_ion_images


def extract_formula_centr_ints(centroids_df):
    sort_centr_df = centroids_df.reset_index().sort_values(by=['formula_i', 'peak_i'])
    values = sort_centr_df.int.values.reshape(-1, ISOTOPIC_PEAK_N)
    keys = sort_centr_df.formula_i.values[::ISOTOPIC_PEAK_N]
    centr_ints = dict(zip(keys, values))
    return centr_ints


class MSMSearch(object):

    def __init__(self, sc, ds_reader, moldbs, ds_config):
        self._sc = sc
        self._ds_config = ds_config
        self._ds_reader = ds_reader
        self._moldbs = moldbs
        self._sm_config = SMConfig.get_conf()
        self.metrics = OrderedDict([('chaos', 0), ('spatial', 0), ('spectral', 0),
                                    ('total_iso_ints', [0, 0, 0, 0]),
                                    ('min_iso_ints', [0, 0, 0, 0]),
                                    ('max_iso_ints', [0, 0, 0, 0])])

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
        logger.debug(f'formula_centroids_df size: {formula_centroids.centroids_df.shape}')

        # Run ion formula search
        formula_images = compute_formula_images(
            self._sc, self._ds_reader, formula_centroids.centroids_df, ppm=self._ppm)
        formula_images = formula_images.filter(_complete_image_list)

        # Score all ion formula images
        formula_centr_ints = extract_formula_centr_ints(formula_centroids.centroids_df)
        formula_metrics_df = formula_image_metrics(
            formula_images=formula_images, metrics=self.metrics,
            formula_centr_ints=formula_centr_ints,
            ds_config=self._ds_config, ds_reader=self._ds_reader, sc=self._sc)
        formula_metrics_df = formula_metrics_df[formula_metrics_df.msm > 0]
        formula_images = formula_images.filter(
            lambda formula_i_images: formula_i_images[0] in formula_metrics_df.index)

        formula_metrics_df = formula_metrics_df.join(formula_centroids.formulas_df, how='left')
        formula_metrics_df = formula_metrics_df.rename({'formula': 'ion_formula'}, axis=1)

        # Compute fdr for each moldb search results
        for moldb, fdr in moldb_fdr_list:
            moldb_formula_map_df = (ion_formula_map_df[ion_formula_map_df.moldb_id == moldb.id]
                                    .drop('moldb_id', axis=1))
            moldb_ion_metrics_df, moldb_ion_images = \
                compute_fdr(fdr, formula_metrics_df, formula_images, moldb_formula_map_df, max_fdr=0.5)
            yield moldb, moldb_ion_metrics_df, moldb_ion_images
