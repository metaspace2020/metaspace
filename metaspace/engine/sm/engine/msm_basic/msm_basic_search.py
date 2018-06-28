from collections import OrderedDict
import pandas as pd

from sm.engine.util import SMConfig
from sm.engine.msm_basic.formula_imager_segm import compute_sf_images
from sm.engine.msm_basic.formula_img_validator import sf_image_metrics
from sm.engine.search_algorithm import SearchAlgorithm

import logging
logger = logging.getLogger('engine')


class MSMBasicSearch(SearchAlgorithm):

    def __init__(self, sc, ds, ds_reader, mol_db, centr_gen, fdr, ds_config):
        super(MSMBasicSearch, self).__init__(sc, ds, ds_reader, mol_db, fdr, ds_config)
        self.metrics = OrderedDict([('chaos', 0), ('spatial', 0), ('spectral', 0),
                                    ('total_iso_ints', [0, 0, 0, 0]),
                                    ('min_iso_ints', [0, 0, 0, 0]),
                                    ('max_iso_ints', [0, 0, 0, 0])])
        self.max_fdr = 0.5
        self._centr_gen = centr_gen

    def search(self):
        """ Search for molecules in the dataset

        Returns
        -------
        : tuple
            (ion metrics DataFrame, ion image pyspark.RDD)
        """
        logger.info('Running molecule search')
        ion_centroids_df = self._centr_gen.centroids_subset(self._fdr.ion_tuples())
        ion_images = compute_sf_images(self._sc, self._ds_reader, ion_centroids_df,
                                       self.ds_config['image_generation']['ppm'])
        ion_metrics_df = self.calc_metrics(ion_images, ion_centroids_df)
        ion_metrics_fdr_df = self.estimate_fdr(ion_metrics_df)
        ion_metrics_fdr_df = self.filter_sf_metrics(ion_metrics_fdr_df)
        ion_images = self.filter_sf_images(ion_images, ion_metrics_fdr_df)

        return ion_metrics_fdr_df, ion_images

    def calc_metrics(self, sf_images, ion_centroids_df):
        ion_centr_ints = (ion_centroids_df.reset_index().groupby(['ion_i'])
                          .apply(lambda df: df.int.tolist()).to_dict())
        all_sf_metrics_df = sf_image_metrics(sf_images=sf_images, metrics=self.metrics, ds=self._ds,
                                             ds_reader=self._ds_reader, ion_centr_ints=ion_centr_ints, sc=self._sc)
        return all_sf_metrics_df

    def estimate_fdr(self, ion_metrics_df):
        ion_metrics_sf_adduct_df = ion_metrics_df.join(self._centr_gen.ion_df)
        sf_adduct_fdr_df = self._fdr.estimate_fdr(
            ion_metrics_sf_adduct_df.set_index(['sf', 'adduct']).msm)
        ion_metrics_sf_adduct_fdr_df = pd.merge(ion_metrics_sf_adduct_df.reset_index(),
                                                sf_adduct_fdr_df.reset_index(),
                                                how='inner', on=['sf', 'adduct']).set_index('ion_i')
        return ion_metrics_sf_adduct_fdr_df

    def filter_sf_metrics(self, sf_metrics_df):
        return sf_metrics_df[sf_metrics_df.fdr <= self.max_fdr]
