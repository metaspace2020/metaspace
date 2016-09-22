from elasticsearch import Elasticsearch
from elasticsearch_dsl import Search
import psycopg2
import psycopg2.extras
import pandas as pd
import numpy as np
import json
import re

from cpyMSpec import isotopePattern, InstrumentModel

ISO_IMG_SEL = """select img.peak, img.pixel_inds, img.intensities, ds.img_bounds
from iso_image img
join job j on j.id = img.job_id and j.db_id = img.db_id
join dataset ds on ds.id = j.ds_id
join sum_formula sf on sf.db_id = img.db_id and sf.id = img.sf_id
join formula_db fdb on fdb.id = img.db_id
where ds.name = %s and sf.sf = %s and img.adduct = %s
order by img.peak
"""

class IsotopeImages(object):
    def __init__(self, images, sf, adduct, centroids):
        self._images = images
        self._sf = sf
        self._adduct = adduct
        self._centroids = centroids

    def __getitem__(self, index):
        return self._images[index]

    def __repr__(self):
        return "IsotopeImages({}{})".format(self._sf, self._adduct)

    def __len__(self):
        return len(self._images)

    def peak(self, index):
        return self._centroids[index]

    def plot(self, n_images=-1):
        import matplotlib.pyplot as plt
        if n_images > 0:
            n_images = min(n_images, len(self))
        else:
            n_images = len(self)
        for i in range(n_images):
            plt.subplot(1, len(self._images), i + 1)
            plt.title(round(self.peak(i)[0], 3))
            plt.axis('off')
            plt.imshow(self._images[i], interpolation='none', cmap='viridis')

class SMDataset(object):
    def __init__(self, dataset_name, db_cursor, es_client, index_name):
        self._name = dataset_name
        self._config = None
        self._db_cursor = db_cursor
        es_search = Search(using=es_client, index=index_name)
        self._es_query = es_search.query('term', ds_name=dataset_name)

    @property
    def name(self):
        return self._name

    def __repr__(self):
        return "SMDataset({})".format(self._name)

    def annotations(self, fdr=0.1):
        if fdr not in [0.05, 0.1, 0.2, 0.5]:
            print('fdr request does not match default elastic search defaults')
        fields = ['sf', 'adduct', 'fdr']
        response = self._es_query.fields(fields).scan()
        annotations = [(r.sf, r.adduct) for r in response if all([r.fdr, r.fdr <= fdr])]
        return annotations

    def results(self):
        fields = ['sf', 'adduct', 'fdr', 'msm', 'chaos', 'image_corr', 'pattern_match']
        response = self._es_query.fields(fields).scan()
        return pd.DataFrame([(r.sf, r.adduct, r.msm, r.chaos, r.image_corr, r.pattern_match) for r in response],
                            columns=['sf', 'adduct', 'msm', 'moc', 'spat', 'spec'])\
                 .set_index(['sf', 'adduct'])

    @property
    def config(self):
        if self._config:
            return self._config
        q = "select config from dataset where name = %s"
        self._db_cursor.execute(q, [self._name])
        self._config = self._db_cursor.fetchone()[0]
        return self._config

    def adducts(self):
        return self.config['isotope_generation']['adducts']

    def centroids(self, sf, adduct):
        charge = int(self.config['isotope_generation']['charge']['n_charges'])
        isotopes = isotopePattern(str(sf + adduct))
        sigma = float(self.config['isotope_generation']['isocalc_sigma'])
        fwhm = sigma * 2 * (2 * np.log(2)) ** 0.5
        resolution = isotopes.masses[0] / fwhm
        instr = InstrumentModel('tof', resolution)
        centroids = isotopes.centroids(instr).charged(int(charge))
        centroids.sortByMass()
        return zip(centroids.masses, centroids.intensities)

    def polarity(self):
        return self.config['isotope_generation']['charge']['polarity']

    def database(self):
        return self.config['database']['name']

    def isotope_images(self, sf, adduct):
        self._db_cursor.execute(ISO_IMG_SEL, [self._name, sf, adduct])
        images = []
        for r in self._db_cursor.fetchall():
            rows = r.img_bounds['y']['max'] - r.img_bounds['y']['min'] + 1
            cols = r.img_bounds['x']['max'] - r.img_bounds['x']['min'] + 1
            img = np.zeros(cols * rows)
            img[np.array(r.pixel_inds)] = np.array(r.intensities)
            images.append(img.reshape(rows, cols))
        return IsotopeImages(images, sf, adduct, self.centroids(sf, adduct))

