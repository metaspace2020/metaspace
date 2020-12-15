from sm.engine.db import ConnectionPool, DB, transaction_context

TABLE_CREATE = 'CREATE TABLE job (id SERIAL NOT NULL, moldb_id integer, ds_id text)'
JOB_INS = 'INSERT INTO job (moldb_id, ds_id) VALUES (%s, %s) RETURNING id'
JOB_SEL = 'SELECT moldb_id, ds_id FROM job WHERE id = %s'


def test_transaction_insert(sm_config, empty_test_db):
    with ConnectionPool(sm_config['db']):
        db = DB()
        db.alter(TABLE_CREATE)

        (job_id,) = db.insert_return(JOB_INS, [(1, '2000-01-01')])

        doc = db.select_one_with_fields(JOB_SEL, (job_id,))
        assert doc == {'moldb_id': 1, 'ds_id': '2000-01-01'}


def test_insert_nested_transaction_commit(sm_config, empty_test_db):
    with ConnectionPool(sm_config['db']):
        db1 = DB()
        db1.alter(TABLE_CREATE)

        with transaction_context():
            (job_id,) = db1.insert_return(JOB_INS, [(1, '2000-01-01')])

        db2 = DB()
        row = db2.select_one(JOB_SEL, (job_id,))
        assert row == (1, '2000-01-01')


def test_insert_nested_transaction_rollback(sm_config, empty_test_db):
    with ConnectionPool(sm_config['db']):
        db1 = DB()
        db1.alter(TABLE_CREATE)

        try:
            with transaction_context():
                (job_id,) = db1.insert_return(JOB_INS, [(1, '2000-01-01')])
                db1.insert_return(JOB_INS, [('wrong_type_id', 1)])
        except:
            pass

        db2 = DB()
        row = db2.select_one(JOB_SEL, (job_id,))
        assert row == []
