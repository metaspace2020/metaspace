from mock import MagicMock, patch
from elasticsearch import Elasticsearch

from sm.engine.es_export import ESExporter
from sm.engine.db import DB
from sm.engine.tests.util import sm_config, ds_config


COLUMNS = ['ds_name', 'db_name', 'sf', 'adduct', 'comp_names', 'comp_ids', 'mz']


@patch('sm.engine.es_export.COLUMNS', COLUMNS)
def test_foo(sm_config):
    annotations = [('test_ds', 'test_db', 'H20', '+H', [], [], 100), ('test_ds', 'test_db', 'Au', '+H', [], [], 200)]
    db_mock = MagicMock(DB)
    db_mock.select.return_value = annotations

    es_exp = ESExporter(sm_config)
    es_exp.index_ds(db_mock, 'test_ds', 'test_db')

    es = Elasticsearch()

    d = es.get(index='sm', id='test_ds_test_db_H20_+H', doc_type='annotation', _source=True)
    assert d['_source'] == {'ds_name': 'test_ds', 'db_name': 'test_db', 'sf': 'H20', 'adduct': '+H',
                            'comp_names': '', 'comp_ids': '', 'mz': '00100.0000'}

    d = es.get(index='sm', id='test_ds_test_db_Au_+H', doc_type='annotation', _source=True)
    assert d['_source'] == {'ds_name': 'test_ds', 'db_name': 'test_db', 'sf': 'Au', 'adduct': '+H',
                            'comp_names': '', 'comp_ids': '', 'mz': '00200.0000'}
