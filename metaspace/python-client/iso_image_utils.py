import psycopg2
import psycopg2.extras
import yaml
import numpy as np
from os.path import dirname, join


config = yaml.load(open(join(dirname(__file__), 'config.yml')))

conn = psycopg2.connect(host=config['postgres']['host'],
                        database=config['postgres']['database'],
                        user=config['postgres']['user'],
                        password=config['postgres']['password'])
cur = conn.cursor(cursor_factory=psycopg2.extras.NamedTupleCursor)

sql = """select sf.sf, img.adduct, img.peak, img.pixel_inds, img.intensities, ds.img_bounds, m.msm, m.fdr
from iso_image img
join job j on j.id = img.job_id and j.db_id = img.db_id
join dataset ds on ds.id = j.ds_id
join iso_image_metrics m on img.job_id = m.job_id and img.db_id = m.db_id and img.sf_id = m.sf_id and img.adduct = m.adduct
join sum_formula sf on sf.db_id = img.db_id and sf.id = img.sf_id
join formula_db fdb on fdb.id = img.db_id
where fdb.name = %s and ds.name = %s and m.fdr <= 0.1
limit %s
"""


def fetch_iso_images(db_name, ds_name, limit=10):
    cur.execute(sql, [db_name, ds_name, limit])
    
    for r in cur.fetchall():
        rows = r.img_bounds['y']['max'] - r.img_bounds['y']['min'] + 1
        cols = r.img_bounds['x']['max'] - r.img_bounds['x']['min'] + 1
        img = np.zeros(cols * rows)
        img[np.array(r.pixel_inds)] = np.array(r.intensities)
        yield r.sf, r.adduct, r.peak, img.reshape(rows, cols)


if __name__ == '__main__':
    pass
    
