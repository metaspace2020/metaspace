import contextlib
import json
from enum import Enum
from unittest.mock import patch

import pytest

from sm.engine.db import DB
from sm.engine.storage import get_s3_client, create_bucket
from sm.rest import api
from sm.rest.databases import MALFORMED_CSV, BAD_DATA
from sm.rest.utils import ALREADY_EXISTS
from .utils import create_test_molecular_db

BUCKET_NAME = 'sm-engine-tests'
GROUP_ID = '123e4567-e89b-12d3-a456-426655440000'
USER_ID = 'ddd0be50-1268-4ae4-9e99-eb73e92a9aeb'
MOLDB_COUNT_SEL = 'SELECT COUNT(*) FROM molecular_db'


@pytest.fixture()
def fill_db(test_db):
    db = DB()
    db.insert(
        'INSERT INTO graphql.user (id, name, email) VALUES (%s, %s, %s)',
        [(USER_ID, 'name', 'name@embl.de')],
    )
    db.insert(
        'INSERT INTO graphql.group (id, name, short_name) VALUES (%s, %s, %s)',
        [(GROUP_ID, 'test-group', 'test-group')],
    )
    db.insert(
        'INSERT INTO graphql.dataset (id, user_id, group_id) VALUES (%s, %s, %s)',
        [('dataset id', USER_ID, GROUP_ID)],
    )

    yield


class MoldbFiles(Enum):
    VALID = 'moldb.csv'
    WRONG_SEP = 'db-wrong-sep.csv'
    MISSING_COL = 'db-missing-columns.csv'
    EMPTY_VALUES = 'db-empty-values.csv'
    WRONG_FORMULAS = 'db-wrong-formulas.csv'


@pytest.fixture(autouse=True, scope='module')
def fill_storage():
    s3_client = get_s3_client()
    create_bucket(BUCKET_NAME, s3_client)

    for file in MoldbFiles:
        s3_client.upload_file(
            Filename=f'tests/data/moldbs/{file.value}', Bucket=BUCKET_NAME, Key=file.value
        )

    yield

    for file in MoldbFiles:
        s3_client.delete_object(Bucket=BUCKET_NAME, Key=file.value)


def moldb_input_doc(**kwargs):
    return {
        'name': 'test-db',
        'version': '2000-01-01',
        'is_public': False,
        'group_id': GROUP_ID,
        'user_id': USER_ID,
        'description': 'Full database description',
        **kwargs,
    }


@contextlib.contextmanager
def patch_bottle_request(req_doc):
    with patch('sm.rest.api.bottle.request') as request_mock:
        request_mock.body.getvalue.return_value = json.dumps(req_doc).encode()
        yield req_doc


@pytest.mark.parametrize('is_public', [True, False])
def test_create_moldb(fill_db, is_public):
    input_doc = moldb_input_doc(
        file_path=f's3://{BUCKET_NAME}/{MoldbFiles.VALID.value}', is_public=is_public
    )
    with patch_bottle_request(input_doc) as input_doc:

        resp = api.databases.create()

        assert resp['status'] == 'success'
        resp_doc = resp['data']

        db = DB()
        doc = db.select_one_with_fields(
            'SELECT id, name, version, group_id, is_public FROM molecular_db where id = %s',
            params=(resp_doc['id'],),
        )
        for field in ['name', 'version', 'group_id', 'is_public']:
            assert doc[field] == input_doc[field]

        docs = db.select_with_fields(
            'SELECT * FROM molecule WHERE moldb_id = %s',
            params=(resp_doc['id'],),
        )
        for doc in docs:
            print(doc)
            for field in ['mol_id', 'mol_name', 'formula', 'inchi']:
                assert field in doc


def test_create_moldb_duplicate(fill_db):
    input_doc = moldb_input_doc(file_path=f's3://{BUCKET_NAME}/{MoldbFiles.VALID.value}')
    with patch_bottle_request(input_doc) as req_doc:
        create_test_molecular_db(**req_doc)

        resp = api.databases.create()

        assert resp['status'] == ALREADY_EXISTS['status']

        (db_count,) = DB().select_one(MOLDB_COUNT_SEL)
        assert db_count == 1


@pytest.mark.parametrize('file', [MoldbFiles.WRONG_SEP, MoldbFiles.MISSING_COL])
def test_create_moldb_malformed_csv(file, fill_db):
    input_doc = moldb_input_doc(file_path=f's3://{BUCKET_NAME}/{file.value}')
    with patch_bottle_request(input_doc):

        resp = api.databases.create()

        assert resp['status'] == MALFORMED_CSV['status']
        assert resp['error']

        db = DB()
        (db_count,) = db.select_one(MOLDB_COUNT_SEL)
        assert db_count == 0


def test_create_moldb_empty_values(fill_db):
    input_doc = moldb_input_doc(file_path=f's3://{BUCKET_NAME}/{MoldbFiles.EMPTY_VALUES.value}')
    with patch_bottle_request(input_doc):

        resp = api.databases.create()

        assert resp['status'] == BAD_DATA['status']
        assert resp['error'] and resp['details']

        db = DB()
        (db_count,) = db.select_one(MOLDB_COUNT_SEL)
        assert db_count == 0


def test_create_moldb_wrong_formulas(fill_db):
    input_doc = moldb_input_doc(file_path=f's3://{BUCKET_NAME}/{MoldbFiles.WRONG_FORMULAS.value}')
    with patch_bottle_request(input_doc):

        resp = api.databases.create()

        assert resp['status'] == BAD_DATA['status']
        assert resp['error'], resp['details']
        for err_row in resp['details']:
            assert all([err_row.get(err_field, None) for err_field in ['line', 'row', 'error']])

        db = DB()
        (db_count,) = db.select_one(MOLDB_COUNT_SEL)
        assert db_count == 0


def test_delete_moldb(fill_db):
    input_doc = moldb_input_doc(file_path=f's3://{BUCKET_NAME}/{MoldbFiles.VALID.value}')
    moldb = create_test_molecular_db(**input_doc)
    with patch_bottle_request(req_doc={}):

        resp = api.databases.delete(moldb_id=moldb.id)

        assert resp['status'] == 'success'

        db = DB()
        (db_count,) = db.select_one(MOLDB_COUNT_SEL)
        assert db_count == 0


@pytest.mark.parametrize('is_public', [True, False])
@pytest.mark.parametrize('archived', [True, False])
def test_update_moldb(archived, is_public, fill_db):
    input_doc = moldb_input_doc(
        file_path=f's3://{BUCKET_NAME}/{MoldbFiles.VALID.value}', archived=False
    )
    moldb = create_test_molecular_db(**input_doc)
    with patch_bottle_request(
        req_doc={
            'archived': archived,
            'is_public': is_public,
            'description': 'New database description',
        }
    ):

        resp = api.databases.update(moldb_id=moldb.id)

        assert resp['status'] == 'success'

        result_doc = DB().select_one_with_fields(
            'SELECT * FROM molecular_db where id = %s',
            params=(moldb.id,),
        )
        assert result_doc['archived'] == archived
        assert result_doc['is_public'] == is_public
        assert result_doc['description'] == 'New database description'
