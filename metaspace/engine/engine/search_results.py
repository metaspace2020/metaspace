import numpy as np
import pandas as pd
import json
from operator import mul
from collections import OrderedDict
from datetime import datetime

from engine.util import logger
from engine.db import DB


METRICS_INS = 'INSERT INTO iso_image_metrics VALUES (%s, %s, %s, %s, %s, %s, %s, %s)'
SF_ISO_IMGS_INS = 'INSERT INTO iso_image VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)'
clear_iso_image_sql = 'DELETE FROM iso_image WHERE job_id = %s'
clear_iso_image_metrics_sql = 'DELETE FROM iso_image_metrics WHERE job_id = %s'


class SearchResults(object):
    """ Container for molecule search results

    Args
    ----------
    sf_db_id : int
        Formula database id
    ds_id : int
        Dataset id
    job_id : int
        Search job id
    sf_metrics_df : pandas.Dataframe
    sf_iso_images : pyspark.RDD
        Result images of format ((formula_id, adduct)), list of images)
    sf_adduct_peaksn : list
        List of triples (formula id, adduct, number of theoretical peaks)
    db: engine.db.DB
    sm_config: dict
    """
    def __init__(self, sf_db_id, ds_id, job_id, sf_metrics_df, sf_iso_images, sf_adduct_peaksn, db, sm_config):
        self.sf_db_id = sf_db_id
        self.ds_id = ds_id
        self.job_id = job_id
        self.db = db
        self.sm_config = sm_config
        self.sf_adduct_peaksn = sf_adduct_peaksn
        self.sf_iso_images = sf_iso_images
        self.sf_metrics_df = sf_metrics_df

    def clear_old_results(self):
        """ Clear all previous search results for the dataset from the database """
        logger.info('Clearing old job results')
        self.db.alter(clear_iso_image_sql, self.job_id)
        self.db.alter(clear_iso_image_metrics_sql, self.job_id)

    @staticmethod
    def _metrics_table_row_gen(job_id, db_id, metr_df, sf_adduct_peaksn):
        for ind, s in metr_df.reset_index().iterrows():
            metr_json = json.dumps(OrderedDict([('chaos', s.chaos), ('spatial', s.spatial), ('spectral', s.spectral)]))
            peaks_n = sf_adduct_peaksn[ind][2]
            yield (job_id, db_id, s.sf_id, s.adduct, s.msm, s.fdr, metr_json, peaks_n)

    def store_sf_img_metrics(self):
        """ Store formula image metrics in the database """
        logger.info('Storing iso image metrics')
        rows = list(self._metrics_table_row_gen(self.job_id, self.sf_db_id, self.sf_metrics_df, self.sf_adduct_peaksn))
        # TODO: for some unknown reason in some cases may be super slow (minutes)
        self.db.insert(METRICS_INS, rows)

    def store_sf_iso_images(self, nrows, ncols):
        """ Store formula images in the database

        Args
        -----------
        nrows : int
            Number of rows in the dataset image
        ncols : int
            Number of columns in the dataset image
        """
        job_id = self.job_id
        sf_db_id = self.sf_db_id
        db_config = self.sm_config['db']

        def iso_img_row_gen(((sf_id, adduct), img_list)):
            for peak_i, img_sparse in enumerate(img_list):
                img_ints = np.zeros(int(nrows)*int(ncols)) if img_sparse is None else img_sparse.toarray().flatten()
                pixel_inds = np.arange(img_ints.shape[0])
                img_ints_mask = img_ints > 0.001
                if img_ints_mask.sum() > 0:
                    yield (job_id, sf_db_id, sf_id, adduct, peak_i,
                           pixel_inds[img_ints_mask].tolist(), img_ints[img_ints_mask].tolist(),
                           img_ints.min(), img_ints.max())

        def store_iso_img_rows(row_it):
            db = DB(db_config)
            try:
                rows = list(row_it)
                if rows:
                    db.insert(SF_ISO_IMGS_INS, rows)
            finally:
                db.close()

        logger.info('Storing iso images')

        # self.sf_iso_images.flatMap(iso_img_row_gen).coalesce(32).foreachPartition(store_iso_img_rows)
        self.sf_iso_images.flatMap(iso_img_row_gen).foreachPartition(store_iso_img_rows)
