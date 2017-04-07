from __future__ import unicode_literals
from mock import MagicMock, patch
import pandas as pd
from time import sleep

from sm.engine import MolecularDB
from sm.engine.es_export import ESExporter
from sm.engine.db import DB
from sm.engine.tests.util import sm_config, ds_config, create_sm_index, es_dsl_search


COLUMNS = ['ds_id', 'db_name', 'sf', 'adduct', 'comp_names', 'comp_ids', 'centroid_mzs', 'polarity']


@patch('sm.engine.es_export.COLUMNS', COLUMNS)
@patch('sm.engine.es_export.DB')
def test_index_ds_works(DBMock, es_dsl_search, create_sm_index, sm_config):
    annotations = [('2000-01-01_00h00m', 'test_db', 'H2O', '+H', ['mol_id'], ['mol_name'], [100, 110], '+'),
                   ('2000-01-01_00h00m', 'test_db', 'Au', '+H', ['mol_id'], ['mol_name'], [200, 210], '+')]
    db_mock = DBMock()
    db_mock.select.return_value = annotations
    mol_db_mock = MagicMock(MolecularDB)
    mol_db_mock.id = 0
    mol_db_mock.name = 'db_name'
    mol_db_mock.version = '2017'
    mol_db_mock.get_molecules.return_value = pd.DataFrame([('mol_id', 'mol_name')], columns=['mol_id', 'mol_name'])

    es_exp = ESExporter()
    es_exp.index_ds('ds_id', mol_db_mock)

    sleep(2)

    d1 = es_dsl_search.filter('term', sf='H2O').execute()['hits']['hits'][0]['_source']
    assert d1.to_dict() == {'ds_id': '2000-01-01_00h00m', 'db_name': 'db_name', 'db_version': '2017',
                            'sf': 'H2O', 'adduct': '+H',
                            'comp_names': ['mol_name'], 'comp_ids': ['mol_id'],
                            'centroid_mzs': ['00100.0000', '00110.0000'], 'mz': '00100.0000',
                            'polarity': '+', 'ion_add_pol': '[M+H]+'}
    d2 = es_dsl_search.filter('term', sf='Au').execute()['hits']['hits'][0]['_source']
    assert d2.to_dict() == {'ds_id': '2000-01-01_00h00m', 'db_name': 'db_name', 'db_version': '2017',
                            'sf': 'Au', 'adduct': '+H',
                            'comp_names': ['mol_name'], 'comp_ids': ['mol_id'],
                            'centroid_mzs': ['00200.0000', '00210.0000'], 'mz': '00200.0000',
                            'polarity': '+', 'ion_add_pol': '[M+H]+'}
