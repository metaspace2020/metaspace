from __future__ import print_function
from elasticsearch import Elasticsearch
from elasticsearch_dsl import Search
import psycopg2
import psycopg2.extras
import pandas as pd
import numpy as np
import json
import re

ISO_IMG_SEL = """select img.peak, img.pixel_inds, img.intensities, ds.img_bounds
from iso_image img
join job j on j.id = img.job_id and j.db_id = img.db_id
join dataset ds on ds.id = j.ds_id
join sum_formula sf on sf.db_id = img.db_id and sf.id = img.sf_id
join formula_db fdb on fdb.id = img.db_id
where ds.name = %s and sf.sf = %s and img.adduct = %s and fdb.name = %s
order by img.peak
"""
def ion(r):
    from pyMSpec.pyisocalc.tools import normalise_sf
    return (r.ds_id[0], normalise_sf(r.sf[0]), r.adduct[0], 1)

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
            plt.title(round(self.peak(i)[0], 4))
            plt.axis('off')
            plt.imshow(self._images[i], interpolation='none', cmap='viridis')

class SMDataset(object):
    def __init__(self, dataset_id, db_cursor, es_client, index_name):
        self._id = dataset_id
        self._db_cursor = db_cursor
        self._properties = {}
        self._name = self.name
        self.es_search = Search(using=es_client, index=index_name)
        self._es_query = self.es_search.query('term', ds_id=self._id)

    def _db_fetch(self, prop):
        if prop in self._properties:
            return self._properties[prop]
        self._db_cursor.execute("select " + prop + " from dataset where id = %s", [self._id])
        value = self._db_cursor.fetchone()[0]
        self._properties[prop] = value
        return value

    @property
    def id(self):
        return self._id

    @property
    def name(self):
        return self._db_fetch("name")

    @property
    def s3dir(self):
        return self._db_fetch("input_path")

    def __repr__(self):
        return "SMDataset({} | ID: {})".format(self._name, self._id)

    def annotations(self, fdr=0.1, database=None):
        if fdr not in [0.05, 0.1, 0.2, 0.5]:
            print('fdr request does not match elastic search defaults')
        fields = ['sf', 'adduct', 'fdr']
        if not database:
            response = self._es_query.scan()
        else:
            response = (self.es_search.filter('term', ds_id=self._id)
                        .filter('term', db_name=database)
                        .filter("range", **{'fdr': {'to': fdr}})).scan()
        annotations = [(r.sf, r.adduct) for r in response if all([r.fdr, r.fdr <= fdr])]
        return annotations

    def results(self):
        fields = ['sf', 'adduct', 'fdr', 'msm', 'chaos', 'image_corr', 'pattern_match']
        response = self._es_query.fields(fields).scan()
        return pd.DataFrame([(r.sf[0], r.adduct[0], r.msm[0], r.chaos[0], r.image_corr[0], r.pattern_match[0]) for r in response],
                            columns=['sf', 'adduct', 'msm', 'moc', 'spat', 'spec'])\
                 .set_index(['sf', 'adduct'])

    @property
    def metadata(self):
        return Metadata(self._db_fetch("metadata"))

    @property
    def config(self):
        return self._db_fetch("config")

    def adducts(self):
        return self.config['isotope_generation']['adducts']

    def centroids(self, sf, adduct):
        from cpyMSpec import isotopePattern, InstrumentModel
        charge = int(self.config['isotope_generation']['charge']['n_charges'])
        isotopes = isotopePattern(str(sf + adduct))
        sigma = float(self.config['isotope_generation']['isocalc_sigma'])
        fwhm = sigma * 2 * (2 * np.log(2)) ** 0.5
        resolution = isotopes.masses[0] / fwhm
        instr = InstrumentModel('tof', resolution)
        centroids = isotopes.centroids(instr).charged(int(charge)).trimmed(4)
        centroids.sortByMass()
        return list(zip(centroids.masses, centroids.intensities))

    def polarity(self):
        return self.config['isotope_generation']['charge']['polarity']

    def database(self):
        return self.config['database']['name']

    def isotope_images(self, sf, adduct):
        self._db_cursor.execute(ISO_IMG_SEL, [self._name, sf, adduct, self.database()])
        db_rows = list(self._db_cursor.fetchall())
        assert len(db_rows) > 0

        def span(axis):
            return axis['max'] - axis['min'] + 1

        rows, cols = span(db_rows[0].img_bounds['y']), span(db_rows[0].img_bounds['x'])
        images = [np.zeros((rows, cols))] * 4

        for r in db_rows:
            img = np.zeros(cols * rows)
            img[np.array(r.pixel_inds)] = np.array(r.intensities)
            images[r.peak] = img.reshape(rows, cols)

        return IsotopeImages(images, sf, adduct, self.centroids(sf, adduct))

