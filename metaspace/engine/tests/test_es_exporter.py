from datetime import datetime
from unittest.mock import MagicMock, patch
import pandas as pd
import time

from sm.engine import MolecularDB
from sm.engine.es_export import ESExporter, ESIndexManager, DATASET_SEL, ANNOTATIONS_SEL
from sm.engine import DB
from sm.engine.util import logger, init_logger
from sm.engine.tests.util import sm_config, ds_config, sm_index, es, es_dsl_search, test_db

init_logger()


def wait_for_es(sec=1):
    time.sleep(sec)


def test_index_ds_works(es_dsl_search, sm_index, sm_config):
    ds_id = '2000-01-01_00h00m'
    upload_dt = datetime.now().isoformat(' ')
    mol_db_id = 0
    last_finished = '2017-01-01T18:00:00'

    def db_sel_side_effect(*args):
        if args == (DATASET_SEL, ds_id):
            # ('ds_id', 'ds_name', 'ds_config', 'ds_meta', 'ds_input_path', 'ds_status', 'ds_last_finished')
            return [(ds_id, 'ds_name', 'ds_config', {}, 'ds_input_path', upload_dt, 'ds_status',
                     datetime.strptime(last_finished, '%Y-%m-%dT%H:%M:%S'))]
        elif args == (ANNOTATIONS_SEL, ds_id, mol_db_id):
            # "sf", "sf_adduct",
            # "chaos", "image_corr", "pattern_match", "total_iso_ints", "min_iso_ints", "max_iso_ints", "msm",
            # "adduct", "job_id", "sf_id", "fdr",
            # "centroid_mzs", "iso_image_ids", "polarity"
            return [('H2O', 'H2O+H', 1, 1, 1, 100, 0, 100, 1, '+H', 1, 'sf_0', 0.1,
                     [100, 200], ['iso_img_id_1', 'iso_img_id_2'], '+'),
                    ('Au', 'Au+H', 1, 1, 1, 100, 0, 100, 1, '+H', 1, 'sf_1', 0.05,
                     [100, 200], ['iso_img_id_1', 'iso_img_id_2'], '+')]
        else:
            logger.error('Wrong db_sel_side_effect arguments: ', args)

    db_mock = MagicMock(spec=DB)
    db_mock.select.side_effect = db_sel_side_effect

    mol_db_mock = MagicMock(MolecularDB)
    mol_db_mock.id = mol_db_id
    mol_db_mock.name = 'db_name'
    mol_db_mock.version = '2017'
    mol_db_mock.get_molecules.return_value = pd.DataFrame([('H2O', 'mol_id', 'mol_name'), ('Au', 'mol_id', 'mol_name')],
                                                          columns=['sf', 'mol_id', 'mol_name'])
    es_exp = ESExporter(db_mock)
    es_exp.delete_ds(ds_id)
    es_exp.index_ds(ds_id, mol_db_mock)

    wait_for_es(sec=1)

    ann_1_d = es_dsl_search.filter('term', sf='H2O').execute().to_dict()['hits']['hits'][0]['_source']
    assert ann_1_d == {
        'pattern_match': 1, 'image_corr': 1, 'fdr': 0.1, 'chaos': 1, 'sf': 'H2O', 'sf_id': 'sf_0', 'min_iso_ints': 0,
        'msm': 1, 'sf_adduct': 'H2O+H', 'total_iso_ints': 100, 'centroid_mzs': ['00100.0000', '00200.0000'],
        'iso_image_ids': ['iso_img_id_1', 'iso_img_id_2'], 'polarity': '+', 'job_id': 1, 'max_iso_ints': 100,
        'adduct': '+H', 'ds_name': 'ds_name', 'annotation_counts': [], 'db_version': '2017', 'ds_status': 'ds_status',
        'ion_add_pol': '[M+H]+', 'comp_names': ['mol_name'], 'db_name': 'db_name', 'mz': '00100.0000', 'ds_meta': {},
        'comp_ids': ['mol_id'], 'ds_config': 'ds_config', 'ds_input_path': 'ds_input_path', 'ds_id': ds_id,
        'ds_upload_dt': upload_dt, 'ds_last_finished': last_finished
    }
    ann_2_d = es_dsl_search.filter('term', sf='Au').execute().to_dict()['hits']['hits'][0]['_source']
    assert ann_2_d == {
        'pattern_match': 1, 'image_corr': 1, 'fdr': 0.05, 'chaos': 1, 'sf': 'Au', 'sf_id': 'sf_1', 'min_iso_ints': 0,
        'msm': 1, 'sf_adduct': 'Au+H', 'total_iso_ints': 100, 'centroid_mzs': ['00100.0000', '00200.0000'],
        'iso_image_ids': ['iso_img_id_1', 'iso_img_id_2'], 'polarity': '+', 'job_id': 1, 'max_iso_ints': 100,
        'adduct': '+H',  'ds_name': 'ds_name', 'annotation_counts': [], 'db_version': '2017', 'ds_status': 'ds_status',
        'ion_add_pol': '[M+H]+', 'comp_names': ['mol_name'], 'db_name': 'db_name', 'mz': '00100.0000', 'ds_meta': {},
        'comp_ids': ['mol_id'], 'ds_config': 'ds_config', 'ds_input_path': 'ds_input_path', 'ds_id': ds_id,
        'ds_upload_dt': upload_dt, 'ds_last_finished': last_finished
    }
    ds_d = es_dsl_search.filter('term', _type='dataset').execute().to_dict()['hits']['hits'][0]['_source']
    assert ds_d == {
        'ds_last_finished': last_finished, 'ds_config': 'ds_config', 'ds_meta': {},
        'ds_status': 'ds_status', 'ds_name': 'ds_name', 'ds_input_path': 'ds_input_path', 'ds_id': ds_id,
        'ds_upload_dt': upload_dt,
        'annotation_counts': [{'db': {'name': 'db_name', 'version': '2017'},
                               'counts': [{'level': 5, 'n': 1}, {'level': 10, 'n': 2},
                                          {'level': 20, 'n': 2}, {'level': 50, 'n': 2}]}]
    }


