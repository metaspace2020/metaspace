from mock import MagicMock, patch
from elasticsearch import Elasticsearch

from sm.engine.es_export import ESExporter
from sm.engine.db import DB
from sm.engine.tests.util import sm_config, ds_config, create_sm_index


COLUMNS = ['ds_id', 'db_name', 'sf', 'adduct', 'comp_names', 'comp_ids', 'centroid_mzs']


@patch('sm.engine.es_export.COLUMNS', COLUMNS)
def test_index_ds_works(create_sm_index, sm_config):
    annotations = [('2000-01-01_00h00m', 'test_db', 'H20', '+H', [], [], [100, 110]),
                   ('2000-01-01_00h00m', 'test_db', 'Au', '+H', [], [], [200, 210])]
    db_mock = MagicMock(DB)
    db_mock.select.return_value = annotations

    es_exp = ESExporter(sm_config)
    es_exp.index_ds(db_mock, 'test_ds')

    es = Elasticsearch(hosts=["{}:{}".format(sm_config['elasticsearch']['host'],
                                             sm_config['elasticsearch']['port'])])

    d = es.get(index=sm_config['elasticsearch']['index'], id='2000-01-01_00h00m_test_db_H20_+H',
               doc_type='annotation', _source=True)
    assert d['_source'] == {'ds_id': '2000-01-01_00h00m', 'db_name': 'test_db', 'sf': 'H20', 'adduct': '+H',
                            'comp_names': '', 'comp_ids': '', 'centroid_mzs': ['00100.0000', '00110.0000']}

    d = es.get(index=sm_config['elasticsearch']['index'], id='2000-01-01_00h00m_test_db_Au_+H',
               doc_type='annotation', _source=True)
    assert d['_source'] == {'ds_id': '2000-01-01_00h00m', 'db_name': 'test_db', 'sf': 'Au', 'adduct': '+H',
                            'comp_names': '', 'comp_ids': '', 'centroid_mzs': ['00200.0000', '00210.0000']}
