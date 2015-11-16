"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
import numpy as np
import json
from collections import OrderedDict


insert_sf_metrics_sql = 'INSERT INTO iso_image_metrics VALUES (%s, %s, %s, %s, %s, %s)'
insert_sf_iso_imgs_sql = 'INSERT INTO iso_image VALUES (%s, %s, %s, %s, %s, %s, %s, %s)'


class SearchResults(object):

    def __init__(self, job_id, db_id, sf_iso_images_map, sf_metrics_map, sf_adduct_peaksn, db):
        self.job_id, self.db_id = job_id, db_id
        self.db = db
        self.sf_adduct_peaksn = sf_adduct_peaksn
        self.sf_iso_images_map = sf_iso_images_map
        self.sf_metrics_map = sf_metrics_map

    def save_sf_img_metrics(self):
        rows = []
        for sf_i, metrics in self.sf_metrics_map.iteritems():
            sf_id, adduct, peaks_n = self.sf_adduct_peaksn[sf_i]
            metrics_json = json.dumps(OrderedDict(zip(['chaos', 'img_corr', 'pat_match'], metrics)))
            r = (self.job_id, self.db_id, sf_id, adduct, peaks_n, metrics_json)
            rows.append(r)

        self.db.insert(insert_sf_metrics_sql, rows)

    def save_sf_iso_images(self, nrows, ncols):
        rows = []
        for sf_i, img_list in self.sf_iso_images_map.iteritems():
            sf_id, adduct, _ = self.sf_adduct_peaksn[sf_i]

            for peak_i, img_sparse in enumerate(img_list):
                img_ints = np.zeros(int(nrows)*int(ncols)) if img_sparse is None else img_sparse.toarray().flatten()
                r = (self.job_id, self.db_id, sf_id, adduct, peak_i, img_ints.tolist(), img_ints.min(), img_ints.max())
                rows.append(r)

        self.db.insert(insert_sf_iso_imgs_sql, rows)
