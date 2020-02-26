import json
from unittest.mock import patch

import pytest

from sm.engine.db import DB
from sm.rest import api

GROUP_ID = '123e4567-e89b-12d3-a456-426655440000'


@pytest.fixture()
def fill_db(test_db):
    db = DB()
    db.insert(
        'INSERT INTO graphql.group (id, name, short_name) VALUES (%s, %s, %s)',
        [(GROUP_ID, 'test-group', 'test-group')],
    )

    yield

    db.alter('TRUNCATE graphql.group CASCADE')


def make_input_doc(**kwargs):
    input_doc = {
        'name': 'test-db',
        'version': '2000-01-01',
        'group_id': GROUP_ID,
        'public': False,
        'file_path': 's3://sm-engine/tests/test-db-2.tsv',
    }
    return {**input_doc, **kwargs}


@patch('sm.rest.api.bottle.request')
def test_create_moldb(request_mock, fill_db):
    input_doc = make_input_doc()
    request_mock.body.getvalue.return_value = json.dumps(input_doc).encode()

    resp = api.create_molecular_database()

    assert resp['status'] == 'success'
    response_doc = resp['data']

    db = DB()
    doc = db.select_one_with_fields(
        'SELECT id, name, version, group_id, public FROM molecular_db where id = %s',
        (response_doc['id'],),
    )
    for field in ['name', 'version', 'group_id', 'public']:
        assert doc[field] == input_doc[field]

    docs = db.select_with_fields(
        'SELECT * FROM molecule WHERE moldb_id = %s', (response_doc['id'],),
    )
    for doc in docs:
        print(doc)
        for field in ['mol_id', 'mol_name', 'formula', 'inchi']:
            assert field in doc


@patch('sm.rest.api.bottle.request')
def test_create_moldb_duplicate(request_mock, fill_db):
    input_doc = make_input_doc()
    request_mock.body.getvalue.return_value = json.dumps(input_doc).encode()

    db = DB()
    db.insert(
        'INSERT INTO molecular_db (name, version, group_id) VALUES (%s, %s, %s)',
        [(input_doc['name'], input_doc['version'], input_doc['group_id'])],
    )

    resp = api.create_molecular_database()

    assert resp['status'] == api.ALREADY_EXISTS['status']

    (db_count,) = db.select_one('SELECT COUNT(*) FROM molecular_db')
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
    input_doc = make_input_doc()
    input_doc['file_path'] = file_path
    request_mock.body.getvalue.return_value = json.dumps(input_doc).encode()

    resp = api.create_molecular_database()

    assert resp['status'] == api.MALFORMED_CSV['status']
    assert resp['errors']

    db = DB()
    (db_count,) = db.select_one('SELECT COUNT(*) FROM molecular_db')
    assert db_count == 0


@patch('sm.rest.api.bottle.request')
def test_create_moldb_wrong_formulas(request_mock, fill_db):
    input_doc = make_input_doc()
    input_doc['file_path'] = 's3://sm-engine/tests/test-db-wrong-formulas.csv'
    request_mock.body.getvalue.return_value = json.dumps(input_doc).encode()

    resp = api.create_molecular_database()

    assert resp['status'] == api.MALFORMED_CSV['status']
    assert resp['errors']
    err_fields = ['line', 'formula', 'error']
    for err_doc in resp['errors']:
        assert all(f in err_doc for f in err_fields)

    db = DB()
    (db_count,) = db.select_one('SELECT COUNT(*) FROM molecular_db')
    assert db_count == 0


@patch('sm.rest.api.bottle.request')
def test_delete_moldb(request_mock, fill_db):
    input_doc = make_input_doc()
    request_mock.body.getvalue.return_value = json.dumps(input_doc).encode()

    db = DB()
    (moldb_id,) = db.insert_return(
        'INSERT INTO molecular_db (name, version, group_id) VALUES (%s, %s, %s) RETURNING id',
        rows=[(input_doc['name'], input_doc['version'], input_doc['group_id'])],
    )

    resp = api.delete_molecular_database(moldb_id)

    assert resp['status'] == 'success'

    db = DB()
    (db_count,) = db.select_one('SELECT COUNT(*) FROM molecular_db')
    assert db_count == 0
