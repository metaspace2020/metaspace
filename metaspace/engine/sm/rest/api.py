from __future__ import unicode_literals
import json
from datetime import datetime as dt
from bottle import post, run
from bottle import request as req
from bottle import response as resp

from sm.engine import DB, ESExporter
from sm.engine import DatasetManager, Dataset
from sm.engine.util import SMConfig
from sm.engine.util import init_logger, logger
from sm.engine.errors import UnknownDSID


CONFIG_PATH = 'conf/config.json'

OK = {
    'status': 200,
    'title': 'OK'
}

ERR_OBJECT_NOT_EXISTS = {
    'status': 404,
    'title': 'Object Not Exists'
}


def _create_db_conn():
    SMConfig.set_path(CONFIG_PATH)
    config = SMConfig.get_conf()
    return DB(config['db'])

def _json_params(req):
    b = req.body.getvalue()
    return json.loads(b.decode('utf-8'))


@post('/datasets/add')
def add_ds():
    params = _json_params(req)
    ds = Dataset(params.get('id', None) or dt.now().strftime("%Y-%m-%d_%Hh%Mm%Ss"),
                 params.get('name', None),
                 params.get('input_path'),
                 params.get('metadata', None),
                 params.get('config'))
    db = _create_db_conn()
    ds_man = DatasetManager(db, ESExporter(), mode='queue')
    ds_man.add_ds(ds)
    db.close()
    return OK['title']


@post('/datasets/<ds_id>/update')
def update_ds(ds_id):
    try:
        params = _json_params(req)
        db = _create_db_conn()
        ds = Dataset.load_ds(ds_id, db)
        ds.name = params.get('name', ds.name)
        ds.input_path = params.get('input_path', ds.input_path)
        ds.meta = params.get('metadata', ds.meta)
        ds.config = params.get('config', ds.config)

        ds_man = DatasetManager(db, ESExporter(), mode='queue')
        ds_man.update_ds(ds)
        db.close()
        return OK['title']
    except UnknownDSID:
        resp.status = ERR_OBJECT_NOT_EXISTS['status']
        return ERR_OBJECT_NOT_EXISTS['title']


@post('/datasets/<ds_id>/delete')
def delete_ds(ds_id):
    try:
        params = _json_params(req)
        del_raw = params.get('del_raw', False)

        db = _create_db_conn()
        ds = Dataset.load_ds(ds_id, db)

        ds_man = DatasetManager(db, ESExporter(), mode='queue')
        ds_man.delete_ds(ds, del_raw_data=del_raw)
        db.close()
        return OK['title']
    except UnknownDSID:
        resp.status = ERR_OBJECT_NOT_EXISTS['status']
        return ERR_OBJECT_NOT_EXISTS['title']

if __name__ == '__main__':
    init_logger()
    run(host='localhost', port=5123)