class SMInstance(object):
    def __init__(self, config_filename):
        config = json.load(open(config_filename, 'rb'))
        self._es_host = config['elasticsearch']['host']
        self._es_index = config['elasticsearch']['index']
        self._es_client = Elasticsearch(hosts=self._es_host, index=self._es_index)

        self._db_host = config['db']['host']
        self._db_database = config['db']['database']

        self._db_conn = psycopg2.connect(host=self._db_host,
                                         database=self._db_database,
                                         user=config['db']['user'],
                                         password=config['db']['password'])
        self._db_cur = self._db_conn.cursor(cursor_factory=psycopg2.extras.NamedTupleCursor)

    def __repr__(self):
        return "SMInstance(DB {}/{}, ES {}/{})".format(self._db_host, self._db_database,
                                                       self._es_host, self._es_index)

    def dataset(self, dataset_name):
        return SMDataset(dataset_name, self._db_cur, self._es_client, index_name=self._es_index)

    def datasets(self, name_mask=''):
        query = "select name from dataset"
        if name_mask:
            query += " where name like '%{}%'".format(name_mask)
        self._db_cur.execute(query)
        return [self.dataset(name[0]) for name in self._db_cur.fetchall()]

    def top_hits(self, datasets, adduct=None, size=100):
        """
        Returns (sum formula, adduct) pairs with highest average MSM scores across multiple datasets.
        Looks for all adducts by default
        """
        s = Search(using=self._es_client, index=self._es_index)\
            .filter('terms', ds_name=[d.name for d in datasets])

        if adduct is not None:
            s = s.filter('term', adduct=adduct)

        s.aggs.bucket("per_sf_adduct", 'terms', field='sf_adduct', order={'msm_sum': 'desc'}, size=size)\
            .metric('msm_sum', 'sum', field='msm')

        buckets = s.execute().aggregations.per_sf_adduct.buckets
        return [re.match(r'(.*?)([+-].*)', res.key).groups() for res in buckets]

    def msm_scores(self, datasets, sf_adduct_pairs):
        """
        Returns a dataframe of MSM scores for multiple datasets and (sum formula, adduct) pairs.
        """
        s = Search(using=self._es_client, index=self._es_index)\
            .filter('terms', ds_name=[d.name for d in datasets])\
            .filter('terms', sf_adduct=[x[0] + x[1] for x in sf_adduct_pairs])\
            .fields(['sf', 'adduct', 'msm', 'ds_name'])
        results = list(s.scan())
        return pd.DataFrame.from_records(((r.ds_name[0], r.sf[0], r.adduct[0], r.msm[0]) for r in results),
                                         columns=['ds_name', 'sf', 'adduct', 'msm'])\
                           .pivot_table('msm', index=['ds_name'], columns=['sf', 'adduct'], fill_value=0.0)

def plot_diff(dist_df, ref_df, t="", xlabel='', ylabel=''):
    import plotly.graph_objs as go
    from plotly.offline import iplot
    plot_df = dist_df.join(ref_df, rsuffix='_ref', how='inner').dropna()

    text_tmpl = '{}{}<br>X: moc={:.3f} spat={:.3f} spec={:.3f}'\
                '<br>Y: moc={:.3f} spat={:.3f} spec={:.3f}'

    traces = []
    adducts = plot_df.index.get_level_values('adduct').unique()
    for adduct in adducts:
        df = plot_df.xs(adduct, level='adduct')
        txt = df.reset_index().apply(
            lambda r: text_tmpl.format(
                r.sf, adduct, r.moc_ref, r.spat_ref, r.spec_ref, r.moc, r.spat, r.spec
            ), axis=1)

        if df.empty:
            continue

        traces.append(go.Scatter(
            x=df['msm_ref'],
            y=df['msm'],
            text=txt,
            mode='markers',
            name=adduct
        ))

    data = go.Data(traces)
    fig = go.Figure(data=data, layout=go.Layout(
        autosize=False,
        height=500,
        hovermode='closest',
        title=t+' MSM values',
        width=500,
        xaxis=go.XAxis(
            autorange=True,
            range=[-0.05675070028979684, 1.0323925590539844],
            title=xlabel,
            type='linear'
        ),
        yaxis=go.YAxis(
            autorange=True,
            range=[-0.0015978995361995152, 1.0312345837176764],
            title=ylabel,
            type='linear'
        )
    ))
    iplot(fig, filename='ref_dist_msm_scatter')
    tmp_df = plot_df.dropna()
    print np.corrcoef(tmp_df['msm'].values, tmp_df['msm_ref'].values)
    return tmp_df
