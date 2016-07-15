import json
import tornado.ioloop
import tornado.web
import tornado.httpserver
from tornado import gen
from time import time
from elasticsearch import Elasticsearch
from math import floor


es = Elasticsearch()

RESULTS_FIELDS = ['db_name', 'ds_name', 'sf', 'comp_names', 'comp_ids',
                  'chaos', 'image_corr', 'pattern_match', 'msm', 'adduct',
                  'job_id', 'ds_id', 'sf_id', 'peaks', 'db_id', 'mz', 'pass_fdr']


def search(sf='', ds_name='', db_name='', adduct='', comp_name='', comp_id='', mz='',
           min_msm=0.1, fdr_thr=0.1, orderby='msm', asc=False, offset=0, limit=500):
    body = {
        "query": {
            "constant_score": {
                "filter": {
                    "bool": {
                        "must": [
                            { "prefix": { "sf": sf } },
                            { "prefix": { "ds_name": ds_name } },
                            { "term": { "db_name": db_name } } if db_name else {},
                            { "prefix": { "adduct": adduct } },
                            { "wildcard": { "comp_names": '*{}*'.format(comp_name) } } if comp_name else {},
                            { "prefix": { "comp_ids": comp_id } },
                            { "wildcard": { "mz": '*{}*'.format(mz) } } if mz else {},
                            { 'range': { 'msm': { 'gte': min_msm } } }
                        ]
                    }
                }
            }
        },
        'sort': [ { orderby: 'asc' if asc else 'desc' } ],
        'from': offset,
        'size': limit
    }

    def format_annotation(a, fdr_thr):
        a['comp_ids'] = a['comp_ids'].split('|')
        a['comp_names'] = a['comp_names'].split('|')
        a['pass_fdr'] = a['fdr'] <= fdr_thr if a['fdr'] else False
        del a['fdr']
        a['mz'] = a['mz'].lstrip('0')
        return a

    results = [format_annotation(r['_source'], fdr_thr) for r in
               es.search(index='sm', body=body, _source=True)['hits']['hits']]

    count = es.count(index='sm', body=body)['count']

    return count, results


class ResultsTableHandler(tornado.web.RequestHandler):

    def initialize(self):
        super(ResultsTableHandler, self).initialize()
        self.formula_dbs = [row['name'] for row in self.db.query('select name from formula_db')]
        self.datasets = [row['name'] for row in self.db.query('select name from dataset')]
        self.adducts = self.application.adducts

    @property
    def db(self):
        return self.application.db

    def make_datatable_dict(self, draw, count, res):
        return {
            "draw": draw,
            "recordsTotal": count,
            "recordsFiltered": count,
            "data": res
        }

    @gen.coroutine
    def post(self, *args):
        start = time()

        draw = int(self.get_argument('draw', 0))

        limit = int(self.get_argument('length', 500))
        offset = int(self.get_argument('start', 0))

        fdr_thr = float(self.get_argument('fdr_thr'))

        db_name = self.request.arguments['columns[0][search][value]'][0]
        ds_name = self.request.arguments['columns[1][search][value]'][0]
        adduct = self.request.arguments['columns[9][search][value]'][0]
        sf = (self.request.arguments['columns[2][search][value]'][0])
        compound = (self.request.arguments['columns[3][search][value]'][0]).lower()
        comp_id = self.request.arguments['columns[4][search][value]'][0]
        min_msm = self.request.arguments['columns[8][search][value]'][0] or 0
        mz_str = self.request.arguments['columns[15][search][value]'][0]

        orderby = RESULTS_FIELDS[int(self.get_argument('order[0][column]', 0))]
        order_asc = self.get_argument('order[0][dir]', 0) == 'asc'

        count, results = search(sf, ds_name, db_name, adduct, compound, comp_id, mz_str,
                                min_msm, fdr_thr, orderby, order_asc, offset, limit)

        results_dict = self.make_datatable_dict(draw, count, [[row[x] for x in RESULTS_FIELDS] for row in results])

        results_dict['yadcf_data_0'] = self.formula_dbs
        results_dict['yadcf_data_1'] = self.datasets
        results_dict['yadcf_data_2'] = []
        results_dict['yadcf_data_3'] = []
        results_dict['yadcf_data_4'] = []
        results_dict['yadcf_data_8'] = ['0.1']
        results_dict['yadcf_data_9'] = self.adducts
        results_dict['yadcf_data_15'] = []

        self.write(json.dumps(results_dict))

        time_spent = time() - start
        print 'results_table post time = {} s'.format(time_spent)
