import tempfile

from metaspace.sm_annotation_utils import SMInstance
from metaspace.tests.utils import sm


def test_fetch_databases(sm: SMInstance):
    dbs = sm.databases()
    print(dbs)

    assert len(dbs) > 0


def test_fetch_database(sm: SMInstance):
    db = sm.database(name="HMDB", version="v4")
    print(db)

    assert db is not None


MOLDB_NAME, MOLDB_VERSION = "hmdb-small", "v0"


def test_create_database(sm: SMInstance):

    with tempfile.NamedTemporaryFile() as fp:
        lines = [
            b'id\tname\tformula\n',
            b'1\t1 - Methylhistidine\tC7H11N3O2\n',
            b'2\t13 - Diaminopropane\tC3H10N2\n',
        ]
        fp.writelines(lines)
        fp.seek(0)

        data = sm.create_database(fp.name, MOLDB_NAME, MOLDB_VERSION)
        print(data)

    db1 = sm.database(id=data['id'])
    db2 = sm.database(MOLDB_NAME, MOLDB_VERSION)

    assert db1 and db2
    assert db1.id == db2.id


def test_update_database_none(sm: SMInstance):
    moldb = sm.database(MOLDB_NAME, MOLDB_VERSION)

    data = sm.update_database(moldb.id, is_public=None, archived=None)
    print(data)

    moldb_updated = sm.database(MOLDB_NAME, MOLDB_VERSION)
    assert moldb_updated.is_public == moldb.is_public
    assert moldb_updated.archived == moldb.archived


def test_update_database_all(sm: SMInstance):
    moldb = sm.database(MOLDB_NAME, MOLDB_VERSION)

    new_is_public = not moldb.is_public
    new_archived = not moldb.archived
    data = sm.update_database(moldb.id, is_public=new_is_public, archived=new_archived)
    print(data)

    moldb_updated = sm.database(MOLDB_NAME, MOLDB_VERSION)
    assert moldb_updated.is_public == new_is_public
    assert moldb_updated.archived == new_archived


def test_delete_database(sm: SMInstance):
    moldb = sm.database(MOLDB_NAME, MOLDB_VERSION)

    data = sm.delete_database(moldb.id)
    print(data)

    assert sm.database(MOLDB_NAME, MOLDB_VERSION) is None
