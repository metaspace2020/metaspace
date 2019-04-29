from itertools import product
import numpy as np
import pandas as pd
import logging

from sm.engine.fdr import FDR
from sm.engine.formula_parser import generate_ion_formula
from sm.engine.formula_centroids import CentroidsGenerator
from sm.engine.isocalc_wrapper import IsocalcWrapper, ISOTOPIC_PEAK_N
from sm.engine.util import SMConfig
from sm.engine.msm_basic.formula_imager import create_process_segment
from sm.engine.msm_basic.segmenter import define_ds_segments, segment_spectra, segment_centroids

logger = logging.getLogger('engine')


def init_fdr(moldbs, target_adducts):
    """ Randomly select decoy adducts for each moldb and target adduct
    """
    logger.info('Selecting decoy adducts')
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
    logger.info('Collecting ion formulas')
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


def merge_results(results, formulas_df):
    logger.info('Merging search results')

    formula_metrics_list, formula_images_list = zip(*results)
    formula_metrics_df = pd.concat(formula_metrics_list)
    formula_images = {}
    for images in formula_images_list:
        formula_images.update(images)

    formula_metrics_df = formula_metrics_df.join(formulas_df, how='left')
    formula_metrics_df = formula_metrics_df.rename({'formula': 'ion_formula'}, axis=1)  # needed for fdr

    return formula_metrics_df, formula_images


class MSMSearch(object):

    def __init__(self, sc, imzml_parser, moldbs, ds_config, ds_data_path):
        self._sc = sc
        self._ds_config = ds_config
        self._imzml_parser = imzml_parser
        self._moldbs = moldbs
        self._sm_config = SMConfig.get_conf()
        self._ds_data_path = ds_data_path

        self._image_gen_config = ds_config['image_generation']
        self._target_adducts = ds_config['isotope_generation']['adducts']
        self._isotope_gen_config = self._ds_config['isotope_generation']

    def _fetch_formula_centroids(self, ion_formula_map_df):
        """ Generate/load centroids for all ions formulas
        """
        logger.info('Fetching formula centroids')
        isocalc = IsocalcWrapper(self._isotope_gen_config)
        centroids_gen = CentroidsGenerator(sc=self._sc, isocalc=isocalc)
        ion_formulas = np.unique(ion_formula_map_df.ion_formula.values)
        formula_centroids = centroids_gen.generate_if_not_exist(formulas=ion_formulas.tolist())
        logger.debug(f'Formula centroids df size: {formula_centroids.centroids_df().shape}')
        return formula_centroids

    def process_segments(self, centr_segm_n, func):
        segm_rdd = self._sc.parallelize(range(centr_segm_n), numSlices=centr_segm_n)
        return segm_rdd.map(func).collect()

    @staticmethod
    def clip_centroids_df(centroids_df, mz_min, mz_max):
        ds_mz_range_unique_formulas = centroids_df[(mz_min < centroids_df.mz) &
                                                   (centroids_df.mz < mz_max)].index.unique()
        centr_df = centroids_df[centroids_df.index.isin(ds_mz_range_unique_formulas)].reset_index().copy()
        return centr_df

    def select_target_formula_ids(self, formulas_df, ion_formula_map_df):
        logger.info('Selecting target formula ids')
        target_formulas_mask = ion_formula_map_df.adduct.isin(self._isotope_gen_config['adducts'])
        target_formulas = set(ion_formula_map_df[target_formulas_mask].ion_formula.values)
        target_formula_inds = set(formulas_df[formulas_df.formula.isin(target_formulas)].index)
        return target_formula_inds

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

        target_formula_inds = self.select_target_formula_ids(formulas_df, ion_formula_map_df)

        coordinates = [coo[:2] for coo in self._imzml_parser.coordinates]
        ds_segm_size_mb = 5
        ds_segments = define_ds_segments(self._imzml_parser, sample_ratio=0.05, ds_segm_size_mb=ds_segm_size_mb)

        ds_segments_path = self._ds_data_path / 'ds_segments'
        segment_spectra(self._imzml_parser, coordinates, ds_segments, ds_segments_path)

        centr_df = self.clip_centroids_df(centroids_df, mz_min=ds_segments[0, 0], mz_max=ds_segments[-1, 1])

        centr_segments_path = self._ds_data_path / 'centr_segments'
        ds_size_mb = len(ds_segments) * ds_segm_size_mb
        data_per_centr_segm_mb = 50
        peaks_per_centr_segm = 1e4
        centr_segm_n = int(max(ds_size_mb // data_per_centr_segm_mb,
                               centr_df.shape[0] // peaks_per_centr_segm,
                               32))
        segment_centroids(centr_df, centr_segm_n, centr_segments_path)

        process_centr_segment = create_process_segment(ds_segments, ds_segments_path, centr_segments_path,
                                                       coordinates, self._image_gen_config, target_formula_inds)
        logger.info('Processing segments...')
        results = self.process_segments(centr_segm_n, process_centr_segment)
        formula_metrics_df, formula_images = merge_results(results, formula_centroids.formulas_df)

        # Compute fdr for each moldb search results
        for moldb, fdr in moldb_fdr_list:
            moldb_formula_map_df = (ion_formula_map_df[ion_formula_map_df.moldb_id == moldb.id]
                                    .drop('moldb_id', axis=1))
            moldb_ion_metrics_df = compute_fdr(fdr, formula_metrics_df, moldb_formula_map_df, max_fdr=0.5)
            moldb_ion_images = {f_i: formula_images[f_i] for f_i in moldb_ion_metrics_df.index}
            yield moldb, moldb_ion_metrics_df, moldb_ion_images
