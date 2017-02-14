import json
from collections import OrderedDict
import numpy as np
import logging
import requests

from sm.engine.db import DB
from sm.engine.util import SMConfig
from sm.engine.png_generator import PngGenerator, ImageStoreServiceWrapper

logger = logging.getLogger('sm-engine')
METRICS_INS = 'INSERT INTO iso_image_metrics VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)'


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
    ds: engine.dataset.Dataset
    db: engine.db.DB
    ds_config: dict
    """
    def __init__(self, sf_db_id, job_id, metrics,
                 ds, db, ds_config):
        self.sf_db_id = sf_db_id
        self.job_id = job_id
        self.metrics = metrics
        self.ds = ds
        self.db = db
        self.sm_config = SMConfig.get_conf()
        self.ds_config = ds_config

    @staticmethod
    def _metrics_table_row_gen(job_id, db_id, metr_df, ion_img_urls, metrics):
        for ind, r in metr_df.reset_index().iterrows():
            metr_json = json.dumps(OrderedDict([(m, float(r[m])) for m in metrics]))
            urls = ion_img_urls[(r.sf_id, r.adduct)]
            yield (job_id, db_id, r.sf_id, r.adduct,
                   float(r.msm), float(r.fdr), metr_json,
                   None, urls['iso_image_urls'], urls['ion_image_url'])

    def store_ion_metrics(self, ion_metrics_df, ion_img_urls):
        """ Store formula image metrics in the database """
        logger.info('Storing iso image metrics')

        rows = list(self._metrics_table_row_gen(self.job_id, self.sf_db_id,
                                                ion_metrics_df, ion_img_urls,
                                                self.metrics))
        self.db.insert(METRICS_INS, rows)

    def _get_post_images(self):
        png_generator = PngGenerator(self.ds.coords, greyscale=True)
        img_store = ImageStoreServiceWrapper(self.sm_config['services']['iso_images'])

        def _post_images(imgs):
            imgs += [None] * (4 - len(imgs))

            # ion image
            fp = png_generator.generate_png(sum(filter(lambda i: i is not None, imgs)).toarray())
            ion_image_url = img_store.post_image(fp)

            # isotopic images
            iso_image_urls = []
            for img in imgs:
                if img is None:
                    iso_image_urls.append(None)
                else:
                    fp = png_generator.generate_png(img.toarray())
                    iso_image_urls.append(img_store.post_image(fp))
            return {
                'ion_image_url': ion_image_url,
                'iso_image_urls': iso_image_urls
            }

        return _post_images

    def post_images_to_image_store(self, ion_iso_images):
        logger.info('Posting iso images to {}'.format(self.sm_config['services']['iso_images']))
        post_images = self._get_post_images()
        return dict(ion_iso_images.mapValues(lambda imgs: post_images(imgs)).collect())

    def store(self, ion_metrics_df, ion_iso_images):
        logger.info('Storing search results to the DB')
        ion_img_urls = self.post_images_to_image_store(ion_iso_images)
        self.store_ion_metrics(ion_metrics_df, ion_img_urls)
