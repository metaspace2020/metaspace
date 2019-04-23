import json
from collections import OrderedDict
import numpy as np
import logging
import requests

from sm.engine.png_generator import PngGenerator

logger = logging.getLogger('engine')
METRICS_INS = ('INSERT INTO iso_image_metrics (job_id, db_id, sf, adduct, msm, fdr, stats, iso_image_ids) '
               'VALUES (%s, %s, %s, %s, %s, %s, %s, %s)')


def post_images_to_image_store(sc, formula_images, alpha_channel, img_store, img_store_type):
    logger.info('Posting iso images to {}'.format(img_store))
    png_generator = PngGenerator(alpha_channel, greyscale=True)

    def generate_png_and_post(imgs):
        imgs += [None] * (4 - len(imgs))

        iso_image_ids = [None] * 4
        for k, img in enumerate(imgs):
            if img is not None:
                fp = png_generator.generate_png(img.toarray())
                iso_image_ids[k] = img_store.post_image(img_store_type, 'iso_image', fp)
        return {
            'iso_image_ids': iso_image_ids
        }

    formula_images_rdd = sc.parallelize(formula_images.values(), numSlices=128)
    urls = formula_images_rdd.map(generate_png_and_post).collect()
    return dict(zip(formula_images.keys(), urls))


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

    def _metrics_table_row_gen(self, job_id, db_id, metr_df, formula_img_ids):
        for ind, r in metr_df.iterrows():
            m = OrderedDict((name, r[name]) for name in self.metric_names)
            metr_json = json.dumps(m)
            image_ids = formula_img_ids[r.formula_i]['iso_image_ids']
            yield (job_id, db_id, r.formula, r.adduct,
                   float(r.msm), float(r.fdr), metr_json,
                   image_ids)

    def store_ion_metrics(self, ion_metrics_df, ion_img_ids, db):
        """ Store formula image metrics and image ids in the database """
        logger.info('Storing iso image metrics')

        rows = list(self._metrics_table_row_gen(self.job_id, self.sf_db_id,
                                                ion_metrics_df.reset_index(),
                                                ion_img_ids))
        db.insert(METRICS_INS, rows)

    def store(self, metrics_df, formula_images, alpha_channel, db, sc, img_store, img_store_type):
        """ Save formula metrics and images

        Args
        ---------
        metrics_df : pandas.Dataframe
            formula, adduct, msm, fdr, individual metrics
        formula_images : pyspark.RDD
            values must be lists of 2d intensity arrays (in coo_matrix format)
        alpha_channel : numpy.array
            Image alpha channel (2D, 0..1)
        db : sm.engine.DB
            database connection
        sc : pyspark.context.SparkContext
            database connection
        img_store : sm.engine.png_generator.ImageStoreServiceWrapper
            m/z image store
        img_store_type: str
        """
        logger.info('Storing search results to the DB')
        formula_image_ids = post_images_to_image_store(sc, formula_images,
                                                       alpha_channel, img_store, img_store_type)
        self.store_ion_metrics(metrics_df, formula_image_ids, db)
