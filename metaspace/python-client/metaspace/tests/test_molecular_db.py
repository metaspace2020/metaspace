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
