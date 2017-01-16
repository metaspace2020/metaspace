import json
from collections import OrderedDict
import numpy as np
import logging
import requests

from sm.engine.db import DB


logger = logging.getLogger('sm-engine')

METRICS_INS = 'INSERT INTO iso_image_metrics VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)'


class SearchResults(object):
    """ Container for molecule search results

    Args
    ----------
    sf_db_id : int
        Formula database id
    ds_id : str
        Dataset unique identifier
    job_id : int
        Search job id
    metrics: list
        Metric names
    sf_adduct_peaksn : list
        List of triples (formula id, adduct, number of theoretical peaks)
    db: engine.db.DB
    sm_config: dict
    """
    def __init__(self, sf_db_id, ds_id, job_id, metrics,
                 sf_adduct_peaksn, db, sm_config, ds_config):
        self.sf_db_id = sf_db_id
        self.ds_id = ds_id
        self.job_id = job_id
        self.metrics = metrics
        self.db = db
        self.sm_config = sm_config
        self.ds_config = ds_config
        self.sf_adduct_peaksn = sf_adduct_peaksn
        self.sf_iso_images = None
        self.sf_metrics_df = None

    def set_metrics_images(self, sf_metrics_df, sf_iso_images):
        """ Set metrics and images fields

        Args
        ----------
        sf_metrics_df : pandas.Dataframe
        sf_iso_images : dict
            (sf_id, adduct) -> [image uri]
        """
        self.sf_metrics_df = sf_metrics_df
        self.sf_iso_images = sf_iso_images

    @staticmethod
    def _metrics_table_row_gen(job_id, db_id, metr_df, sf_iso_images, sf_adduct_peaksn, metrics):
        for ind, r in metr_df.reset_index().iterrows():
            metr_json = json.dumps(OrderedDict([(m, float(r[m])) for m in metrics]))
            peaks_n = sf_adduct_peaksn[ind][2]
            ion_img_urls = sf_iso_images[(r.sf_id, r.adduct)]
            yield (job_id, db_id, r.sf_id, r.adduct,
                   float(r.msm), float(r.fdr), metr_json,
                   peaks_n, ion_img_urls)

    def store_sf_img_metrics(self):
        """ Store formula image metrics in the database """
        logger.info('Storing iso image metrics')

        rows = list(self._metrics_table_row_gen(self.job_id, self.sf_db_id,
                                                self.sf_metrics_df, self.sf_iso_images,
                                                self.sf_adduct_peaksn, self.metrics))
        self.db.insert(METRICS_INS, rows)

    def store(self):
        logger.info('Storing search results to the DB')
        self.store_sf_img_metrics()