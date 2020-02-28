import json
from unittest.mock import patch

import pytest

from sm.engine.db import DB
from sm.rest import api
from sm.rest.databases import MALFORMED_CSV
from sm.rest.utils import ALREADY_EXISTS

GROUP_ID = '123e4567-e89b-12d3-a456-426655440000'
MOLDB_COUNT_SEL = 'SELECT COUNT(*) FROM molecular_db'


@pytest.fixture()
def fill_db(test_db):
    db = DB()
    db.insert(
        'INSERT INTO graphql.group (id, name, short_name) VALUES (%s, %s, %s)',
        [(GROUP_ID, 'test-group', 'test-group')],
    )

    yield

    db.alter('TRUNCATE graphql.group CASCADE')


def make_moldb_doc(**kwargs):
    req_doc = {
        'name': 'test-db',
        'version': '2000-01-01',
        'group_id': GROUP_ID,
        'public': False,
        'file_path': 's3://sm-engine/tests/test-db-2.tsv',
        'description': 'Full database description',
    }
    return {**req_doc, **kwargs}


@patch('sm.rest.api.bottle.request')
def test_create_moldb(request_mock, fill_db):
    req_doc = make_moldb_doc()
    request_mock.body.getvalue.return_value = json.dumps(req_doc).encode()

    resp = api.databases.create()

    assert resp['status'] == 'success'
    resp_doc = resp['data']

    db = DB()
    doc = db.select_one_with_fields(
        'SELECT id, name, version, group_id, public FROM molecular_db where id = %s',
        (resp_doc['id'],),
    )
    for field in ['name', 'version', 'group_id', 'public']:
        assert doc[field] == req_doc[field]

    docs = db.select_with_fields('SELECT * FROM molecule WHERE moldb_id = %s', (resp_doc['id'],),)
    for doc in docs:
        print(doc)
        for field in ['mol_id', 'mol_name', 'formula', 'inchi']:
            assert field in doc


@patch('sm.rest.api.bottle.request')
def test_create_moldb_duplicate(request_mock, fill_db):
    req_doc = make_moldb_doc()
    request_mock.body.getvalue.return_value = json.dumps(req_doc).encode()

    db = DB()
    db.insert(
        'INSERT INTO molecular_db (name, version, group_id) VALUES (%s, %s, %s)',
        [(req_doc['name'], req_doc['version'], req_doc['group_id'])],
    )

    resp = api.databases.create()

    assert resp['status'] == ALREADY_EXISTS['status']

    (db_count,) = db.select_one(MOLDB_COUNT_SEL)
    assert db_count == 1


@pytest.mark.parametrize(
    'file_path',
    [
        's3://sm-engine/tests/test-db-wrong-sep.csv',
        's3://sm-engine/tests/test-db-missing-columns.csv',
    ],
)
@patch('sm.rest.api.bottle.request')
def test_create_moldb_malformed_csv(request_mock, file_path, fill_db):
    req_doc = make_moldb_doc()
    req_doc['file_path'] = file_path
    request_mock.body.getvalue.return_value = json.dumps(req_doc).encode()

    resp = api.databases.create()

    assert resp['status'] == MALFORMED_CSV['status']
    assert resp['errors']

    db = DB()
    (db_count,) = db.select_one(MOLDB_COUNT_SEL)
    assert db_count == 0


@patch('sm.rest.api.bottle.request')
def test_create_moldb_wrong_formulas(request_mock, fill_db):
    req_doc = make_moldb_doc()
    req_doc['file_path'] = 's3://sm-engine/tests/test-db-wrong-formulas.csv'
    request_mock.body.getvalue.return_value = json.dumps(req_doc).encode()

    resp = api.databases.create()

    assert resp['status'] == MALFORMED_CSV['status']
    assert resp['errors']
    err_fields = ['line', 'formula', 'error']
    for err_doc in resp['errors']:
        assert all(f in err_doc for f in err_fields)

    db = DB()
    (db_count,) = db.select_one(MOLDB_COUNT_SEL)
    assert db_count == 0


@patch('sm.rest.api.bottle.request')
def test_delete_moldb(request_mock, fill_db):
    req_doc = make_moldb_doc()
    request_mock.body.getvalue.return_value = json.dumps(req_doc).encode()

    db = DB()
    (moldb_id,) = db.insert_return(
        'INSERT INTO molecular_db (name, version, group_id) VALUES (%s, %s, %s) RETURNING id',
        rows=[(req_doc['name'], req_doc['version'], req_doc['group_id'])],
    )

    resp = api.databases.delete(moldb_id)

    assert resp['status'] == 'success'

    db = DB()
    (db_count,) = db.select_one(MOLDB_COUNT_SEL)
    assert db_count == 0


@pytest.mark.parametrize(
    ('archived_before', 'archived_after'), [(False, True), (True, False)],
)
@patch('sm.rest.api.bottle.request')
def test_update_moldb(request_mock, archived_before, archived_after, fill_db):
    doc = make_moldb_doc(archived=archived_before)
    db = DB()
    (moldb_id,) = db.insert_return(
        'INSERT INTO molecular_db (name, version, group_id, archived) '
        'VALUES (%s, %s, %s, %s) RETURNING id',
        rows=[(doc['name'], doc['version'], doc['group_id'], doc['archived'])],
    )

    req_doc = {'archived': archived_after, 'description': 'Database description'}
    request_mock.body.getvalue.return_value = json.dumps(req_doc).encode()

    resp = api.databases.update(moldb_id)

    assert resp['status'] == 'success'

    result_doc = db.select_one_with_fields(
        'SELECT * FROM molecular_db where id = %s', params=(moldb_id,),
    )
    assert result_doc['archived'] == archived_after
    assert result_doc['description'] == 'Database description'
