import json
import tornado.ioloop
import tornado.web
import tornado.httpserver
from tornado import gen


RESULTS_COUNT_TPL = "SELECT COUNT(*) as count FROM ({}) tt"
RESULTS_FIELDS = ['db_name', 'ds_name', 'sf', 'comp_names', 'comp_ids',
                  'chaos', 'image_corr', 'pattern_match', 'msm', 'adduct',
                  'job_id', 'ds_id', 'sf_id', 'peaks', 'db_id', 'pass_fdr']
RESULTS_SEL = '''
    SELECT * FROM (
        SELECT sf_db.name as db_name, ds.name as ds_name, f.sf as sf, f.names as comp_names, f.subst_ids as comp_ids,
            coalesce((m.stats->'chaos')::text::real, 0) AS chaos,
            coalesce((m.stats->'spatial')::text::real, 0) AS image_corr,
            coalesce((m.stats->'spectral')::text::real, 0) AS pattern_match,
            coalesce(msm, 0) as msm,
            a.adduct AS adduct,
            j.id AS job_id,
            ds.id AS ds_id,
            f.id AS sf_id,
            m.peaks_n as peaks,
            sf_db.id AS db_id,
            CASE WHEN ROUND(fdr::numeric, 2) <= %s THEN 1 ELSE 0 END AS pass_fdr
        FROM agg_formula f
        CROSS JOIN adduct a
        JOIN formula_db sf_db ON sf_db.id = f.db_id
        LEFT JOIN job j ON j.id = a.job_id
        LEFT JOIN dataset ds ON ds.id = j.ds_id
        LEFT JOIN iso_image_metrics m ON m.job_id = j.id AND m.db_id = sf_db.id AND m.sf_id = f.id AND m.adduct = a.adduct
        --ORDER BY sf
    ) as t
    '''


def select_results(query, where=None, orderby='msm', asc=False, limit=500, offset=0):
    query_params = []

    where = filter(lambda d: d['value'], where)
    if where:
        conditions = ['{} {} %s'.format(d['field'], d['cond']) for d in where]
        cond_vals = ['%{}%'.format(d['value']) if d['cond'] == 'like' else d['value'] for d in where]

        query += 'WHERE ' + ' and '.join(conditions) + '\n'
        query_params.extend(cond_vals)

    count_query = RESULTS_COUNT_TPL.format(query)

    if orderby is not None:
        query += 'ORDER BY {} {}\n'.format(orderby, 'ASC' if asc else 'DESC')

    if limit > 0:
        query += 'LIMIT {}\n'.format(limit)
    else:
        query += 'LIMIT 500\n'

    if offset >= 0:
        query += 'OFFSET {}'.format(offset)
    else:
        query += 'OFFSET 0'

    return count_query, query, query_params


class ResultsTableHandler(tornado.web.RequestHandler):

    def initialize(self):
        super(ResultsTableHandler, self).initialize()
        self.formula_dbs = [row['name'] for row in self.db.query('select name from formula_db')]
        self.datasets = [row['name'] for row in self.db.query('select name from dataset')]
        self.adducts = [row['adduct'] for row in self.db.query('select distinct(adduct) as adduct from theor_peaks')]

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
        draw = self.get_argument('draw', 0)

        limit = int(self.get_argument('length', 500))
        offset = int(self.get_argument('start', 0))

        fdr_thr = float(self.get_argument('fdr_thr'))

        db_name = self.request.arguments['columns[0][search][value]'][0]
        ds_name = self.request.arguments['columns[1][search][value]'][0]
        adduct = self.request.arguments['columns[9][search][value]'][0]
        sf = self.request.arguments['columns[2][search][value]'][0]
        min_msm = self.request.arguments['columns[8][search][value]'][0]

        orderby = RESULTS_FIELDS[int(self.get_argument('order[0][column]', 0))]
        order_asc = self.get_argument('order[0][dir]', 0) == 'asc'

        where = [
            {'field': 'db_name', 'value': db_name, 'cond': '='},
            {'field': 'ds_name', 'value': ds_name, 'cond': '='},
            {'field': 'adduct', 'value': adduct, 'cond': '='},
            {'field': 'sf', 'value': sf, 'cond': 'like'},
            {'field': 'msm', 'value': min_msm, 'cond': '>='}
        ]
        count_query, query, query_params = select_results(query=RESULTS_SEL, where=where,
                                                          orderby=orderby, asc=order_asc,
                                                          limit=limit, offset=offset)
        query_params.insert(0, fdr_thr)
        count = int(self.db.query(count_query, *query_params)[0]['count'])
        results = self.db.query(query, *query_params)

        results_dict = self.make_datatable_dict(draw, count, [[row[x] for x in RESULTS_FIELDS] for row in results])

        results_dict['yadcf_data_0'] = self.formula_dbs
        results_dict['yadcf_data_1'] = self.datasets
        results_dict['yadcf_data_2'] = []
        results_dict['yadcf_data_8'] = ['0.1']
        results_dict['yadcf_data_9'] = self.adducts

        self.write(json.dumps(results_dict))