class Metadata(object):

    _paths = {}

    def __init__(self, json_metadata):
        self._json = json_metadata

    @property
    def json(self):
        return self._json

class SMInstance(object):
    def __init__(self, config_filename):
        config = json.load(open(config_filename, 'r'))
        self._es_host = config['elasticsearch']['host']
        self._es_port = config['elasticsearch']['port']
        self._es_index = config['elasticsearch']['index']
        self._es_client = Elasticsearch(hosts=['{}:{}'.format(self._es_host, self._es_port)], index=self._es_index)

        self._config = config
        self._db_host = config['db']['host']
        self._db_database = config['db']['database']

        self.reconnect()

    def reconnect(self):
        self._db_conn = psycopg2.connect(host=self._db_host,
                                         database=self._db_database,
                                         user=self._config['db']['user'],
                                         password=self._config['db']['password'])
        self._db_cur = self._db_conn.cursor(cursor_factory=psycopg2.extras.NamedTupleCursor)

    def __repr__(self):
        return "SMInstance(DB {}/{}, ES {}/{})".format(self._db_host, self._db_database,
                                                       self._es_host, self._es_index)

    def dataset(self, dataset_name):
        query = "select id from dataset where name = '{}'".format(dataset_name)
        self._db_cur.execute(query)
        dataset_id = self._db_cur.fetchone()[0]
        return SMDataset(dataset_id, self._db_cur, self._es_client, index_name=self._es_index)

    def datasets(self, name_mask=''):
        query = "select id from dataset"
        if name_mask:
            query += " where name like '%{}%'".format(name_mask)
        self._db_cur.execute(query)
        return [SMDataset(row[0], self._db_cur, self._es_client, index_name=self._es_index)
                for row in self._db_cur.fetchall()]

    def all_adducts(self):
        query = "select distinct adduct from iso_image_metrics m"
        self._db_cur.execute(query)
        return [row[0] for row in self._db_cur.fetchall()]

    def database(self, database_name):
        return MolecularDatabase(database_name, self._db_cur)

    def databases(self):
        self._db_cur.execute("select name from formula_db")
        return [self.database(name[0]) for name in self._db_cur.fetchall()]

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
        return self.get_tables(datasets, sf_adduct_pairs, ['msm'])['msm']

    def get_tables(self, datasets, sf_adduct_pairs, fields=['msm', 'fdr'], db_name='HMDB'):
        """
        Returns dictionary with keys  dataframe of MSM scores for multiple datasets and (sum formula, adduct) pairs.
        """
        assert fields, "list of fields can't be empty"
        fill_values = {'fdr': 1.0, 'msm': 0.0}
        s = Search(using=self._es_client, index=self._es_index)\
            .filter('terms', ds_name=[d.name for d in datasets])\
            .filter('terms', sf_adduct=[x[0] + x[1] for x in sf_adduct_pairs])\
            .filter('term', db_name=db_name)\
            .fields(['sf', 'adduct', 'ds_name'] + fields)
        results = list(s.scan())
        d = {}
        for f in fields:
            records = ((r.ds_name[0], r.sf[0], r.adduct[0], r[f][0]) for r in results)
            d[f] = pd.DataFrame.from_records(records, columns=['ds_name', 'sf', 'adduct', f])\
                               .pivot_table(f, index=['ds_name'], columns=['sf', 'adduct'],
                                            fill_value=fill_values.get(f, 0.0))
        return d

    def metadata(self, datasets):
        """
        Pandas dataframe for a subset of datasets where rows are flattened metadata JSON objects
        """
        from pandas.io.json import json_normalize
        df = json_normalize([d.metadata.json for d in datasets])
        df.index = [d.name for d in datasets]
        return df

    def get_annotations(self, fdr=0.1, db_name='HMDB', timeout='240s'):
        """
        Returns a table of booleans indicating which ions were annotated in a particular dataset at the specified fdr
        Known issue: only returns datasets with some anntotation at the given FDR level. Use in conjunction with get_metadata() to get a full dataset list
        :param fdr: fdr level to export annotations at (should be one of [0.05, 0.1, 0.2, 0.5]
        :param db_name: database to search against
        :return: pandas dataframe index=dataset ids, columns(multindex) adduct / molecular formula
        """
        s = Search(using=self._es_client, index=self._es_index).params(timeout=timeout)\
                    .filter('term', db_name=db_name)\
                    .filter("range", **{'fdr': {'to': fdr}})\
                    .fields(['sf', 'adduct', 'ds_id', ''])[:2147483647]
        results = list(s.execute())
        annotations = pd.DataFrame.pivot_table(
            pd.DataFrame.from_records([ion(r) for r in results]), index=0, columns=[2, 1], values=3) \
            .notnull()
        return annotations

    def get_metadata(self, db_table='dataset'):
        """
        Returns a complete dump of all the metadata available
        :param db_table: database table to dump from
        :return:
        """
        query = "SELECT * FROM {}".format(db_table)
        self._db_cur.execute(query)
        md_dump = self._db_cur.fetchall()
        flattened = [pd.io.json.json_normalize(vars(r)) for r in md_dump]
        metadata = pd.concat(flattened)
        metadata = metadata.set_index('id')
        metadata.columns = map(lambda x: x if not x.startswith('metadata') else x[9:], metadata.columns)
        return metadata