def test_delete_ds__one_db_ann_only(es, sm_index, sm_config):
    index = sm_config['elasticsearch']['index']
    es.create(index=index, doc_type='annotation', id='id1',
              body={'ds_id': 'dataset1', 'db_name': 'HMDB', 'db_version': '2016'})
    es.create(index=index, doc_type='annotation', id='id2',
              body={'ds_id': 'dataset1', 'db_name': 'ChEBI', 'db_version': '2016'})
    es.create(index=index, doc_type='annotation', id='id3',
              body={'ds_id': 'dataset2', 'db_name': 'HMDB', 'db_version': '2016'})
    es.create(index=index, doc_type='dataset', id='id4',
              body={'ds_id': 'dataset1', 'db_name': 'HMDB', 'db_version': '2016'})

    wait_for_es(sec=1)

    db_mock = MagicMock(spec=DB)
    moldb_mock = MagicMock(spec=MolecularDB)
    moldb_mock.name = 'HMDB'
    moldb_mock.version = '2016'

    es_exporter = ESExporter(db_mock)
    es_exporter.delete_ds(ds_id='dataset1', mol_db=moldb_mock)

    wait_for_es(sec=1)

    body = {
        'query': {
            'bool': {
                'filter': []
            }
        }
    }
    body['query']['bool']['filter'] = [{'term': {'ds_id': 'dataset1'}}, {'term': {'db_name': 'HMDB'}}]
    assert es.count(index=index, doc_type='annotation', body=body)['count'] == 0
    body['query']['bool']['filter'] = [{'term': {'ds_id': 'dataset1'}}, {'term': {'db_name': 'ChEBI'}}]
    assert es.count(index=index, doc_type='annotation', body=body)['count'] == 1
    body['query']['bool']['filter'] = [{'term': {'ds_id': 'dataset2'}}, {'term': {'db_name': 'HMDB'}}]
    assert es.count(index=index, doc_type='annotation', body=body)['count'] == 1
    body['query']['bool']['filter'] = [{'term': {'ds_id': 'dataset1'}}, {'term': {'_type': 'dataset'}}]
    assert es.count(index=index, doc_type='dataset', body=body)['count'] == 1


def test_delete_ds__completely(es, sm_index, sm_config):
    index = sm_config['elasticsearch']['index']
    es.create(index=index, doc_type='annotation', id='id1',
              body={'ds_id': 'dataset1', 'db_name': 'HMDB', 'db_version': '2016'})
    es.create(index=index, doc_type='annotation', id='id2',
              body={'ds_id': 'dataset1', 'db_name': 'ChEBI', 'db_version': '2016'})
    es.create(index=index, doc_type='annotation', id='id3',
              body={'ds_id': 'dataset2', 'db_name': 'HMDB', 'db_version': '2016'})
    es.create(index=index, doc_type='dataset', id='dataset1',
              body={'ds_id': 'dataset1', 'db_name': 'HMDB', 'db_version': '2016'})

    wait_for_es(sec=1)

    db_mock = MagicMock(spec=DB)

    es_exporter = ESExporter(db_mock)
    es_exporter.delete_ds(ds_id='dataset1')

    wait_for_es(sec=1)

    body = {
        'query': {
            'bool': {
                'filter': []
            }
        }
    }
    body['query']['bool']['filter'] = [{'term': {'ds_id': 'dataset1'}}, {'term': {'db_name': 'HMDB'}}]
    assert es.count(index=index, doc_type='annotation', body=body)['count'] == 0
    body['query']['bool']['filter'] = [{'term': {'ds_id': 'dataset1'}}, {'term': {'db_name': 'ChEBI'}}]
    assert es.count(index=index, doc_type='annotation', body=body)['count'] == 0
    body['query']['bool']['filter'] = [{'term': {'ds_id': 'dataset2'}}, {'term': {'db_name': 'HMDB'}}]
    assert es.count(index=index, doc_type='annotation', body=body)['count'] == 1
    body['query']['bool']['filter'] = [{'term': {'ds_id': 'dataset1'}}, {'term': {'_type': 'dataset'}}]
    assert es.count(index=index, doc_type='dataset', body=body)['count'] == 0


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
