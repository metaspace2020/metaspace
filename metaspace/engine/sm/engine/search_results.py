import json
from collections import OrderedDict
import numpy as np
import logging
import requests

from sm.engine.png_generator import PngGenerator

logger = logging.getLogger('sm-engine')
METRICS_INS = 'INSERT INTO iso_image_metrics VALUES (%s, %s, %s, %s, %s, %s, %s, %s)'


class SearchResults(object):
    """ Container for molecule search results

    Args
    ----------
    sf_db_id : int
        Formula database id
    job_id : int
        Search job id
    metric_names: list
        Metric names
    """
    def __init__(self, sf_db_id, job_id, metric_names):
        self.sf_db_id = sf_db_id
        self.job_id = job_id
        self.metric_names = metric_names

    def _metrics_table_row_gen(self, job_id, db_id, metr_df, ion_img_ids):
        for ind, r in metr_df.reset_index().iterrows():
            m = OrderedDict((name, r[name]) for name in self.metric_names)
            metr_json = json.dumps(m)
            ids = ion_img_ids[(r.sf_id, r.adduct)]
            yield (job_id, db_id, r.sf_id, r.adduct,
                   float(r.msm), float(r.fdr), metr_json,
                   ids['iso_image_ids'])

    def store_ion_metrics(self, ion_metrics_df, ion_img_ids, db):
        """ Store formula image metrics and image ids in the database """
        logger.info('Storing iso image metrics')

        rows = list(self._metrics_table_row_gen(self.job_id, self.sf_db_id,
                                                ion_metrics_df, ion_img_ids))
        db.insert(METRICS_INS, rows)

    def _image_inserter(self, img_store, alpha_channel):
        png_generator = PngGenerator(alpha_channel, greyscale=True)

        def _post_images(imgs):
            imgs += [None] * (4 - len(imgs))

            iso_image_ids = [None] * 4
            for k, img in enumerate(imgs):
                if img is not None:
                    fp = png_generator.generate_png(img.toarray())
                    iso_image_ids[k] = img_store.post_image('iso_image', fp)
            return {
                'iso_image_ids': iso_image_ids
            }

        return _post_images

    def post_images_to_image_store(self, ion_iso_images, alpha_channel, img_store):
        logger.info('Posting iso images to {}'.format(img_store))
        post_images = self._image_inserter(img_store, alpha_channel)
        return dict(ion_iso_images.mapValues(post_images).collect())

    def store(self, ion_metrics_df, ion_iso_images, alpha_channel, db, img_store):
        """ Save metrics and images

        Args
        ---------
        ion_metrics_df : pandas.Dataframe
            sf_id, adduct, msm, fdr, individual metrics
        ion_iso_images : pyspark.RDD
            values must be lists of 2d intensity arrays (in coo_matrix format)
        alpha_channel : numpy.array
            Image alpha channel (2D, 0..1)
        db : sm.engine.DB
            database connection
        img_store : sm.engine.png_generator.ImageStoreServiceWrapper
            m/z image store
        """
        logger.info('Storing search results to the DB')
        ion_img_ids = self.post_images_to_image_store(ion_iso_images, alpha_channel, img_store)
        self.store_ion_metrics(ion_metrics_df, ion_img_ids, db)