class MolecularDatabase(object):
    def __init__(self, name, db_cursor):
        self._db_cur = db_cursor
        self._name = name
        self._db_cur.execute("select id from formula_db where name = %s", [self._name])
        self._id = self._db_cur.fetchone()[0]
        self._data = self._fetch_data()

    @property
    def name(self):
        return self._name

    def _fetch_data(self):
        q = "select sf, id, name from formula where db_id = %s"
        self._db_cur.execute(q, [self._id])
        data = {}
        for sf, mol_id, mol_name in self._db_cur.fetchall():
            if sf not in data:
                data[sf] = {'ids': [], 'names': []}
            data[sf]['ids'].append(mol_id)
            data[sf]['names'].append(mol_name)
        return data

    def sum_formulas(self):
        return self._data.keys()

    def names(self, sum_formula):
        return self._data.get(sum_formula, {}).get('names', {})

    def ids(self, sum_formula):
        return self._data.get(sum_formula, {}).get('ids', {})

def plot_diff(ref_df, dist_df,  t="", xlabel='', ylabel='', col='msm'):
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
            x=df['{}_ref'.format(col)],
            y=df['{}'.format(col)],
            text=txt,
            mode='markers',
            name=adduct
        ))

    data = go.Data(traces)
    fig = go.Figure(data=data, layout=go.Layout(
        autosize=False,
        height=500,
        hovermode='closest',
        title=t+' \'{}\' values'.format(col),
        width=500,
        xaxis=go.XAxis(
            autorange=False,
            range=[-0.05675070028979684, 1.0323925590539844],
            title=xlabel,
            type='linear'
        ),
        yaxis=go.YAxis(
            autorange=False,
            range=[-0.0015978995361995152, 1.0312345837176764],
            title=ylabel,
            type='linear'
        )
    ))
    iplot(fig, filename='ref_dist_msm_scatter')
    tmp_df = plot_df.dropna()
    return tmp_df


class DataframeTree(object):
    """
    Class for hierarchical clustering of Pandas dataframes.

    The intended usage is for making sense out of data returned by SMInstance.msm_scores
    """
    def __init__(self, df, method='ward', metric='euclidean'):
        import scipy.cluster.hierarchy as sch
        self._df = df
        self._Z = sch.linkage(self._df, method=method, metric=metric)
        self._root = DataframeNode(self._df, sch.to_tree(self._Z))

    @property
    def root(self):
        return self._root

    @property
    def df(self):
        """
        Dataframe reordered according to pre-order tree traversal.
        """
        return self.root.df

    @property
    def left(self):
        return self.root.left

    @property
    def right(self):
        return self.root.right

    def row_names(self):
        return list(self.df.index)

    def column_names(self):
        return list(self.df.columns)

class DataframeNode(object):
    def __init__(self, df, node):
        self._df = df
        self._node = node
        self._node_df = None
        self._left_node = None
        self._right_node = None

    @property
    def is_leaf(self):
        return self._node.is_leaf()

    @property
    def left(self):
        if self._left_node is None:
            self._left_node = DataframeNode(self._df, self._node.get_left())
        return self._left_node

    @property
    def right(self):
        if self._right_node is None:
            self._right_node = DataframeNode(self._df, self._node.get_right())
        return self._right_node

    @property
    def df(self):
        if self._node_df is None:
            self._node_df = self._df.iloc[self._node.pre_order(lambda x: x.get_id())]
        return self._node_df

    def row_names(self):
        return list(self.df.index)

    def column_names(self):
        return list(self.df.columns)
