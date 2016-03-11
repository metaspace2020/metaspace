import numpy as np
import pandas as pd
import json
from collections import OrderedDict
from datetime import datetime

from engine.util import logger


METRICS_INS = 'INSERT INTO iso_image_metrics VALUES (%s, %s, %s, %s, %s, %s, %s, %s)'
insert_sf_iso_imgs_sql = 'INSERT INTO iso_image VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)'
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
    sf_iso_images_map : dict
        Result images of format (formula id -> list of images)
    sf_metrics_map : dict
        Result images of format (formula id -> list of quality metrics)
    sf_adduct_peaksn : list
        List of triples (formula id, adduct, number of theoretical peaks)
    db: engine.db.DB
    """
    def __init__(self, sf_db_id, ds_id, job_id, sf_metrics_df, sf_iso_images_map, sf_adduct_peaksn, db):
        self.sf_db_id = sf_db_id
        self.ds_id = ds_id
        self.job_id = job_id
        self.db = db
        self.sf_adduct_peaksn = sf_adduct_peaksn
        self.sf_iso_images_map = sf_iso_images_map
        self.sf_metrics_df = sf_metrics_df

    def clear_old_results(self):
        """ Clear all previous search results for the dataset from the database """
        logger.info('Clearing old job results')
        self.db.alter(clear_iso_image_sql, self.job_id)
        self.db.alter(clear_iso_image_metrics_sql, self.job_id)

    @staticmethod
    def _metrics_table_row_gen(job_id, db_id, metr_df, sf_adduct_peaksn):
        for ind, s in metr_df.iterrows():
            metr_json = json.dumps({'chaos': s.chaos, 'spatial': s.spatial, 'spectral': s.spectral})
            peaks_n = sf_adduct_peaksn[ind][2]
            yield (job_id, db_id, s.sf_id, s.adduct, s.msm, s.fdr, metr_json, peaks_n)

    def store_sf_img_metrics(self):
        """ Store formula image metrics in the database """
        logger.info('Storing iso image metrics')
        # rows = []
        # for sf_i, metrics in self.sf_metrics_map.iteritems():
        #     sf_id, adduct, peaks_n = self.sf_adduct_peaksn[sf_i]
        #     metrics_json = json.dumps(OrderedDict(zip(['chaos', 'img_corr', 'pat_match'], metrics)))
        #     r = (self.job_id, self.sf_db_id, sf_id, adduct, peaks_n, metrics_json)
        #     rows.append(r)
        # metr_df = self.sf_metrics_df.join(pd.Series(self.sf_adduct_peaksn, name='peaks_n'))
        rows = list(self._metrics_table_row_gen(self.job_id, self.sf_db_id, self.sf_metrics_df, self.sf_adduct_peaksn))
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
        logger.info('Storing iso images')
        rows = []
        for sf_i, img_list in self.sf_iso_images_map.iteritems():
            sf_id, adduct, _ = self.sf_adduct_peaksn[sf_i]

            for peak_i, img_sparse in enumerate(img_list):
                img_ints = np.zeros(int(nrows)*int(ncols)) if img_sparse is None else img_sparse.toarray().flatten()
                pixel_inds = np.arange(img_ints.shape[0])
                r = (self.job_id, self.sf_db_id, sf_id, adduct, peak_i,
                     pixel_inds[img_ints > 0.001].tolist(), img_ints[img_ints > 0.001].tolist(),
                     img_ints.min(), img_ints.max())
                rows.append(r)

        self.db.insert(insert_sf_iso_imgs_sql, rows)
