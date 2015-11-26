from __future__ import division
from os.path import join, dirname
from subprocess import check_call
import pytest
from fabric.api import local
from engine.db import DB
from engine.test.util import sm_config, ds_config, create_test_db, drop_test_db

proj_dir_path = dirname(dirname(__file__))
ds_name = 'spheroid_12h'
data_dir_path = join(proj_dir_path, 'data', ds_name)
test_dir_path = join(proj_dir_path, 'test/data/test_search_job_spheroid_dataset')
test_dir_ds_path = join(test_dir_path, ds_name)
agg_formula_path = join(test_dir_path, 'agg_formula.csv')

sample_ds_report_insert = "INSERT INTO sample_dataset_report VALUES (%s, %s, %s, %s)"
sample_ds_report_select = ("SELECT report from sample_dataset_report "
                           "WHERE hash = %s AND ds_name = %s "
                           "ORDER BY dt DESC")
report_select = ('SELECT sf, adduct, stats '
                 'FROM iso_image_metrics '
                 'JOIN formula_db d ON d.id = s.db_id '
                 'JOIN agg_formula f ON f.id = s.sf_id '
                 'WHERE job_id = %s AND d.name = %s'
                 'ORDER BY sf, adduct')


@pytest.fixture(scope='module')
def master_hash():
    # return local('git rev-parse --short master')
    return '51f2dd1'


# @pytest.fixture()
# def fill_database(sm_config, master_hash):
#     sm_config['db']['database'] = 'sm'
#     db = DB(sm_config['db'])
#     report = [['C10H11NO', '+H', {'chaos': 0.0, 'img_corr': 0.0, 'pat_match': 0.0}]]
#     db.insert(sample_ds_report_insert, [(master_hash, ds_name, '2015-01-01 05:00:00', json.dumps(report))])
#     db.close()


def test_search_job_spheroid_dataset(sm_config, master_hash):
    cmd = ['python', join(proj_dir_path, 'scripts/run_molecule_search.py'), test_dir_ds_path]
    check_call(cmd)

    sm_config['db']['database'] = 'sm'
    db = DB(sm_config['db'])
    try:
        base_report = db.select(sample_ds_report_select, (master_hash, ds_name))[0]
        report = db.select(report_select, (0, 'HMDB'))
        assert base_report[0] == report[0]
    finally:
        db.close()

# def assert_sf_res_dataframes_equal(res_df, ref_df):
#     ref_df = ref_df.set_index(['sf', 'adduct'])
#     res_df = res_df.set_index(['sf', 'adduct'])
#
#     res_sf_set = set(res_df.index)
#     ref_sf_set = set(ref_df.index)
#
#     # Results should contain all ref sum formulas
#     assert res_sf_set.issuperset(ref_sf_set)
#
#     print 'FDR: ', len(res_sf_set.difference(ref_sf_set)) / len(res_sf_set)
#     print list(res_sf_set.difference(ref_sf_set))
#     print
#
#     for sf_adduct in ref_df.index:
#         print sf_adduct
#
#         res_metrics = res_df.loc[sf_adduct].to_dict()
#         ref_metrics = ref_df.loc[sf_adduct].to_dict()
#         print 'Res metrics: ', res_metrics
#         print 'Ref metrics: ', ref_metrics
#
#         for m in ref_metrics:
#             assert_almost_equal(res_metrics[m], ref_metrics[m], decimal=2)


# def setUp(self):
#     # super.__init__(self, TestCase)
#     self.sc = SparkContext(conf=SparkConf())
#     self.ds = '20150730_ANB_spheroid_control_65x65_15um'
#     self.base_path = realpath(join('data/run_process_dataset_test', self.ds))
#     self.ds_path = join(self.base_path, 'ds.txt')
#     self.queries_path = join(self.base_path, 'C44H84NO8P_queries.pkl')
#     self.rows, self.cols = 65, 65
#     self.minPartitions = 4
#
#     with open(self.queries_path) as f:
#         self.sf_mz_intervals = cPickle.load(f)['data']
#
#     ff = self.sc.textFile(self.ds_path, minPartitions=self.minPartitions)
#     self.spectra = ff.map(_txt_to_spectrum)


# def setUp(self):
#     self.ds = '20150730_ANB_spheroid_control_65x65_15um'
#     # self.rows, self.cols = 65, 65
#
#     self.base_path = realpath(join('data/run_process_dataset_test', self.ds))
#     self.out_path = join(self.base_path, 'results.pkl')
#     self.text_out_path = join(self.base_path, 'results.csv')
#     self.ds_path = join(self.base_path, 'ds.txt')
#     self.db_id = 0
#     self.ds_coord_path = join(self.base_path, 'ds_coord.txt')
#     self.queries_path = join(self.base_path, 'queries.pkl')
#     self.ref_res_path = join(self.base_path, 'ref_result_sf_metrics.csv')
#     self.run_process_dataset_script = join(dirname(dirname(realpath(__file__))), 'scripts/run_molecule_search.py')
#
#     self.config = Config.get_config()
#
#     self.ds_config_path = join(self.base_path, 'config.json')


# def load_results_df(self, columns):
#     with open(self.out_path) as f:
#         res = cPickle.load(f)
#
#     conn = psycopg2.connect(**self.config['db'])
#     curs = conn.cursor()
#
#     res_list = []
#     for i, sf_id in enumerate(res['formulas']):
#         adduct = res['mzadducts'][i]
#         curs.execute('select sf from agg_formula where db_id = %s and id = %s;', (self.db_id, sf_id))
#         sf = curs.fetchone()[0]
#         moc = res['stat_dicts'][i]['moc']
#         spec = res['stat_dicts'][i]['spec']
#         spat = res['stat_dicts'][i]['spat']
#         res_list.append((sf, adduct, moc, spec, spat))
#
#     res_df = pd.DataFrame(data=res_list, columns=columns)
#     res_df.to_csv(self.text_out_path, sep='\t', index=False)
#     return res_df

# def test_run(self):
#     self.run_process_dataset()
#
#     ref_df = pd.read_csv(self.ref_res_path, sep='\t').drop(['ID', 'mz'], axis=1)
#     res_df = self.load_results_df(ref_df.columns.values)
#
#     assert_sf_res_dataframes_equal(res_df, ref_df)
