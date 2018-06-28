from unittest.mock import patch

from sm.engine import DB
from sm.engine import SearchJob
from sm.engine import Dataset
from sm.engine.tests.util import test_db, sm_config


@patch('sm.engine.search_job.MolDBServiceWrapper.find_db_by_name_version')
def test_prepare_moldb_list_returns_correct_list(find_db_by_name_version, sm_config, test_db):
    find_db_by_name_version.side_effect = [[{'id': 0, 'name': 'HMDB'}], [{'id': 1, 'name': 'ChEBI'}]]
    ds = Dataset(id='ds_id', config={'databases': [{'name': 'HMDB'}, {'name': 'ChEBI'}]})
    db = DB(sm_config['db'])
    try:
        db.insert('INSERT INTO dataset (id) values(%s)', rows=[('ds_id',)])
        db.insert('INSERT INTO job (id, db_id, ds_id) values(%s, %s, %s)', rows=[(10, 0, 'ds_id')])

        search_job = SearchJob()
        search_job._ds = ds
        search_job._db = db
        moldb_id_list = search_job.prepare_moldb_id_list()

        assert moldb_id_list == [1]
    finally:
        db.close()
