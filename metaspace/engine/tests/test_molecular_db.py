from unittest.mock import patch

from sm.engine.db import DB
from sm.engine import molecular_db


def create_test_database(name, version):
    with patch('sm.engine.molecular_db.read_moldb_file'):
        with patch('sm.engine.molecular_db._import_molecules'):
            return molecular_db.create(name=name, version=version)


def test_create_find_by_id_name(test_db):
    moldb_resp = create_test_database('test_db', 'version')

    moldb_by_id = molecular_db.find_by_id(moldb_resp.id)

    assert moldb_resp.id == moldb_by_id.id
    assert moldb_resp.name == moldb_by_id.name == 'test_db'
    assert moldb_resp.version == moldb_by_id.version == 'version'


def test_update(test_db):
    create_resp = create_test_database('test_db', 'version')
    fields_to_update = dict(
        archived=True,
        description='desc',
        full_name='full name',
        link='http://example.org',
        citation='citation',
    )

    update_resp = molecular_db.update(create_resp.id, **fields_to_update)

    moldb = molecular_db.find_by_id(create_resp.id)
    assert create_resp.id == update_resp.id == moldb.id
    assert create_resp.name == update_resp.name == 'test_db'
    assert create_resp.version == update_resp.version == 'version'

    row = DB().select_one_with_fields(
        'SELECT archived, description, full_name, link, citation FROM molecular_db WHERE id = %s',
        params=(create_resp.id,),
    )
    assert row == fields_to_update


def test_find_by_ids(test_db):
    moldb_name_version_list = [
        ('test_db_1', 'version'),
        ('test_db_2', 'version'),
        ('test_db_2', 'version2'),
    ]
    moldb_resp_list = [
        create_test_database(name, version) for name, version in moldb_name_version_list
    ]

    moldbs_by_ids = molecular_db.find_by_ids([moldb.id for moldb in moldb_resp_list])

    for (name, version), moldb in zip(moldb_name_version_list, moldbs_by_ids):
        assert moldb.name == name
        assert moldb.version == version
