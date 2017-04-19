from __future__ import unicode_literals
import json
from datetime import datetime as dt
from bottle import post, run
from bottle import request as req
from bottle import response as resp

from sm.engine import DB, ESExporter
from sm.engine import DatasetManager, Dataset
from sm.engine.util import SMConfig
from sm.engine.util import init_logger
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


@post('/datasets/add')
def add_ds():
    params = json.load(req.body)
    ds = Dataset(params.get('id', None) or dt.now().strftime("%Y-%m-%d_%Hh%Mm%Ss"),
                 params.get('name', None),
                 params.get('input_path'),
                 params.get('metadata', None),
                 params.get('config'))
    ds_man.add_ds(ds)
    return OK['title']


@post('/datasets/<ds_id>/update')
def update_ds(ds_id):
    try:
        params = json.load(req.body)
        ds = Dataset.load_ds(ds_id, db)
        ds.name = params.get('name', ds.name)
        ds.input_path = params.get('input_path', ds.input_path)
        ds.meta = params.get('metadata', ds.meta)
        ds.config = params.get('config', ds.config)
        ds_man.update_ds(ds)
        return OK['title']
    except UnknownDSID:
        resp.status = ERR_OBJECT_NOT_EXISTS['status']
        return ERR_OBJECT_NOT_EXISTS['title']


@post('/datasets/<ds_id>/delete')
def delete_ds(ds_id):
    try:
        params = json.load(req.body)
        del_raw = params.get('del_raw', False)
        ds = Dataset.load_ds(ds_id, db)
        ds_man.delete_ds(ds, del_raw_data=del_raw)
        return OK['title']
    except UnknownDSID:
        resp.status = ERR_OBJECT_NOT_EXISTS['status']
        return ERR_OBJECT_NOT_EXISTS['title']


if __name__ == '__main__':
    init_logger()

    SMConfig.set_path(CONFIG_PATH)
    CONFIG = SMConfig.get_conf()
    db = DB(CONFIG['db'])
    ds_man = DatasetManager(db, ESExporter(), mode='queue')

    run(host='localhost', port=5123)
