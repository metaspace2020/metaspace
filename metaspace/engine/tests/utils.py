from datetime import datetime

from sm.engine.db import DB
from sm.engine import molecular_db
from sm.engine.molecular_db import MolecularDB


def create_test_molecular_db(
    name='HMDB', version='v4', group_id=None, created_dt=None, archived=False, **kwargs,
) -> MolecularDB:
    if not created_dt:
        created_dt = datetime.utcnow()

    (moldb_id,) = DB().insert_return(
        'INSERT INTO molecular_db (name, version, created_dt, group_id, archived) '
        'VALUES (%s, %s, %s, %s, %s) RETURNING id',
        rows=[(name, version, created_dt, group_id, archived)],
    )
    return molecular_db.find_by_id(moldb_id)
