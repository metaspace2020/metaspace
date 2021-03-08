import json
import logging
from collections import OrderedDict
from typing import List

import numpy as np
import pandas as pd
import pyspark

from sm.engine.config import SMConfig
from sm.engine.image_storage import ImageStorage
from sm.engine.db import DB
from sm.engine.ion_mapping import get_ion_id_mapping
from sm.engine.annotation.png_generator import PngGenerator

logger = logging.getLogger('engine')
METRICS_INS = (
    'INSERT INTO annotation ('
    '   job_id, formula, chem_mod, neutral_loss, adduct, msm, fdr, stats, iso_image_ids, ion_id'
    ') '
    'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)'
)


class SearchResults:
    """Container for molecule search results."""

    def __init__(self, ds_id: str, job_id: int, metric_names: List[str], n_peaks: int, charge: int):
        """
        Args:
            ds_id: dataset id
            job_id: annotation job id
            metric_names: list of metric names
            n_peaks: number of isotopic peaks
            charge: charge of ions
        """
        self.ds_id = ds_id
        self.job_id = job_id
        self.metric_names = metric_names
        self.n_peaks = n_peaks
        self.charge = charge

    def _metrics_table_row_gen(self, job_id, metr_df, ion_image_ids, ion_mapping):
        for _, row in metr_df.iterrows():
            m = OrderedDict((name, row[name]) for name in self.metric_names)
            metr_json = json.dumps(m)
            if row.formula_i not in ion_image_ids:
                logger.debug(f'Missing "formula_i": {row}, {ion_image_ids}')
            image_ids = ion_image_ids[row.formula_i]['iso_image_ids']
            yield (
                job_id,
                row.formula,
                row.chem_mod,
                row.neutral_loss,
                row.adduct,
                float(row.msm),
                float(row.fdr),
                metr_json,
                image_ids,
                ion_mapping[row.formula, row.chem_mod, row.neutral_loss, row.adduct],
            )

    def store_ion_metrics(self, ion_metrics_df, ion_image_ids, db):
        """Store ion metrics and iso image ids in the database."""

        logger.info('Storing iso image metrics')

        ions = ion_metrics_df[['formula', 'chem_mod', 'neutral_loss', 'adduct']]
        ion_tuples = list(ions.itertuples(False, None))
        ion_mapping = get_ion_id_mapping(db, ion_tuples, self.charge)

        rows = self._metrics_table_row_gen(
            self.job_id, ion_metrics_df.reset_index(), ion_image_ids, ion_mapping
        )
        db.insert(METRICS_INS, list(rows))

    def _post_images_to_image_store(self, ion_images_rdd, alpha_channel, n_peaks):
        logger.info('Posting iso images to image store')
        png_generator = PngGenerator(alpha_channel, greyscale=True)
        sm_config = SMConfig.get_conf()
        ds_id = self.ds_id

        def generate_png_and_post(partition):
            image_storage = ImageStorage(sm_config['image_storage'])

            for formula_i, imgs in partition:
                iso_image_ids = [None] * n_peaks
                for k, img in enumerate(imgs):
                    if img is not None:
                        img_bytes = png_generator.generate_png(img.toarray())
                        iso_image_ids[k] = image_storage.post_image(
                            ImageStorage.Type.ISO, ds_id, img_bytes
                        )

                yield formula_i, {'iso_image_ids': iso_image_ids}

        return dict(ion_images_rdd.mapPartitions(generate_png_and_post).collect())

    def store(
        self,
        metrics_df: pd.DataFrame,
        formula_images_rdd: pyspark.RDD,
        alpha_channel: np.ndarray,
        db: DB,
    ):
        """Store ion metrics and iso images.

        Args:
            metrics_df: formula, adduct, msm, fdr, individual metrics
            formula_images_rdd: collection of 2d intensity arrays (in coo_matrix format)
            alpha_channel: Image alpha channel (2D, 0..1)
            db: database connection
        """
        logger.info('Storing search results to the DB')
        ion_image_ids = self._post_images_to_image_store(
            formula_images_rdd, alpha_channel, self.n_peaks
        )
        self.store_ion_metrics(metrics_df, ion_image_ids, db)
