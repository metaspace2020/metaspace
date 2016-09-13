import psycopg2
import psycopg2.extras
import yaml
import numpy as np
import pandas as pd
from os.path import dirname, join


ISO_IMG_SEL = """select sf.sf, img.adduct, img.peak, img.pixel_inds, img.intensities, ds.img_bounds
from iso_image img
join job j on j.id = img.job_id and j.db_id = img.db_id
join dataset ds on ds.id = j.ds_id
join iso_image_metrics m on img.job_id = m.job_id and img.db_id = m.db_id and img.sf_id = m.sf_id and img.adduct = m.adduct
join sum_formula sf on sf.db_id = img.db_id and sf.id = img.sf_id
join formula_db fdb on fdb.id = img.db_id
where fdb.name = %s and ds.name = %s and m.fdr <= 0.1
order by m.msm DESC
limit %s
"""

ISO_METRICS_SEL = """select sf.sf, m.adduct, sf.subst_ids, sf.names, m.msm
from iso_image_metrics m
join job j on j.id = m.job_id and j.db_id = m.db_id
join dataset ds on ds.id = j.ds_id
join sum_formula sf on sf.db_id = m.db_id and sf.id = m.sf_id
join formula_db fdb on fdb.id = m.db_id
where fdb.name = %s and ds.name = %s and m.fdr <= 0.1
order by m.msm DESC
limit %s
"""


class IsoImgReader(object):
    
    def __init__(self):
        config = yaml.load(open(join(dirname(__file__), 'config.yml')))

        conn = psycopg2.connect(host=config['postgres']['host'],
                                database=config['postgres']['database'],
                                user=config['postgres']['user'],
                                password=config['postgres']['password'])
        self.cur = conn.cursor(cursor_factory=psycopg2.extras.NamedTupleCursor)


    def _fetch_iso_images(self, db_name, ds_name, limit=4*10):
        self.cur.execute(ISO_IMG_SEL, [db_name, ds_name, limit])
        
        for r in self.cur.fetchall():
            rows = r.img_bounds['y']['max'] - r.img_bounds['y']['min'] + 1
            cols = r.img_bounds['x']['max'] - r.img_bounds['x']['min'] + 1
            img = np.zeros(cols * rows)
            img[np.array(r.pixel_inds)] = np.array(r.intensities)
            yield r.sf, r.adduct, r.peak, img.reshape(rows, cols)


    def _fetch_iso_metrics(self, db_name, ds_name, limit=10):
        self.cur.execute(ISO_METRICS_SEL, [db_name, ds_name, limit])
        return self.cur.fetchall()


    def fetch_iso_images_with_data(self, db_name, ds_name, limit=10):
        img_df = pd.DataFrame(self._fetch_iso_images(db_name, ds_name, 4*limit),
                              columns=['sf', 'adduct', 'peak', 'iso_img']).sort_values(['sf', 'adduct', 'peak'])
        iso_images_ser = pd.Series(img_df.groupby(['sf', 'adduct']).apply(lambda df: df.iso_img.values),
                                   name='iso_images')
        img_metric_df = pd.DataFrame(self._fetch_iso_metrics(db_name, ds_name, limit),
                                     columns=['sf', 'adduct', 'ids', 'names', 'msm']).set_index(['sf', 'adduct'])
        img_metric_df['iso_images'] = iso_images_ser
        return img_metric_df.reset_index()

if __name__ == '__main__':
    pass
    
