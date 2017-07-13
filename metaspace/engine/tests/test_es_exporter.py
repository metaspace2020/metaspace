from __future__ import unicode_literals
from mock import MagicMock, patch
import pandas as pd
from time import sleep

from sm.engine import MolecularDB
from sm.engine import ESExporter, ESIndexManager
from sm.engine import DB
from sm.engine.tests.util import sm_config, ds_config, sm_index, es_dsl_search, test_db


COLUMNS = ['ds_id', 'db_name', 'sf', 'adduct', 'comp_names', 'comp_ids', 'centroid_mzs', 'polarity', 'fdr']


@patch('sm.engine.es_export.COLUMNS', COLUMNS)
@patch('sm.engine.es_export.DB')
def test_index_ds_works(DBMock, es_dsl_search, sm_index, sm_config):
    annotations = [('2000-01-01_00h00m', 'test_db', 'H2O', '+H', ['mol_id'], ['mol_name'], [100, 110], '+', 0.1),
                   ('2000-01-01_00h00m', 'test_db', 'Au', '+H', ['mol_id'], ['mol_name'], [200, 210], '+', 0.05)]
    db_mock = DBMock()
    db_mock.select.return_value = annotations
    mol_db_mock = MagicMock(MolecularDB)
    mol_db_mock.id = 0
    mol_db_mock.name = 'db_name'
    mol_db_mock.version = '2017'
    mol_db_mock.get_molecules.return_value = pd.DataFrame([('H2O', 'mol_id', 'mol_name'), ('Au', 'mol_id', 'mol_name')],
                                                          columns=['sf', 'mol_id', 'mol_name'])

    es_exp = ESExporter(db_mock)
    es_exp.index_ds('ds_id', mol_db_mock, del_first=True)

    sleep(2)

    d1 = es_dsl_search.filter('term', sf='H2O').execute()['hits']['hits'][0]['_source']
    assert d1.to_dict() == {'ds_id': '2000-01-01_00h00m', 'db_name': 'db_name', 'db_version': '2017',
                            'sf': 'H2O', 'adduct': '+H', 'fdr': 0.1,
                            'comp_names': ['mol_name'], 'comp_ids': ['mol_id'],
                            'centroid_mzs': ['00100.0000', '00110.0000'], 'mz': '00100.0000',
                            'polarity': '+', 'ion_add_pol': '[M+H]+'}
    d2 = es_dsl_search.filter('term', sf='Au').execute()['hits']['hits'][0]['_source']
    assert d2.to_dict() == {'ds_id': '2000-01-01_00h00m', 'db_name': 'db_name', 'db_version': '2017',
                            'sf': 'Au', 'adduct': '+H', 'fdr': 0.05,
                            'comp_names': ['mol_name'], 'comp_ids': ['mol_id'],
                            'centroid_mzs': ['00200.0000', '00210.0000'], 'mz': '00200.0000',
                            'polarity': '+', 'ion_add_pol': '[M+H]+'}


def test_rename_index_works(test_db, sm_config):
    es_config = sm_config['elasticsearch']
    alias = es_config['index']
    es_man = ESIndexManager(es_config)

    es_man.create_index('{}-yin'.format(alias))
    es_man.remap_alias('{}-yin'.format(alias), alias=alias)

    assert es_man.exists_index(alias)
    assert es_man.exists_index('{}-yin'.format(alias))
    assert not es_man.exists_index('{}-yang'.format(alias))

    es_man.create_index('{}-yang'.format(alias))
    es_man.remap_alias('{}-yang'.format(alias), alias=alias)

    assert es_man.exists_index(alias)
    assert es_man.exists_index('{}-yang'.format(alias))
    assert not es_man.exists_index('{}-yin'.format(alias))


def test_internal_index_name_return_valid_values(sm_config):
    es_config = sm_config['elasticsearch']
    alias = es_config['index']
    es_man = ESIndexManager(es_config)

    assert es_man.internal_index_name(alias) in ['{}-yin'.format(alias), '{}-yang'.format(alias)]
